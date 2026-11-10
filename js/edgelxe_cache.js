/*function saveCache() {
    if (state._suppressUI) return;
    
    // ★ 如果已经被标记为大项目，直接跳过保存，节省性能
    if (state._isLargeProject) return;

    try {
        const data = {
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
            drawMode: state.drawMode,
            staticColor: state.staticColor,
            visibility: state.visibility,
            _idCounters: state._idCounters,
            levelUseAngle: state.levelUseAngle,
            autoName: state.autoName,
            keepPrevProps: state.keepPrevProps,
            canvasEditMode: state.canvasEditMode,
            settings: state.settings
        };
        
        const toStore = compressDataForStorage(data);
        const str = JSON.stringify(toStore);
        
        // 提前预判：如果字符串长度超过 4MB，直接视为大项目
        if (str.length > 4 * 1024 * 1024) {
            triggerLargeProjectMode();
            return;
        }
        
        try {
            localStorage.setItem(CACHE_KEY, str);
        } catch (e) {
            if (e.name === 'QuotaExceededError' || e.code === 22) {
                // 走到这里说明虽然没超过4MB，但老数据占用太多把空间塞满了
                triggerLargeProjectMode();
            } else {
                throw e;
            }
        }
        
        rebuildSpatialIndex();
    } catch (e) {
        console.warn('保存缓存失败', e);
    }
}*/

let _saveTimer = null;

function saveCache() {
    if (state._suppressUI) return;
    if (state._isLargeProject) return;
    
    // 如果关闭了自动保存
    if (state.settings.autoSave === false) {
        state._hasUnsavedChanges = true; // 标记有未保存改动
        return;
    }

    const interval = state.settings.autoSaveInterval || 0;
    if (interval > 0) {
        if (_saveTimer) clearTimeout(_saveTimer);
        state._hasUnsavedChanges = true;
        _saveTimer = setTimeout(() => {
            doRealSaveCache();
            state._hasUnsavedChanges = false;
        }, interval * 1000);
    } else {
        doRealSaveCache();
        state._hasUnsavedChanges = false;
    }
}

function doRealSaveCache() {
    try {
        const data = {
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
            drawMode: state.drawMode,
            staticColor: state.staticColor,
            visibility: state.visibility,
            _idCounters: state._idCounters,
            levelUseAngle: state.levelUseAngle,
            autoName: state.autoName,
            keepPrevProps: state.keepPrevProps,
            canvasEditMode: state.canvasEditMode,
            settings: state.settings
        };
        
        const toStore = (state.settings.enableCompression !== false) 
            ? compressDataForStorage(data) 
            : data;
            
        const str = JSON.stringify(toStore);
        
        // ★ 去掉 4MB 预判，直接尝试真实写入
        try {
            localStorage.setItem(CACHE_KEY, str);
            
            // ★ 附加优化：如果之前是大项目，这次写入成功了，说明空间腾出来了，恢复普通模式
            if (state._isLargeProject) {
                state._isLargeProject = false;
                const warn = document.getElementById('largeProjectWarning');
                if (warn) warn.remove();
                showToast('✅ 关卡已成功自动保存');
            }
        } catch (e) {
            if (e.name === 'QuotaExceededError' || e.code === 22) {
                // 只有真实写不下时，才触发大项目模式
                triggerLargeProjectMode();
            } else {
                throw e;
            }
        }
        
        rebuildSpatialIndex();
    } catch (e) {
        console.warn('保存缓存失败', e);
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

// 新函数，承担原 saveCache 里的"撤销栈 + 刷新元素列表"逻辑
function undoStack() {
    if (state._suppressUI) return;
    const snap = _serializeHistory();
    if (state._lastSavedSnapshot !== undefined && snap !== state._lastSavedSnapshot) {
        window.pushUndo && window.pushUndo();
    }
    state._lastSavedSnapshot = snap;
}

function refreshElemList() {
    if (!window._pendingElemListRefresh) {
        window._pendingElemListRefresh = true;
        requestAnimationFrame(() => {
            window._pendingElemListRefresh = false;
            if (typeof updateElemList === 'function') updateElemList();
        });
    }
}

// 统一的"存+刷新"入口
function uniInterface() {
    saveCache();
    undoStack();
    refreshElemList();
    // ★ 核心修复：无论是否自动保存，每次修改后必须重建空间索引，否则画布无法实时显示新元素
    if (typeof rebuildSpatialIndex === 'function') rebuildSpatialIndex();
}

function loadCache() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return false;
        
        // ★ 使用 let 而非 const，因为要重新赋值
        let data = JSON.parse(raw);
        // 无论设置如何，都尝试解压（decompress 内部会识别三种格式）
        data = decompressDataFromStorage(data);
        
        Object.assign(state, data);
        
        // 如果缺少新字段，设置默认值
        if (!state.settings) state.settings = {};
        if (state.settings.useShareDownload === undefined) state.settings.useShareDownload = false;
        if (state.settings.msIncludeEmpty === undefined) state.settings.msIncludeEmpty = false;
        if (state.settings.pasteOverwrite === undefined) state.settings.pasteOverwrite = false;
        if (state.settings.importNewProject === undefined) state.settings.importNewProject = false;
        if (state.settings.gamePath === undefined) state.settings.gamePath = '';
        if (state.settings.binPath === undefined) state.settings.binPath = '';
        if (state.settings.esoPath === undefined) state.settings.esoPath = '';
        
        // ★ 新增：补全自动保存和压缩的默认值
        if (state.settings.autoSave === undefined) state.settings.autoSave = true;
        if (state.settings.autoSaveInterval === undefined) state.settings.autoSaveInterval = 0;
        if (state.settings.enableCompression === undefined) state.settings.enableCompression = true;
        
        if (data.levelUseAngle !== undefined) {
            state.levelUseAngle = data.levelUseAngle;
        }
        if (data._idCounters) {
            state._idCounters = data._idCounters;
        } else {
            state._idCounters = {};
        }
        if (state.drawMode === undefined) state.drawMode = 'single';
        if (state.autoName === undefined) state.autoName = true;
        if (state.keepPrevProps === undefined) state.keepPrevProps = true;
        if (state.canvasEditMode === undefined) state.canvasEditMode = 'select';
        if (state.staticColor === undefined) state.staticColor = null;
        if (state.visibility === undefined) {
            state.visibility = {
                static: true,
                moving: true,
                falling: true,
                prism: true,
                resizer: true,
                bumper: true,
                checkpoint: true,
                cameratrigger: true,
                button: true,
                othercube: true,
                darkcube: true,
                buttonsequence: true,
                waypoint: true,
                spawn: true,
                exit: true
            };
        }
        
        // 确保 staticBlocks 每层数组长度正确
        /*const { w, l, h } = state.level.size;
        for (let z = 0; z < h; z++) {
            if (!state.staticBlocks[z]) {
                state.staticBlocks[z] = Array.from({ length: l }, () => Array(w).fill(null));
            } else {
                const layer = state.staticBlocks[z];
                for (let y = 0; y < l; y++) {
                    if (!layer[y]) layer[y] = Array(w).fill(null);
                    else if (layer[y].length < w) {
                        for (let x = layer[y].length; x < w; x++) layer[y][x] = null;
                    }
                }
                while (layer.length < l) layer.push(Array(w).fill(null));
            }
        }*/
        
		// 确保已存在的层尺寸正确
		const { w, l, h } = state.level.size;
		for (let z in state.staticBlocks) {
			if (z >= h) { delete state.staticBlocks[z]; continue; } // 删除超界的
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
        
        state.movingPlatforms.forEach(m => {
            if (!m.waypoints || m.waypoints.length === 0) {
                m.waypoints = [{ x: 0, y: 0, z: 0, travelTime: 0, pauseTime: 0 }];
            }
        });
        if (!state.otherCubes) state.otherCubes = [];
        if (!state.darkCubes) state.darkCubes = [];
        
        rebuildSpatialIndex();
        
        // 初始化撤销基线
        state._lastSavedSnapshot = _serializeHistory();
        state._undoStack = [];
        state._redoStack = [];
        
        const pid = localStorage.getItem('edge_xml_editor_current_pid');
        if (pid && window.PM && window.PM.sync) {
            // 延迟同步，避免阻塞页面启动
            setTimeout(() => { window.PM.sync(); }, 1000);
        }
        
        return true;
    } catch (e) {
        console.error('加载缓存失败', e);
        return false;
    }
}

// ★ 新增：只保存设置，不保存关卡数据（解决关闭自动保存后设置存不上的问题）
function saveSettingsOnly() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        let data = raw ? JSON.parse(raw) : {};
        data.settings = state.settings;
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('保存设置失败', e);
    }
}