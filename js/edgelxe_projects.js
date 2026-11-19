// ============================================================
//  多项目管理：弹窗界面 + 切换/删除/副本/导出..
// ============================================================
(function () {
'use strict';

const PROJECTS_KEY = 'edge_xml_editor_projects';
const CURRENT_PID_KEY = 'edge_xml_editor_current_pid';
const PROJECT_DATA_PREFIX = 'edge_proj_data_';

// ---------- 存储层 ----------
function loadProjectStore() {
    try {
        const raw = localStorage.getItem(PROJECTS_KEY);
        if (!raw) return { projects: [] };
        const store = JSON.parse(raw);
        
        // 兼容旧版：如果项目列表里带有 data，将其独立迁移
        if (store.projects) {
            let migrated = false;
            store.projects.forEach(p => {
                if (p.data) {
                    try {
                        localStorage.setItem(PROJECT_DATA_PREFIX + p.id, JSON.stringify(p.data));
                    } catch (e) {
                        console.error('迁移项目数据失败', e);
                    }
                    delete p.data;
                    migrated = true;
                }
            });
            if (migrated) saveProjectStore(store);
        }
        return store;
    } catch { return { projects: [] }; }
}

function saveProjectStore(store) {
    try {
        localStorage.setItem(PROJECTS_KEY, JSON.stringify(store));
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            showToast('⚠️ 存储空间已满！请打开项目管理删除不需要的旧项目。');
        } else {
            console.error(e);
        }
    }
}

function saveProjectData(pid, data) {
    if (!pid) return false;
    try {
        // ★ 压缩后再存入
        const compressed = compressDataForStorage(data);
        localStorage.setItem(PROJECT_DATA_PREFIX + pid, JSON.stringify(compressed));
        return true;
    } catch (e) {
        console.error(e);
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            showToast('⚠️ 存储空间已满！当前关卡过大，保存多项目副本失败。请清理旧项目。');
        }
        return false;
    }
}

function loadProjectData(pid) {
    if (!pid) return null;
    try {
        const raw = localStorage.getItem(PROJECT_DATA_PREFIX + pid);
        if (!raw) return null;
        let data = JSON.parse(raw);
        // ★ 解压后再返回
        data = decompressDataFromStorage(data);
        return data;
    } catch { return null; }
}

function deleteProjectData(pid) {
    if (!pid) return;
    localStorage.removeItem(PROJECT_DATA_PREFIX + pid);
}

function getCurrentProjectId() {
    return localStorage.getItem(CURRENT_PID_KEY) || null;
}

function setCurrentProjectId(id) {
    if (id) localStorage.setItem(CURRENT_PID_KEY, id);
    else localStorage.removeItem(CURRENT_PID_KEY);
}

function nextSeq(store) {
    return (store.projects.reduce((m, p) => Math.max(m, p.seq || 0), 0)) + 1;
}

// 项目标识码：MMDD-序数
function getProjectTag(proj) {
    const d = new Date(proj.createdAt || Date.now());
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${mm}${dd}-${proj.seq || 0}`;
}

// ---------- 序列化 / 反序列化 ----------
function captureCurrentData() {
    try {
        return _cloneDeep({
            level: state.level,
            currentLayer: state.currentLayer,
            staticBlocks: state.staticBlocks,
            movingPlatforms: state.movingPlatforms,
            fallingPlatforms: state.fallingPlatforms,
            prisms: state.prisms,
            resizers: state.resizers,
            bumpers: state.bumpers,
            checkpoints: state.checkpoints,
            cameraTriggers: state.cameraTriggers,
            buttons: state.buttons,
            buttonSequences: state.buttonSequences,
            otherCubes: state.otherCubes,
            darkCubes: state.darkCubes,
            unknownElements: state.unknownElements,
            nextIdCounter: state.nextIdCounter,
            _idCounters: state._idCounters,
            drawMode: state.drawMode,
            staticColor: state.staticColor,
            visibility: state.visibility,
            levelUseAngle: state.levelUseAngle,
            autoName: state.autoName,
            keepPrevProps: state.keepPrevProps,
            canvasEditMode: state.canvasEditMode,
            //settings: state.settings,
        });
    } catch (e) {
        console.warn('captureCurrentData 失败', e);
        return null;
    }
}

function restoreData(data) {
    if (!data) return;

    // 只复制业务字段，避免内部字段被意外覆盖
    if (data.level) state.level = data.level;
    if (data.currentLayer !== undefined) state.currentLayer = data.currentLayer;
    if (data.staticBlocks) state.staticBlocks = data.staticBlocks;
    state.movingPlatforms   = data.movingPlatforms   || [];
    state.fallingPlatforms  = data.fallingPlatforms  || [];
    state.prisms            = data.prisms            || [];
    state.resizers          = data.resizers          || [];
    state.bumpers           = data.bumpers           || [];
    state.checkpoints       = data.checkpoints       || [];
    state.cameraTriggers    = data.cameraTriggers    || [];
    state.buttons           = data.buttons           || [];
    state.buttonSequences   = data.buttonSequences   || [];
    state.otherCubes        = data.otherCubes        || [];
    state.darkCubes         = data.darkCubes         || [];
    state.unknownElements   = data.unknownElements   || [];
    if (data.nextIdCounter !== undefined) state.nextIdCounter = data.nextIdCounter;
    if (data._idCounters)                 state._idCounters   = data._idCounters;
    if (data.drawMode !== undefined)      state.drawMode      = data.drawMode;
    if (data.staticColor !== undefined)   state.staticColor   = data.staticColor;
    if (data.visibility)                  state.visibility    = data.visibility;
    if (data.levelUseAngle !== undefined) state.levelUseAngle = data.levelUseAngle;
    if (data.autoName !== undefined)      state.autoName      = data.autoName;
    if (data.keepPrevProps !== undefined) state.keepPrevProps = data.keepPrevProps;
    if (data.canvasEditMode !== undefined)state.canvasEditMode= data.canvasEditMode;
    //if (data.settings)                    state.settings      = data.settings;

    // 索引全量重建（数组引用都换了）
    rebuildSpatialIndex();
    _recalcStaticCounts();

    // 切换项目后同步复选框 UI （restoreData 里，rebuildSpatialIndex() 之后)
    if (typeof syncVisibilityUI === 'function') syncVisibilityUI();
    if (typeof _syncToolbarCheckboxes === 'function') _syncToolbarCheckboxes();

    // 画布范围
    updateCanvasRangeFromSize();
    const z = state.currentLayer;
    if (typeof z === 'number' && !isNaN(z)) {
        if (z < state.canvasRange.minZ) state.canvasRange.minZ = z;
        if (z > state.canvasRange.maxZ) state.canvasRange.maxZ = z;
    }
    updateLayerMax();

    // 3D / 选中态清理
    state.highlightedMesh = null;
    state.selected3D = null;
    //if (typeof threeScene !== 'undefined' && threeScene) clear3DScene();
    _validateSelectedElement();

    // ★ 数据全变了：撤销栈清空、session 标记清空
    state._undoStack = [];
    state._redoStack = [];
    state._sessionMarker = null;

    // ★ 缓存全量标脏
    //if (typeof _markAllDirty === 'function') _markAllDirty();

    if (typeof _syncToolbarCheckboxes === 'function') _syncToolbarCheckboxes();

    if (typeof window._markStatic3DDirty === 'function') window._markStatic3DDirty();
    if (typeof _markAllDirty === 'function') _markAllDirty();
    if (typeof threeScene !== 'undefined' && threeScene) {
        if (typeof clear3DScene === 'function') clear3DScene();
    }

    // 界面刷新
    syncLevelUI();
    requestRender();
    updatePanel();
    updateElemList();
    updateStatus();
}

// 把某个项目的 data 转成 XML 字符串（临时替换 state）
function dataToXml(data) {
    if (!data) return '';
    const keys = Object.keys(data);
    const backup = {};
    keys.forEach(k => { backup[k] = state[k]; state[k] = data[k]; });
    let xml = '';
    try {
        xml = generateXMLString();
    } finally {
        keys.forEach(k => { state[k] = backup[k]; });
    }
    return xml;
}

// ---------- 核心操作 ----------
function saveCurrentToProject() {
    // ★ 大项目不参与多项目管理，避免爆内存
    if (state._isLargeProject) return;

    const pid = getCurrentProjectId();
    if (!pid) return;
    const data = captureCurrentData();
    if (!data) return;
    
    const store = loadProjectStore();
    const proj = store.projects.find(p => p.id === pid);
    if (!proj) return;
    
    // 保存独立的完整项目数据
    const ok = saveProjectData(pid, data);
    if (!ok) return; // 失败就不更新元数据了，避免进度不一致

    // 更新元数据
    proj.name = (data.level && data.level.name) || proj.name;
    proj.updatedAt = Date.now();
    saveProjectStore(store);
}

function createProject(name, data) {
    const store = loadProjectStore();
    const id = 'p' + Date.now() + Math.random().toString(36).slice(2, 6);
    const proj = {
        id,
        seq: nextSeq(store),
        name: name || ('项目' + (store.projects.length + 1)),
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    store.projects.push(proj);
    saveProjectStore(store);
    
    if (data) {
        saveProjectData(id, data);
    }
    return id;
}

function switchProject(id) {
    if (!id) return;
    if (id === getCurrentProjectId()) return;

    const prevSuppressUndo = state._suppressUndo;
    state._suppressUndo = true;
    try {
        state._undoStack = [];
        state._redoStack = [];
        saveCurrentToProject();
        setCurrentProjectId(id);
        const data = loadProjectData(id);
        if (data) restoreData(data);
        else if (typeof newProject === 'function') newProject();
    } finally {
        state._suppressUndo = prevSuppressUndo;     // ★ 保证复位
    }

    if (typeof saveCache === 'function') saveCache();

    const store = loadProjectStore();
    const proj = store.projects.find(p => p.id === id);
    showToast(`已切换到项目：${proj ? (proj.name || '(未命名)') : '(未命名)'}`);
}

async function exportProjectZip(id) {
    if (id === getCurrentProjectId()) saveCurrentToProject();
    const data = loadProjectData(id);
    if (!data) { showToast('项目为空，无可导出内容'); return; }

    if (typeof JSZip === 'undefined') { showToast('JSZip 未加载'); return; }

    const store = loadProjectStore();
    const proj = store.projects.find(p => p.id === id);
    const baseName = (data.level && data.level.name) || (proj && proj.name) || 'project';
    const zip = new JSZip();

    // XML
    const xmlString = dataToXml(data);
    zip.file(`${baseName}.xml`, xmlString);

    // PNG
    const { w, l, h } = data.level.size;
    for (let z = 0; z < h; z++) {
        const layer = data.staticBlocks && data.staticBlocks[z];
        if (!layer) continue;
        let hasBlock = false;
        for (let y = 0; y < l && !hasBlock; y++)
            for (let x = 0; x < w; x++)
                if (layer[y] && layer[y][x]) { hasBlock = true; break; }
        if (!hasBlock) continue;

        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = l;
        const ctx = canvas.getContext('2d');
        const img = ctx.createImageData(w, l);
        for (let y = 0; y < l; y++) {
            for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 4;
                const b = layer[y] && layer[y][x];
                if (b) {
                    img.data[idx] = b.r; img.data[idx + 1] = b.g; img.data[idx + 2] = b.b; img.data[idx + 3] = 255;
                } else {
                    img.data[idx] = 0; img.data[idx + 1] = 0; img.data[idx + 2] = 0; img.data[idx + 3] = 255;
                }
            }
        }
        ctx.putImageData(img, 0, 0);
        const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
        zip.file(`${baseName}.${z}.png`, blob);
    }

    const content = await zip.generateAsync({ type: 'blob' });
    downloadFile(content, `${baseName}.zip`);
    showToast(`已导出：${baseName}.zip`);
}

function deleteProject(id) {
    const store = loadProjectStore();
    const idx = store.projects.findIndex(p => p.id === id);
    if (idx < 0) return;
    if (!confirm(`确定删除项目「${store.projects[idx].name || '(未命名)'}」？`)) return;
    
    // 删除数据和元数据
    deleteProjectData(id);
    store.projects.splice(idx, 1);
    saveProjectStore(store);
    
    if (getCurrentProjectId() === id) {
        const next = store.projects[0];
        if (next) {
            switchProject(next.id);
        } else {
            setCurrentProjectId(null);
            if (typeof newProject === 'function') newProject();
        }
    }
    showToast('已删除项目');
}

// ---------- 弹窗 UI ----------
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderProjectList() {
    const list = document.getElementById('pmList');
    if (!list) return;
    const store = loadProjectStore();
    const curId = getCurrentProjectId();

    if (store.projects.length === 0) {
        list.innerHTML = '<div style="color:var(--text-faint); padding:30px; text-align:center;">暂无项目，点击右上角「+ 新建项目」</div>';
        return;
    }

    let html = '';
    store.projects.forEach(p => {
        const isCur = p.id === curId;
        const tag = getProjectTag(p);
        
        let lvName = p.name || '(未命名)';
        let lvId = '-';
        if (!isCur) {
            const d = loadProjectData(p.id);
            if (d && d.level) {
                lvName = d.level.name || lvName;
                lvId = d.level.id || '-';
            }
        } else {
            lvName = state.level.name || lvName;
            lvId = state.level.id || '-';
        }

        // ★ 按钮加上 width:auto 防止被全局样式撑满
        html += `
            <div class="pm-item" style="
                display:flex; align-items:center; gap:12px;
                padding:10px 12px; margin-bottom:6px;
                background:${isCur ? 'var(--accent-soft)' : 'var(--bg-panel)'};
                border:1px solid ${isCur ? 'var(--accent)' : 'var(--border-strong)'};
                border-radius:0; cursor:pointer;
            " onclick="PM.switch('${p.id}')">
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:bold; color:${isCur ? 'var(--accent)' : 'var(--text)'};">
                        ${escapeHtml(lvName)} ${isCur ? '（当前）' : ''}
                    </div>
                    <div style="font-size:11px; color:var(--text-dim); margin-top:2px;">
                        ID: ${escapeHtml(String(lvId))} · 标识: ${tag}
                    </div>
                </div>
                <div style="display:flex; gap:6px;" onclick="event.stopPropagation();">
                    <button onclick="PM.duplicate('${p.id}')" title="创建副本" class="btn-sm" style="width: auto; display: inline-block; flex-shrink: 0;">📋 副本</button>
                    <button onclick="PM.exportZip('${p.id}')" title="导出 ZIP" class="btn-sm" style="width: auto; display: inline-block; flex-shrink: 0;">⬇ ZIP</button>
                    <button onclick="PM.remove('${p.id}')" title="删除" class="btn-sm btn-danger" style="width: auto; display: inline-block; flex-shrink: 0;">🗑 删除</button>
                </div>
            </div>
        `;
    });
    list.innerHTML = html;
}

function openProjectManager() {
    if (window.PM && window.PM.sync) window.PM.sync();

    let dlg = document.getElementById('projectManagerDialog');
    if (!dlg) {
        dlg = document.createElement('div');
        dlg.id = 'projectManagerDialog';
        dlg.className = 'select-dialog';
        dlg.style.display = 'none';
        dlg.innerHTML = `
            <div class="dialog-box" style="width: 90vw; max-width: 800px; max-height: 85vh; display: flex; flex-direction: column; padding: 16px;">
                <div style="display:flex; justify-content:space-between; align-items:center;
                            margin-bottom:12px; gap:8px;">
                    <h4 style="margin:0; white-space:nowrap; flex-shrink:0;">📁 项目管理</h4>
                    <button id="pmCreateBtn" class="primary" style="width: auto; display: inline-block; flex-shrink: 0; padding:4px 14px;">
                        + 新建项目
                    </button>
                </div>
                <div id="pmList" style="flex: 1; overflow-y: auto; min-height: 200px;"></div>
                <div style="text-align:right; margin-top:12px; flex-shrink: 0;">
                    <button class="cancel-btn" onclick="PM.close()" style="width:auto; display:inline-block; margin:0; flex-shrink: 0;">
                        关闭
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(dlg);
        dlg.addEventListener('click', e => { if (e.target === dlg) closeProjectManager(); });
        document.getElementById('pmCreateBtn').addEventListener('click', createNewProjectFromUI);
        if (typeof fixFormFieldAssociations === 'function') fixFormFieldAssociations(dlg);
    }
    dlg.style.display = 'flex';
    dlg.classList.add('active');
    renderProjectList();
}

function closeProjectManager() {
    const dlg = document.getElementById('projectManagerDialog');
    if (dlg) { dlg.style.display = 'none'; dlg.classList.remove('active'); }
}

/*function createNewProjectFromUI() {
    const n = prompt('新项目名：', '新项目');
    if (n === null) return;
    
    saveCurrentToProject(); // 保存旧的
    const id = createProject(n);
    setCurrentProjectId(id); // 切过去
    if (typeof newProject === 'function') newProject();
    
    showToast(`已创建项目：${n}`);
    renderProjectList();
}*/

async function createNewProjectFromUI() {
    // ★ 替换原来的 prompt
    const n = await window.showCustomPrompt('新项目名：', '新项目');
    if (n === null) return;
    
    saveCurrentToProject(); // 保存旧的
    const id = createProject(n);
    setCurrentProjectId(id); // 切过去
    if (typeof newProject === 'function') newProject();
    
    showToast(`已创建项目：${n}`);
    renderProjectList();
}

function duplicateProjectFromUI(id) {
    if (id === getCurrentProjectId()) saveCurrentToProject();
    
    const store = loadProjectStore();
    const src = store.projects.find(p => p.id === id);
    if (!src) return;
    
    const data = loadProjectData(id);
    const copyId = createProject((src.name || '项目') + ' - 副本', data);
    
    if (copyId) {
        showToast('已创建副本');
        renderProjectList();
    }
}

// 监听页面关闭，确保数据落盘
window.addEventListener('beforeunload', () => {
    if (window.PM && window.PM.sync) window.PM.sync();
});

window.addEventListener('beforeunload', (e) => {
    // 如果是大项目，弹出浏览器原生提示，防止用户直接关掉网页
    if (state._isLargeProject) {
        e.preventDefault();
        e.returnValue = '当前关卡过大，尚未保存到本地。确定要离开并丢失数据吗？';
        return e.returnValue;
    }
    
    // ★ 如果有未保存的改动，且关闭了实时保存，拦截提示
    if (state.settings.autoSave === false && state._hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '有未保存的修改，确定要关闭页面吗？';
        return e.returnValue;
    }
    
    if (window.PM && window.PM.sync) window.PM.sync();
});
// ---------- 对外接口 ----------
window.PM = {
    open: openProjectManager,
    close: closeProjectManager,
    switch(id) { switchProject(id); renderProjectList(); },
    remove(id) { deleteProject(id); renderProjectList(); },
    duplicate(id) { duplicateProjectFromUI(id); },
    exportZip(id) { exportProjectZip(id); },
    sync() { saveCurrentToProject(); },
    
    captureCurrentData,
    createProject,
    setCurrentProjectId,
    getCurrentProjectId,
    saveCurrentToProject,
    switchProject,
    deleteProject,
    loadStore: loadProjectStore,
    saveStore: saveProjectStore,
};

})();