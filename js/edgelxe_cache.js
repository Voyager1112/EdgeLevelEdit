let _saveTimer = null;

const CACHE_V3_META = 'edge_xml_editor_v3_meta';
const CACHE_V3_LAYER = 'edge_xml_editor_v3_layer_';
const CACHE_V3_ARR = 'edge_xml_editor_v3_';

function saveCache() {
  if (state._suppressUI || state._isLargeProject) return;
  if (state.settings.autoSave === false) { state._hasUnsavedChanges = true; return; }
  const interval = state.settings.autoSaveInterval || 0;
  if (interval > 0) {
    if (_saveTimer) clearTimeout(_saveTimer);
    state._hasUnsavedChanges = true;
    _saveTimer = setTimeout(() => { doRealSaveCache(); state._hasUnsavedChanges = false; }, interval * 1000);
  } else {
    doRealSaveCache(); state._hasUnsavedChanges = false;
  }
}

function doRealSaveCache() {
  try {
    const dirty = new Set(_dirtyKeys);
    _dirtyKeys.clear();
    // 若脏集为空，尝试补上所有旧 v3 key（首次迁移或极端情况）
    if (dirty.size === 0) return;

    // meta
    if (dirty.has('meta')) {
      const meta = {
        _v: 3,
        level: state.level, currentLayer: state.currentLayer,
        settings: state.settings, visibility: state.visibility,
        drawMode: state.drawMode, staticColor: state.staticColor,
        autoName: state.autoName, keepPrevProps: state.keepPrevProps,
        canvasEditMode: state.canvasEditMode, levelUseAngle: state.levelUseAngle,
        _idCounters: state._idCounters, nextIdCounter: state.nextIdCounter,
        unknownElements: state.unknownElements
      };
      localStorage.setItem(CACHE_V3_META, JSON.stringify(meta));
    }

    // 每层静态方块（调色板压缩格式 { palette, entries }）
    for (const key of dirty) {
        if (key.startsWith('layer_')) {
            const z = key.slice(6);
            const layer = state.staticBlocks[z];
            if (!layer) {
                localStorage.removeItem(CACHE_V3_LAYER + z);
                continue;
            }
            const packed = compressLayerForStorage(layer, state.level.size.w, state.level.size.l);
            if (packed.entries.length === 0) {
                localStorage.removeItem(CACHE_V3_LAYER + z);
            } else {
                localStorage.setItem(CACHE_V3_LAYER + z, JSON.stringify(packed));
            }
        }
    }

    // 各类型数组
    const arrMap = {
      moving: 'movingPlatforms', falling: 'fallingPlatforms', prism: 'prisms',
      resizer: 'resizers', bumper: 'bumpers', checkpoint: 'checkpoints',
      cameratrigger: 'cameraTriggers', button: 'buttons',
      buttonSequence: 'buttonSequences', othercube: 'otherCubes',
      darkcube: 'darkCubes', unknown: 'unknownElements'
    };
    for (const [dirtyName, stateKey] of Object.entries(arrMap)) {
      if (dirty.has(dirtyName)) {
        localStorage.setItem(CACHE_V3_ARR + dirtyName, JSON.stringify(state[stateKey]));
      }
    }
    // saveCache 顺带把 rebuildSpatialIndex 摘掉（增量已维护）
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) triggerLargeProjectMode();
    else console.warn('保存失败', e);
  }
}

// ★ 触发大项目模式的函数
function triggerLargeProjectMode() {
    if (state._isLargeProject) return;
    
    state._isLargeProject = true;
    
    localStorage.removeItem(CACHE_KEY);
    if (window.PM) {
        localStorage.removeItem('edge_proj_data_' + window.PM.getCurrentProjectId());
    }
    
    if (!document.getElementById('largeProjectWarning')) {
        const warnEl = document.createElement('div');
        warnEl.id = 'largeProjectWarning';
        warnEl.style.cssText = `
            position: fixed; bottom: 0; left: 0; width: 100%; z-index: 99999;
            background: #a03030; color: #fff; text-align: center;
            padding: 8px; font-weight: bold; font-size: 13px;
            box-shadow: 0 -2px 10px rgba(0,0,0,0.5);
            display: flex; justify-content: center; align-items: center; gap: 12px;
        `;
        warnEl.innerHTML = `
            <span>⚠️ 当前关卡过大，已切换为「纯内存模式」，刷新页面将丢失数据！请及时点击「导出ZIP」备份。</span>
            <button onclick="this.parentElement.remove()" style="background:#fff; color:#a03030; border:none; padding:2px 8px; border-radius:3px; cursor:pointer; font-size:12px; font-weight:bold;">关闭</button>
        `;
        document.body.appendChild(warnEl);
    }
    
    showToast('⚠️ 关卡超出浏览器存储上限，本次编辑将不会自动保存，请务必导出！');
}

/*function refreshElemList() {
    if (!window._pendingElemListRefresh) {
        window._pendingElemListRefresh = true;
        requestAnimationFrame(() => {
            window._pendingElemListRefresh = false;
            if (typeof updateElemList === 'function') updateElemList();
        });
    }
}*/

function refreshElemList() {
    // session 期间不刷新，session 结束统一刷
    if (state._brushSessionActive || state._addSessionActive) {
        window._elemListDirty = true;
        return;
    }
    if (!window._pendingElemListRefresh) {
        window._pendingElemListRefresh = true;
        requestAnimationFrame(() => {
            window._pendingElemListRefresh = false;
            window._elemListDirty = false;
            if (typeof updateElemList === 'function') updateElemList();
        });
    }
}

// 统一的"存+刷新"入口
function uniInterface() {
    saveCache();
    refreshElemList();
    // ★ 核心修复：无论是否自动保存，每次修改后必须重建空间索引，否则画布无法实时显示新元素
    //if (typeof rebuildSpatialIndex === 'function') rebuildSpatialIndex();
}

// 内部辅助：v3 / 旧格式加载后共用的"补默认值 + 尺寸校正 + 重建索引 + 撤销基线"
function _finishLoadCache() {
    // ---- settings 默认值 ----
    if (!state.settings) state.settings = {};
    if (state.settings.useShareDownload === undefined) state.settings.useShareDownload = false;
    if (state.settings.msIncludeEmpty === undefined) state.settings.msIncludeEmpty = false;
    if (state.settings.pasteOverwrite === undefined) state.settings.pasteOverwrite = false;
    if (state.settings.importNewProject === undefined) state.settings.importNewProject = false;
    if (state.settings.gamePath === undefined) state.settings.gamePath = '';
    if (state.settings.binPath === undefined) state.settings.binPath = '';
    if (state.settings.esoPath === undefined) state.settings.esoPath = '';
    if (state.settings.autoSave === undefined) state.settings.autoSave = true;
    if (state.settings.autoSaveInterval === undefined) state.settings.autoSaveInterval = 0;
    if (state.settings.enableCompression === undefined) state.settings.enableCompression = true;
    if (!state.settings.chunkSize) state.settings.chunkSize = 100;
    if (!state.settings.chunkThreshold) state.settings.chunkThreshold = 500;

    // ---- 其他默认值 ----
    if (!state._idCounters) state._idCounters = {};
    if (state.drawMode === undefined) state.drawMode = 'single';
    if (state.autoName === undefined) state.autoName = true;
    if (state.keepPrevProps === undefined) state.keepPrevProps = true;
    if (state.canvasEditMode === undefined) state.canvasEditMode = 'select';
    if (state.staticColor === undefined) state.staticColor = null;
    if (state.levelUseAngle === undefined) state.levelUseAngle = false;
    if (!state.currentChunk) state.currentChunk = { x: 0, y: 0 };
    if (!state.unknownElements) state.unknownElements = [];
    if (state.nextIdCounter === undefined) state.nextIdCounter = 1;
    if (!state.movingPlatforms) state.movingPlatforms = [];
    if (!state.fallingPlatforms) state.fallingPlatforms = [];
    if (!state.prisms) state.prisms = [];
    if (!state.resizers) state.resizers = [];
    if (!state.bumpers) state.bumpers = [];
    if (!state.checkpoints) state.checkpoints = [];
    if (!state.cameraTriggers) state.cameraTriggers = [];
    if (!state.buttons) state.buttons = [];
    if (!state.buttonSequences) state.buttonSequences = [];
    if (!state.otherCubes) state.otherCubes = [];
    if (!state.darkCubes) state.darkCubes = [];
    if (!state.staticBlocks) state.staticBlocks = {};

    if (state.visibility === undefined) {
        state.visibility = {
            static: true, moving: true, falling: true, prism: true, resizer: true,
            bumper: true, checkpoint: true, cameratrigger: true, button: true,
            othercube: true, darkcube: true, buttonsequence: true,
            waypoint: true, spawn: true, exit: true
        };
    }

    // ---- 层尺寸校正（删除超界层，补齐行列） ----
    const { w, l, h } = state.level.size;
    for (let z in state.staticBlocks) {
        const zNum = parseInt(z, 10);
        if (isNaN(zNum) || zNum >= h) { delete state.staticBlocks[z]; continue; }
        const layer = state.staticBlocks[z];
        if (!layer) continue;
        for (let y = 0; y < l; y++) {
            if (!layer[y]) layer[y] = Array(w).fill(null);
            else if (layer[y].length < w) {
                for (let x = layer[y].length; x < w; x++) layer[y][x] = null;
            }
        }
        while (layer.length < l) layer.push(Array(w).fill(null));
    }

    // ---- 移动平台 waypoints 兜底 ----
    state.movingPlatforms.forEach(m => {
        if (!m.waypoints || m.waypoints.length === 0) {
            m.waypoints = [{ x: 0, y: 0, z: 0, travelTime: 0, pauseTime: 0 }];
        }
    });

    // ---- 重建空间索引（同时填充 _spatialEntries） ----
    rebuildSpatialIndex();
    _recalcStaticCounts();

    // ---- 撤销基线：清空栈 ----
    state._undoStack = [];
    state._redoStack = [];
    state._lastSavedSnapshot = null;    // 旧字段，保留以兼容，已不再使用
    state._hasUnsavedChanges = false;
    
    if (typeof _syncToolbarCheckboxes === 'function') _syncToolbarCheckboxes();
    if (typeof syncVisibilityUI === 'function') syncVisibilityUI();

    // ---- 项目同步 ----
    /*const pid = localStorage.getItem('edge_xml_editor_current_pid');
    if (pid && window.PM && window.PM.sync) {
        setTimeout(() => { window.PM.sync(); }, 1000);
    }*/
}

function loadCache() {
    try {
        // ================= v3 多 key 格式 =================
        const metaRaw = localStorage.getItem(CACHE_V3_META);
        if (metaRaw) {
            let meta = null;
            try { meta = JSON.parse(metaRaw); } catch (e) { meta = null; }
            if (meta && meta._v === 3) {
                // ---- meta ----
                if (meta.level) state.level = meta.level;
                state.currentLayer = (meta.currentLayer !== undefined) ? meta.currentLayer : 0;
                if (meta.settings) state.settings = meta.settings;
                if (meta.visibility) state.visibility = meta.visibility;
                if (meta.drawMode !== undefined) state.drawMode = meta.drawMode;
                if (meta.staticColor !== undefined) state.staticColor = meta.staticColor;
                if (meta.autoName !== undefined) state.autoName = meta.autoName;
                if (meta.keepPrevProps !== undefined) state.keepPrevProps = meta.keepPrevProps;
                if (meta.canvasEditMode !== undefined) state.canvasEditMode = meta.canvasEditMode;
                if (meta.levelUseAngle !== undefined) state.levelUseAngle = meta.levelUseAngle;
                if (meta._idCounters) state._idCounters = meta._idCounters;
                if (meta.nextIdCounter !== undefined) state.nextIdCounter = meta.nextIdCounter;
                if (meta.unknownElements) state.unknownElements = meta.unknownElements;

                // ---- 每层静态方块（兼容新调色板格式和旧稀疏格式） ----
                const staticBlocks = {};
                const { w, l } = state.level.size;
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (!k || !k.startsWith(CACHE_V3_LAYER)) continue;
                    const z = parseInt(k.slice(CACHE_V3_LAYER.length), 10);
                    if (isNaN(z) || z < 0) continue;

                    let raw = null;
                    try { raw = JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { raw = null; }
                    if (!raw) continue;

                    let layer = null;

                    // ① 新调色板格式：{ palette: [[r,g,b],...], entries: [x,y,cIdx,...] }
                    if (raw && Array.isArray(raw.palette) && Array.isArray(raw.entries)) {
                        layer = decompressLayerFromStorage(raw, w, l);
                    }
                    // ② 旧稀疏格式：[[x,y,r,g,b],...]
                    else if (Array.isArray(raw) && raw.length > 0) {
                        layer = Array.from({ length: l }, () => Array(w).fill(null));
                        for (const entry of raw) {
                            if (!Array.isArray(entry) || entry.length < 5) continue;
                            const [x, y, r, g, b] = entry;
                            if (layer[y] && x >= 0 && x < w) layer[y][x] = { r, g, b };
                        }
                    }

                    if (layer) staticBlocks[z] = layer;
                }
                state.staticBlocks = staticBlocks;

                // ---- 各类型数组 ----
                const arrMap = {
                    moving: 'movingPlatforms', falling: 'fallingPlatforms', prism: 'prisms',
                    resizer: 'resizers', bumper: 'bumpers', checkpoint: 'checkpoints',
                    cameratrigger: 'cameraTriggers', button: 'buttons',
                    buttonSequence: 'buttonSequences', othercube: 'otherCubes',
                    darkcube: 'darkCubes', unknown: 'unknownElements'
                };
                for (const [dirtyName, stateKey] of Object.entries(arrMap)) {
                    const raw = localStorage.getItem(CACHE_V3_ARR + dirtyName);
                    if (raw !== null) {
                        try { state[stateKey] = JSON.parse(raw) || []; }
                        catch (e) { state[stateKey] = []; }
                    } else if (!state[stateKey]) {
                        state[stateKey] = [];
                    }
                }

                _finishLoadCache();
                _markAllDirty();   // 下次 saveCache 会把这些全部重写一遍（首次迁移/兜底）
                return true;
            }
        }

        // ================= 旧格式迁移 =================
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return false;

        let data = JSON.parse(raw);
        // 无论设置如何，都尝试解压（内部会识别稀疏 v2 / 旧 base64 / 未压缩 三种）
        data = decompressDataFromStorage(data);

        Object.assign(state, data);

        _finishLoadCache();

        // 写入 v3（旧 key 不删，保留作回滚兜底；用户以后可以手动清）
        _markAllDirty();
        doRealSaveCache();
        return true;
    } catch (e) {
        console.error('加载缓存失败', e);
        return false;
    }
}



// ★ 新增：只保存设置，不保存关卡数据（解决关闭自动保存后设置存不上的问题）
function saveSettingsOnly() {
  try {
    const raw = localStorage.getItem(CACHE_V3_META);
    const meta = raw ? JSON.parse(raw) : { _v: 3 };
    meta.settings = state.settings;
    localStorage.setItem(CACHE_V3_META, JSON.stringify(meta));
  } catch (e) { console.warn('保存设置失败', e); }
}