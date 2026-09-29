// 缓存
function saveCache() {
    if (state._suppressUI) return;
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
			// 新增字段
			drawMode: state.drawMode,
			staticColor: state.staticColor,
			visibility: state.visibility,
			_idCounters: state._idCounters,
			levelUseAngle: state.levelUseAngle,
			autoName: state.autoName
		};
        const str = JSON.stringify(data);
        const snap = _serializeHistory();
        // ---- 内容变化 → 记录上一个状态进撤销栈 ----
        if (state._lastSavedSnapshot !== undefined && snap !== state._lastSavedSnapshot) {
            window.pushUndo && window.pushUndo();
        }
        state._lastSavedSnapshot = snap;
        // ---- 挂接结束 ----
        
		localStorage.setItem(CACHE_KEY, str);
		rebuildSpatialIndex();  // 新增
        
        // ===== 若当前选中是序列相关，自动刷新元素列表 =====
        /*const sel = state.selectedElement;
        if (sel && (sel.type === 'seqbutton' || sel.type === 'buttonsequence')) {
            if (!window._pendingElemListRefresh) {
                window._pendingElemListRefresh = true;
                requestAnimationFrame(() => {
                    window._pendingElemListRefresh = false;
                    if (typeof updateElemList === 'function') updateElemList();
                });
            }
        }*/
        // ===== 节流刷新元素列表（所有编辑操作都会经过这里） =====
        if (!window._pendingElemListRefresh) {
            window._pendingElemListRefresh = true;
            requestAnimationFrame(() => {
                window._pendingElemListRefresh = false;
                if (typeof updateElemList === 'function') updateElemList();
            });
        }
	} catch (e) {}
}

function loadCache() {
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return false;
		const data = JSON.parse(raw);
		Object.assign(state, data);
		// 如果缺少新字段，设置默认值
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
		// ... 原有其他代码（静态块恢复等）保持不变
		const { w, l, h } = state.level.size;
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
		}
		state.movingPlatforms.forEach(m => {
			if (!m.waypoints || m.waypoints.length === 0) {
				m.waypoints = [{ x: 0, y: 0, z: 0, travelTime: 0, pauseTime: 0 }];
			}
		});
		// 确保其他数组存在
		if (!state.otherCubes) state.otherCubes = [];
		if (!state.darkCubes) state.darkCubes = [];
		rebuildSpatialIndex();
        
        // 初始化撤销基线
        state._lastSavedSnapshot = _serializeHistory();
        state._undoStack = [];
        state._redoStack = [];
        
		return true;
	} catch (e) {
		return false;
	}
}
