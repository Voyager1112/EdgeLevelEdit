// ============================================================
//  多项目管理：弹窗界面 + 切换/删除/副本/导出..
// ============================================================
(function () {
'use strict';

const PROJECTS_KEY = 'edge_xml_editor_projects';
const CURRENT_PID_KEY = 'edge_xml_editor_current_pid';

// ---------- 存储层 ----------
function loadProjectStore() {
    try {
        const raw = localStorage.getItem(PROJECTS_KEY);
        return raw ? JSON.parse(raw) : { projects: [] };
    } catch { return { projects: [] }; }
}
function saveProjectStore(store) {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(store));
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
// 用编辑器现有的 _serializeHistory / generateXMLString
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
    const pid = getCurrentProjectId();
    if (!pid) return;
    const store = loadProjectStore();
    const proj = store.projects.find(p => p.id === pid);
    if (!proj) return;
    const data = captureCurrentData();
    if (!data) return;
    proj.data = data;
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
        data: data || null,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    store.projects.push(proj);
    saveProjectStore(store);
    return id;
}

function switchProject(id) {
    if (!id) return;
    if (id === getCurrentProjectId()) return;

    // 1. 保存当前项目数据到存储
    saveCurrentToProject();

    // 2. 加载目标项目
    const store = loadProjectStore();
    const proj = store.projects.find(p => p.id === id);
    if (!proj) return;

    // 3. 恢复编辑状态（restoreData 内部会走 _restoreHistory，
    //    它会 syncLevelUI + requestRender + updatePanel + updateElemList + updateStatus）
    if (proj.data) {
        restoreData(proj.data);
    } else {
        if (typeof newProject === 'function') newProject();
    }

    // 4. 切换当前项目 ID
    setCurrentProjectId(id);

    // 5. ★ 关键：重置撤销/重做历史
    //    跨项目的撤销没有意义，切换后清空即可
    state._undoStack = [];
    state._redoStack = [];
    state._lastSavedSnapshot = _serializeHistory();

    // 6. 只存盘，不要走 uniInterface（避免误 push undo）
    saveCache();

    // 7. UI 提示
    showToast(`已切换到项目：${proj.name || '(未命名)'}`);
}

async function exportProjectZip(id) {
    const store = loadProjectStore();
    const proj = store.projects.find(p => p.id === id);
    if (!proj) return;
    // 若导出当前项目，先把 state 写回
    if (id === getCurrentProjectId()) saveCurrentToProject();
    const fresh = loadProjectStore().projects.find(p => p.id === id);
    if (!fresh || !fresh.data) { showToast('项目为空，无可导出内容'); return; }

    if (typeof JSZip === 'undefined') { showToast('JSZip 未加载'); return; }

    const data = fresh.data;
    const baseName = (data.level && data.level.name) || fresh.name || 'project';
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
    store.projects.splice(idx, 1);
    saveProjectStore(store);
    if (getCurrentProjectId() === id) {
        // 切到剩下的第一个，或清空
        const next = store.projects[0];
        if (next) {
            setCurrentProjectId(next.id);
            if (next.data) restoreData(next.data);
            else if (typeof newProject === 'function') newProject();
        } else {
            setCurrentProjectId(null);
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
        list.innerHTML = '<div style="color:#5a7a9a; padding:30px; text-align:center;">暂无项目，点击右上角「+ 新建项目」</div>';
        return;
    }

    let html = '';
    store.projects.forEach(p => {
        const isCur = p.id === curId;
        const tag = getProjectTag(p);
        const lvName = (p.data && p.data.level && p.data.level.name) || '(空)';
        const lvId = (p.data && p.data.level && p.data.level.id) || '-';
        html += `
            <div class="pm-item" style="
                display:flex; align-items:center; gap:12px;
                padding:10px 12px; margin-bottom:6px;
                background:${isCur ? '#1a3a5a' : '#0f1a2a'};
                border:1px solid ${isCur ? '#4fc3f7' : '#1a4a7a'};
                border-radius:6px; cursor:pointer;
            " onclick="PM.switch('${p.id}')">
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:bold; color:${isCur ? '#4fc3f7' : '#eee'};">
                        ${escapeHtml(lvName)} ${isCur ? '（当前）' : ''}
                    </div>
                    <div style="font-size:11px; color:#8aaccc; margin-top:2px;">
                        ID: ${escapeHtml(String(lvId))} · 标识: ${tag}
                    </div>
                </div>
                <div style="display:flex; gap:6px;" onclick="event.stopPropagation();">
                    <button onclick="PM.duplicate('${p.id}')" title="创建副本"
                        style="background:#1a4a7a;border:1px solid #2a5a8a;color:#eee;
                               padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;
                               width:auto; display:inline-block; margin:0; flex-shrink:0;">📋 副本</button>
                    <button onclick="PM.exportZip('${p.id}')" title="导出 ZIP"
                        style="background:#1a4a7a;border:1px solid #2a5a8a;color:#eee;
                               padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;
                               width:auto; display:inline-block; margin:0; flex-shrink:0;">⬇ ZIP</button>
                    <button onclick="PM.remove('${p.id}')" title="删除"
                        style="background:#a03030;border:1px solid #c04040;color:#fff;
                               padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;
                               width:auto; display:inline-block; margin:0; flex-shrink:0;">🗑 删除</button>
                </div>
            </div>
        `;
    });
    list.innerHTML = html;
}

function openProjectManager() {
    let dlg = document.getElementById('projectManagerDialog');
    if (!dlg) {
        dlg = document.createElement('div');
        dlg.id = 'projectManagerDialog';
        dlg.className = 'select-dialog';
        dlg.style.display = 'none';
        dlg.innerHTML = `
            <div class="dialog-box" style="min-width:560px; max-width:92vw;">
                <div style="display:flex; justify-content:space-between; align-items:center;
                            margin-bottom:12px; gap:8px;">
                    <h4 style="margin:0; white-space:nowrap; flex-shrink:0;">📁 项目管理</h4>
                    <button id="pmCreateBtn"
                        style="background:#14532d;border:1px solid #22c55e;color:#86efac;
                               padding:4px 14px;border-radius:4px;cursor:pointer;
                               width:auto; display:inline-block; margin:0; flex-shrink:0;">
                        + 新建项目
                    </button>
                </div>
                <div id="pmList" style="max-height:60vh; overflow-y:auto;"></div>
                <div style="text-align:right; margin-top:12px;">
                    <button class="cancel-btn" onclick="PM.close()"
                        style="width:auto; display:inline-block; margin:0;">
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

function createNewProjectFromUI() {
    const n = prompt('新项目名：', '新项目');
    if (n === null) return;
    // 保存当前项目
    saveCurrentToProject();
    const id = createProject(n);
    setCurrentProjectId(id);
    // 编辑器重置为空
    if (typeof newProject === 'function') newProject();
    showToast(`已创建项目：${n}`);
    renderProjectList();
}

function duplicateProjectFromUI(id) {
    const store = loadProjectStore();
    const src = store.projects.find(p => p.id === id);
    if (!src) return;
    // 如果复制的是当前项目，先保存
    if (id === getCurrentProjectId()) saveCurrentToProject();
    const fresh = loadProjectStore().projects.find(p => p.id === id);
    const copyId = createProject((fresh.name || '项目') + ' - 副本',
        fresh.data ? JSON.parse(JSON.stringify(fresh.data)) : null);
    showToast('已创建副本');
    renderProjectList();
    return copyId;
}

// ---------- 对外接口 ----------
window.PM = {
    open: openProjectManager,
    close: closeProjectManager,
    switch(id) { switchProject(id); renderProjectList(); },
    remove(id) { deleteProject(id); renderProjectList(); },
    duplicate(id) { duplicateProjectFromUI(id); },
    exportZip(id) { exportProjectZip(id); },
    sync() { saveCurrentToProject(); },

    // ★ 新增：供其它模块（loadXMLAndPNG 等）调用
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