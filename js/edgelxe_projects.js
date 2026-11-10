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
        return JSON.parse(_serializeHistory());
    } catch { return null; }
}

function restoreData(data) {
    if (!data) return;
    _restoreHistory(JSON.stringify(data));
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

    // ★ 1. 切换开始前：立刻清空历史，并进入静默模式（防止内部函数触发 Undo 记录）
    state._suppressUndo = true;
    state._undoStack = [];
    state._redoStack = [];

    // 2. 保存当前项目数据到独立存储
    saveCurrentToProject();

    // 3. 切换 ID
    setCurrentProjectId(id);

    // 4. 读取新项目的数据
    const data = loadProjectData(id);
    if (data) {
        restoreData(data);
    } else {
        if (typeof newProject === 'function') newProject();
    }

    // ★ 5. 数据加载完毕：恢复非静默模式，并将当前状态设为基线
    state._suppressUndo = false;
    state._lastSavedSnapshot = _serializeHistory();

    // ★ 6. 最后再同步保存一次缓存（此时不会产生新撤销）
    if (typeof saveCache === 'function') saveCache();

    // 7. UI 提示
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
            <div class="dialog-box" style="min-width:560px; max-width:92vw; padding: 16px;">
                <div style="display:flex; justify-content:space-between; align-items:center;
                            margin-bottom:12px; gap:8px;">
                    <h4 style="margin:0; white-space:nowrap; flex-shrink:0;">📁 项目管理</h4>
                    <!-- ★ 加上 width:auto; flex-shrink:0; 保证按钮不会拉伸 -->
                    <button id="pmCreateBtn" class="primary" style="width: auto; display: inline-block; flex-shrink: 0; padding:4px 14px;">
                        + 新建项目
                    </button>
                </div>
                <div id="pmList" style="max-height:60vh; overflow-y:auto;"></div>
                <div style="text-align:right; margin-top:12px;">
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