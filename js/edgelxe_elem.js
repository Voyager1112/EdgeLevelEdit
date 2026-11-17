// 此文件包含AI辅助生成的代码。
// This file contains AI-assisted code generation.
// 生成xml关卡元素和属性的信息来自：
//Information to generate xml level elements and attributes comes from:
// - EDGEFans mirror: https://github.com/Mygod/edgefans-archive

// ============================================================
//  Edge 关卡xml编辑器3D
// ============================================================
// edge关卡xml编辑器3D by qeoo7800&deepseek 26.8.24
// 在 init 中，或全局创建
const canvas = document.createElement('canvas');
canvas.id = 'mainCanvas';
canvas.style.width = '100%';
canvas.style.height = '100%';
canvas.style.display = 'block';
canvas.style.position = 'absolute';
canvas.style.top = '0';
canvas.style.left = '0';
// 替换 gridEl 的内容
let currentMinX = 0;
let currentMinY = 0;
let currentMinZ = 0;
let currentMaxZ = 0;

const PIXEL_SIZE = 50;  // 每个格子的像素大小
const PADDING = 6;      // 画布内边距

let _currentGridW = 0;
let _currentGridH = 0;
// 保存引用
const ctx = canvas.getContext('2d');
let canvasWidth, canvasHeight;

let threeContainer = null;

function ensureScriptLoaded() {
	if (typeof THREE === 'undefined') {
		var script1 = document.createElement('script');
		script1.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
		script1.onload = function() {
			var script2 = document.createElement('script');
			script2.src = "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js";
			document.head.appendChild(script2);
		};
		document.head.appendChild(script1);
	} else if (typeof THREE.OrbitControls === 'undefined') {
		var script2 = document.createElement('script');
		script2.src = "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js";
		document.head.appendChild(script2);
	}
	if (typeof JSZip === 'undefined') {
		var script3 = document.createElement('script');
		script3.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
		document.head.appendChild(script3);
	}
}

const state = {
	level: {
		id: '10001',
		name: 'MyLevel',
		timeThresholds: [9, 25, 55, 85, 145],
		size: { w: 10, l: 10, h: 3 },
		spawn: { x: 3, y: 5, z: 1 },
		exit: { x: 7, y: 5, z: 1 },
		theme: 0,
		musicJava: 0,
		music: 6,
		zoom: -1,
		angle: 22,
		fov: 22,
		modelTheme: 0
	},
	currentLayer: 0,
	staticBlocks: {},
	movingPlatforms: [],
	fallingPlatforms: [],
	prisms: [],
	resizers: [],
	bumpers: [],
	checkpoints: [],
	cameraTriggers: [],
	buttons: [],
	buttonSequences: [],
	otherCubes: [],
	darkCubes: [],
	unknownElements: [],
	nextIdCounter: 1,
	_internalIdCounter: 1,
	selectedElement: null,
	seqEditingId: null, // 当前正在编辑子按钮的按钮序列ID
	currentTool: 'static',
	zoom: 1.0,
	// 画笔模式
	drawMode: 'single', // 'single' | 'brush'
	staticColor: null, // {r,g,b} 或 null（使用默认）
	// 元素可见性控制
	visibility: {
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
	},
	// 在 state 中添加
	unifiedMovement: {
		enabled: false,
		baseId: null,      // 基准移动平台的 xmlId
		basePos: null,     // {x, y, z} 基准坐标
	},
	isDrawing: false,
	autoName: true,
    keepPrevProps: true,
	_idCounters: {},
	levelUseAngle: false,
	spatialIndex: new Map(),
	interactionMode: 'preview', // 'preview' | 'select' | 'edit'
	selected3D: null,          // 当前3D选中的元素 { type, id, mesh }
	highlightedMesh: null,     // 当前高亮mesh（准星对准）
	canvasRange: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 },
    currentChunk: { x: 0, y: 0 },
    _suppressUI: false,
    canvasEditMode: 'select',   // 'select' | 'add'
    selectedWaypoint: null,  // { movingId, idx }
    multiSelection: [],   // 多选
    settings: {
        importNewProject: false,   // true=导入到新项目，false=导入到当前项目
        useShareDownload: false,   // ★ 手机下载（Web Share API）
        msIncludeEmpty: false,     // ★ 多选时是否包含空格子
        pasteOverwrite: false,     // ★ 粘贴时是否覆盖目标位置原有元素
        _isLargeProject: false,   // ★ 标记：是否为大项目（禁用本地存储）
        autoSave: true,
        autoSaveInterval: 0,   // 0 表示实时，>0 表示间隔秒数
        enableCompression: true, // ★ 新增：是否开启压缩
        useCustomExportDir: false,  // ★ 新增
        customExportPath: '',       // ★ 新增
        chunkSize: 100,       // ★ 新增
        chunkThreshold: 500,  // ★ 
        autoJumpChunk: true,   // ★ 新增：点击元素是否自动跳区块
        autoJumpLayer: false,  // ★ 新增：点击元素是否自动跳层
    },
    _hasUnsavedChanges: false, // ★ 新增：记录是否有未保存改动
    _lastSelectionBox: null,   // ★ 最近一次框选范围 {minX,minY,minZ,maxX,maxY,maxZ}
    _staticCounts: {},   // { z: 该层方块数 }
};

// 渲染节流
let renderRequested = false;
let renderPendingLayers = new Set();

const CACHE_KEY = 'edge_xml_editor';

const gridEl = document.getElementById('pixelGrid');
const layerInput = document.getElementById('layerSelect');
const panelContent = document.getElementById('panelContent');
const elemListContainer = document.getElementById('elemListContainer');
const mouseCoord = document.getElementById('mouseCoord');
const statusRight = document.getElementById('statusRight');
const toastEl = document.getElementById('toast');
const zoomSlider = document.getElementById('zoomSlider');
const zoomNumber = document.getElementById('zoomNumber');
const selectDialog = document.getElementById('selectDialog');
const dialogOptions = document.getElementById('dialogOptions');

const levelIdInput = document.getElementById('levelId');
const levelNameInput = document.getElementById('levelName');
const levelTimeInput = document.getElementById('levelTime');
const sizeWInput = document.getElementById('sizeW');
const sizeLInput = document.getElementById('sizeL');
const sizeHInput = document.getElementById('sizeH');
const spawnInput = document.getElementById('spawnPoint');
const exitInput = document.getElementById('exitPoint');
const levelThemeInput = document.getElementById('levelTheme');
const musicJavaInput = document.getElementById('musicJava');
const musicInput = document.getElementById('music');
const levelZoomInput = document.getElementById('levelZoom');
const levelAngleInput = document.getElementById('levelAngle');
const levelFovInput = document.getElementById('levelFov');
const modelThemeInput = document.getElementById('modelTheme');
const fileXmlInput = document.getElementById('fileXmlInput');

// ============ 静态方块计数 ============
function _adjustStaticCount(z, delta) {
    if (!state._staticCounts) state._staticCounts = {};
    const k = String(z);
    const v = (state._staticCounts[k] || 0) + delta;
    if (v > 0) state._staticCounts[k] = v;
    else delete state._staticCounts[k];
}

// 全量重算（加载 / 新建 / 撤销后使用，O(方块数) 不是 O(W·L·H)）
function _recalcStaticCounts() {
    const counts = {};
    for (const zKey in state.staticBlocks) {
        const layer = state.staticBlocks[zKey];
        if (!layer) continue;
        let n = 0;
        for (let y = 0; y < layer.length; y++) {
            const row = layer[y];
            if (!row) continue;
            for (let x = 0; x < row.length; x++) {
                if (row[x]) n++;
            }
        }
        if (n > 0) counts[zKey] = n;
    }
    state._staticCounts = counts;
}

// ============================================================
// ★ 撤销/重做 + 空间索引增量 + 缓存脏标记
// ============================================================
const UNDO_MAX_STEPS = 100;

function _cloneDeep(o) { return JSON.parse(JSON.stringify(o)); }

function _recordStep(step) {
	//if (state._suppressUI) return;
    if (state._suppressUndo) return;
	if (!state._undoStack) state._undoStack = [];
	if (!state._redoStack) state._redoStack = [];
	state._undoStack.push(step);
	if (state._undoStack.length > UNDO_MAX_STEPS) state._undoStack.shift();
	state._redoStack.length = 0;
}

// 画笔/添加模式 session：把 session 期间的所有步骤合成一条 batch
// 用法：mousedown/touchstart 时 state._sessionMarker = 当前栈长度
//      handleCanvasLeave 时 _flushSessionUndo()
function _flushSessionUndo() {
    if (state._sessionMarker === null || state._sessionMarker === undefined) return;
    const marker = state._sessionMarker;
    state._sessionMarker = null;
    if (!state._undoStack) return;
    const n = state._undoStack.length - marker;
    if (n <= 1) return;   // 0 或 1 条无需合并（1 条 = 只画了一格，独立撤销合理）
    const items = state._undoStack.splice(marker, n);
    state._undoStack.push({ kind: 'batch', items });
    // _redoStack 已被 _recordStep 每次清空，无需处理
}

function _restoreProps(target, src) {
	for (const k of Object.keys(target)) if (!(k in src)) delete target[k];
	Object.assign(target, src);
}

function _ensureLayer(z) {
	if (!state.staticBlocks[z]) {
		const { w, l } = state.level.size;
		state.staticBlocks[z] = Array.from({ length: l }, () => Array(w).fill(null));
	}
	return state.staticBlocks[z];
}

// ============ 撤销应用（唯一需要认识所有 step kind 的地方） ============
function _applyStep(s, dir) {
    const src = dir === 'undo' ? s.before : s.after;
    switch (s.kind) {
        case 'set':
            _restoreProps(s.target, src);
            if (s.type) _markDirty(s.type);                                    // ★ 只标脏这一类型
            break;

        case 'add':
            if (dir === 'undo') {
                const i = s.array.indexOf(s.target);
                if (i !== -1) s.array.splice(i, 1);
            } else if (s.array.indexOf(s.target) === -1) {
                s.array.splice(s.index, 0, s.target);
            }
            if (s.type) _markDirty(s.type);                                    // ★
            break;

        case 'remove':
            if (dir === 'undo') {
                if (s.array.indexOf(s.target) === -1) s.array.splice(s.index, 0, s.target);
                (s.effects || []).forEach(e => _restoreProps(e.target, e.before));
            } else {
                const i = s.array.indexOf(s.target);
                if (i !== -1) s.array.splice(i, 1);
                (s.effects || []).forEach(e => _restoreProps(e.target, e.after));
            }
            if (s.type) _markDirty(s.type);                                    // ★
            (s.effects || []).forEach(e => { if (e.type) _markDirty(e.type); });// ★
            break;

        case 'static': {
            const willHave = !!src;
            if (!willHave) {
                // 撤销添加 / 重做删除：只删已存在的格，不创建层
                const layer = state.staticBlocks[s.z];
                if (layer && layer[s.y] && layer[s.y][s.x]) {
                    layer[s.y][s.x] = null;
                    _adjustStaticCount(s.z, -1);
                    _markDirty(`layer_${s.z}`);                                // ★ 只标脏这一层
                }
            } else {
                // 撤销删除 / 重做添加
                const layer = _ensureLayer(s.z);
                if (!layer[s.y]) layer[s.y] = Array(state.level.size.w).fill(null);
                const hadBefore = !!layer[s.y][s.x];
                layer[s.y][s.x] = { ...src };
                if (!hadBefore) _adjustStaticCount(s.z, 1);
                _markDirty(`layer_${s.z}`);                                    // ★
            }
            break;
        }

        case 'layerClear':
            if (dir === 'undo') {
                state.staticBlocks[s.z] = _cloneDeep(s.before);
                let n = 0;
                for (let y = 0; y < s.before.length; y++) {
                    const row = s.before[y];
                    if (!row) continue;
                    for (let x = 0; x < row.length; x++) if (row[x]) n++;
                }
                if (n > 0) state._staticCounts[s.z] = n;
                else delete state._staticCounts[s.z];
            } else {
                delete state.staticBlocks[s.z];
                delete state._staticCounts[s.z];
            }
            _markDirty(`layer_${s.z}`);                                        // ★
            break;

        case 'layer':
            state.currentLayer = src;
            layerInput.value = src;
            // 不标脏（只是当前层指针，不是数据）
            break;

        case 'batch': {
            const list = dir === 'undo' ? [...s.items].reverse() : s.items;
            list.forEach(it => _applyStep(it, dir));                            // 递归，每步自己标脏
            break;
        }
    }
}

window.undo = function () {
	if (!state._undoStack || !state._undoStack.length) { showToast('没有可撤销的操作'); return; }
	const s = state._undoStack.pop();
	_applyStep(s, 'undo');
	state._redoStack.push(s);
	_afterUndoRedo();
	showToast('已撤销');
};

window.redo = function () {
	if (!state._redoStack || !state._redoStack.length) { showToast('没有可重做的操作'); return; }
	const s = state._redoStack.pop();
	_applyStep(s, 'redo');
	state._undoStack.push(s);
	_afterUndoRedo();
	showToast('已重做');
};

function _afterUndoRedo() {
	rebuildSpatialIndex();   // 撤销可能一次动多个元素，保守全量重建
	_validateSelectedElement();
	requestRender();
	if (typeof threeScene !== 'undefined' && threeScene) render3D();
	updatePanel(); updateElemList(); updateStatus();
	//_markAllDirty();
	saveCache();
}

// ============ 空间索引增量 ============
const _spatialEntries = new WeakMap();

function _collectIndexEntries(el, type) {
	const out = [];
	const push = (key, t, id, extra) => out.push({ key, type: t, id, extra });
	switch (type) {
		case 'moving': {
			const p = getMovingPos(el);
			if (p && typeof p.x === 'number') push(`${p.x},${p.y},${p.z}`, 'moving', el.id);
			if (el.waypoints) el.waypoints.forEach((wp, idx) => {
				if (idx === 0) return;
				if (wp.x !== undefined) push(`${wp.x},${wp.y},${wp.z}`, 'waypoint', null, { idx, parentId: el.id, z: wp.z });
			});
			break;
		}
		case 'falling': case 'prism': case 'resizer':
		case 'bumper': case 'checkpoint': case 'cameratrigger':
			if (typeof el.x === 'number') push(`${el.x},${el.y},${el.z}`, type, el.id);
			break;
		case 'button': {
			let pos = { x: el.x, y: el.y, z: el.z };
			if (el.movingPlatformID) {
				const mp = state.movingPlatforms.find(p => p.id === el.movingPlatformID || p.xmlId === el.movingPlatformID);
				if (mp) pos = getMovingPos(mp);
			}
			if (pos && typeof pos.x === 'number') push(`${pos.x},${pos.y},${pos.z}`, 'button', el.id);
			break;
		}
		case 'seqbutton': {
			let pos = null;
			if (el.movingPlatformID) {
				const mp = state.movingPlatforms.find(p => p.id === el.movingPlatformID || p.xmlId === el.movingPlatformID);
				if (mp) pos = getMovingPos(mp);
			} else if (el.position) pos = el.position;
			if (pos && typeof pos.x === 'number') push(`${pos.x},${pos.y},${pos.z}`, 'seqbutton', el.id);
			break;
		}
		case 'othercube':
			push(`${el.triggerX},${el.triggerY},${el.triggerZ}`, 'othercube_trigger', el.id);
			push(`${el.cubeX},${el.cubeY},${el.cubeZ}`, 'othercube_cube', el.id);
			break;
		case 'darkcube':
			push(`${el.triggerX},${el.triggerY},${el.triggerZ}`, 'darkcube_trigger', el.id);
			push(`${el.cubeX},${el.cubeY},${el.cubeZ}`, 'darkcube_cube', el.id);
			break;
	}
	return out;
}

function _removeFromIndex(el) {
	const entries = _spatialEntries.get(el);
	if (!entries) return;
	for (const e of entries) {
		const list = state.spatialIndex.get(e.key);
		if (!list) continue;
		const i = list.findIndex(x => x.type === e.type && x.id === e.id
			&& x.extra?.idx === e.extra?.idx
			&& x.extra?.parentId === e.extra?.parentId);
		if (i !== -1) list.splice(i, 1);
		if (list.length === 0) state.spatialIndex.delete(e.key);
	}
	_spatialEntries.delete(el);
}

function _addToIndex(el, type) {
	const entries = _collectIndexEntries(el, type);
	for (const e of entries) {
		if (!state.spatialIndex.has(e.key)) state.spatialIndex.set(e.key, []);
		state.spatialIndex.get(e.key).push({ type: e.type, id: e.id, extra: e.extra });
	}
	_spatialEntries.set(el, entries);
}

function _refreshIndex(el, type) { _removeFromIndex(el); _addToIndex(el, type); }

function _refreshSeqButtonsIndex(seq) {
	if (!seq.buttons) return;
	seq.buttons.forEach(btn => _refreshIndex(btn, 'seqbutton'));
}

function _refreshButtonsBoundTo(mp) {
	const id1 = mp.id, id2 = mp.xmlId;
	if (!id1 && !id2) return;
	state.buttons.forEach(btn => {
		if (btn.movingPlatformID === id1 || btn.movingPlatformID === id2) _refreshIndex(btn, 'button');
	});
	state.buttonSequences.forEach(seq => {
		if (seq.buttons) seq.buttons.forEach(sb => {
			if (sb.movingPlatformID === id1 || sb.movingPlatformID === id2) _refreshIndex(sb, 'seqbutton');
		});
	});
}

// ============ 缓存脏标记 ============
const _dirtyKeys = new Set();
function _markDirty(...keys) { keys.forEach(k => _dirtyKeys.add(k)); }
function _markAllDirty() {
	_markDirty('meta', 'moving', 'falling', 'prism', 'resizer', 'bumper',
		'checkpoint', 'cameratrigger', 'button', 'buttonSequence',
		'othercube', 'darkcube', 'unknown');
	for (const z in state.staticBlocks) _markDirty(`layer_${z}`);
}

// ============ 三个统一入口 ============
function _recordSet(type, el, before) {
	_recordStep({ kind: 'set', target: el, type, before, after: _cloneDeep(el) });
    if (type === 'buttonSequence') {
		if (el.buttons) el.buttons.forEach(btn => _refreshIndex(btn, 'seqbutton'));
	} else {
		_refreshIndex(el, type);
	}
	_markDirty(type);
	if (type === 'moving') { _refreshButtonsBoundTo(el); _markDirty('button', 'buttonSequence'); }
}

function _recordAdd(type, arr, el) {
	_recordStep({ kind: 'add', array: arr, index: arr.length - 1, target: el, type });
	_addToIndex(el, type);
	_markDirty(type);
	if (type === 'moving') { _refreshButtonsBoundTo(el); _markDirty('button', 'buttonSequence'); }
}

function _recordRemove(type, arr, el, effects) {
	const idx = arr.indexOf(el);
	if (idx === -1) return;
	arr.splice(idx, 1);
	_recordStep({ kind: 'remove', array: arr, index: idx, target: el, effects, type });
	_removeFromIndex(el);
	_markDirty(type);
	(effects || []).forEach(e => {
		_markDirty(e.type);
		if (e.type === 'seqbutton') {
			for (const seq of state.buttonSequences) {
				if (seq.buttons && seq.buttons.includes(e.target)) { _refreshSeqButtonsIndex(seq); break; }
			}
		} else if (e.type === 'buttonSequence') {
			if (e.target.buttons) e.target.buttons.forEach(btn => _refreshIndex(btn, 'seqbutton'));
		} else {
			_refreshIndex(e.target, e.type);
		}
	});
}

// 只抓取「真正会被 cleanReferences 波及」的元素，避免每次删元素都 clone 全部
function _snapshotDeleteEffects(ids) {
	const idSet = new Set(Array.isArray(ids) ? ids.filter(Boolean) : [ids].filter(Boolean));
	const effects = [];
	const snap = (el, type) => effects.push({ target: el, type, before: _cloneDeep(el) });

	const hasRef = (str) => {
		if (!str || idSet.size === 0) return false;
		if (typeof isAffectIdPresent === 'function') {
			for (const id of idSet) if (isAffectIdPresent(str, id)) return true;
			return false;
		}
		const items = str.split(',').map(s => s.trim()).filter(s => s);
		for (const item of items) {
			const m = item.match(/^([^(]+)(\([^)]*\))?$/);
			if (m && idSet.has(m[1].trim())) return true;
		}
		return false;
	};
	const hasId = (v) => !!v && idSet.has(v);

	state.buttons.forEach(b => {
		if (hasId(b.movingPlatformID) || hasRef(b.affectMoving) || hasRef(b.affectBumpers) || hasRef(b.affectButtons)) snap(b, 'button');
	});
	state.buttonSequences.forEach(seq => {
		if (hasRef(seq.affectMoving) || hasRef(seq.affectBumpers) || hasRef(seq.affectButtons)) snap(seq, 'buttonSequence');
		if (seq.buttons) seq.buttons.forEach(sb => {
			if (hasId(sb.movingPlatformID) || hasRef(sb.affectMoving) || hasRef(sb.affectBumpers) || hasRef(sb.affectButtons)) snap(sb, 'seqbutton');
		});
	});
	state.otherCubes.forEach(oc => { if (hasId(oc.movingBlockSync)) snap(oc, 'othercube'); });
	state.darkCubes.forEach(dc => { if (hasId(dc.movingBlockSync)) snap(dc, 'darkcube'); });
	state.movingPlatforms.forEach(mp => { if (hasId(mp.relatedTo)) snap(mp, 'moving'); });

	return effects;
}

function _dropLayerIndex(z) {
	for (const [key, list] of state.spatialIndex) {
		const filtered = list.filter(e => !(e.extra && e.extra.z === z));
		if (filtered.length === 0) state.spatialIndex.delete(key);
		else if (filtered.length !== list.length) state.spatialIndex.set(key, filtered);
	}
}

// 撤销/重做统一验证已选元素是否还存在
function _validateSelectedElement() {
	const sel = state.selectedElement;
	if (!sel) return;
	if (sel.type === 'static') {
		const c = sel.staticCoord;
		const layer = state.staticBlocks[c.z];
		if (!layer || !layer[c.y] || !layer[c.y][c.x]) state.selectedElement = null;
		return;
	}
	if (sel.type === 'seqbutton') {
		let found = false;
		for (const seq of state.buttonSequences) {
			if (seq.buttons && seq.buttons.some(b => b.id === sel.id)) { found = true; break; }
		}
		if (!found) state.selectedElement = null;
		return;
	}
	const arrays = {
		moving: state.movingPlatforms, falling: state.fallingPlatforms,
		prism: state.prisms, resizer: state.resizers, bumper: state.bumpers,
		checkpoint: state.checkpoints, cameratrigger: state.cameraTriggers,
		button: state.buttons, buttonsequence: state.buttonSequences,
		othercube: state.otherCubes, darkcube: state.darkCubes,
		othercube_trigger: state.otherCubes, othercube_cube: state.otherCubes,
		darkcube_trigger: state.darkCubes, darkcube_cube: state.darkCubes,
	};
	const arr = arrays[sel.type];
	if (!arr || !arr.some(e => e.id === sel.id)) state.selectedElement = null;
}

// ============================================================
// ★ 原有业务逻辑（改写）
// ============================================================

// ★ 获取或按需创建层
function getOrCreateLayer(z) {
    if (!state.staticBlocks[z]) {
        const { w, l } = state.level.size;
        state.staticBlocks[z] = Array.from({ length: l }, () => Array(w).fill(null));
    }
    return state.staticBlocks[z];
}

// 内部函数：删一个静态方块（带撤销）
function _deleteStaticAt(sx, sy, sz) {
	const layer = state.staticBlocks[sz];
	if (!layer || !layer[sy] || !layer[sy][sx]) return false;
	const before = { ...layer[sy][sx] };
	layer[sy][sx] = null;
	_recordStep({ kind: 'static', x: sx, y: sy, z: sz, before, after: null });
	_markDirty(`layer_${sz}`);
    _adjustStaticCount(sz, -1);
	if (state.selectedElement && state.selectedElement.type === 'static' &&
		state.selectedElement.staticCoord.x === sx &&
		state.selectedElement.staticCoord.y === sy &&
		state.selectedElement.staticCoord.z === sz) {
		state.selectedElement = null;
	}
	return true;
}

// 内部函数：放置一个静态方块（带撤销）
function _placeStaticAt(sx, sy, sz, color) {
	const layer = _ensureLayer(sz);
	if (!layer || !layer[sy]) return false;
	layer[sy][sx] = { r: color.r, g: color.g, b: color.b };
	_recordStep({ kind: 'static', x: sx, y: sy, z: sz, before: null, after: { ...color } });
	_markDirty(`layer_${sz}`);
    _adjustStaticCount(sz, 1);
	return true;
}

/**
 * 处理像素点击（由事件委托调用）
 */
function handlePixelClick(x, y, z, staticCoord, elemIdsStr) {
    // 多选工具交给 edgelxe_select.js
    if (state.currentTool === 'multiselect') return;
    // ===== 添加模式：优先处理，任何工具都不弹选择框 =====
    if (state.canvasEditMode === 'add') {
        // 添加模式 + 橡皮擦：每次只删一个，优先删最后添加的
        if (state.currentTool === 'eraser') {
            // 1. 优先删元素（从数组末尾往前找，即删最后一个添加的）
            if (elemIdsStr) {
                const ids = JSON.parse(elemIdsStr);
                for (let i = ids.length - 1; i >= 0; i--) {
                    const item = ids[i];
                    if (item.type === 'waypoint') continue;
                    deleteElement(item.type, item.id);
                    requestRender();
                    updatePanel();
                    updateElemList();
                    updateStatus();
                    uniInterface();
                    return;
                }
            }

            // 2. 没有元素了，删静态方块
            if (staticCoord && state.visibility.static) {
                const parts = staticCoord.split(',').map(s => parseInt(s.trim()));
                if (parts.length === 3) {
                    if (_deleteStaticAt(parts[0], parts[1], parts[2])) {
                        requestRender();
                        updatePanel();
                        updateStatus();
                        uniInterface();
                    }
                }
            }
            return;
        }

        // 添加模式 + 其他工具：直接放置
        const toolMap = {
            'static': () => {
                if (x < 0 || x >= state.level.size.w ||
                    y < 0 || y >= state.level.size.l ||
                    z < 0 || z >= state.level.size.h) return;
                const color = state.staticColor || getStaticDefault(z);
                if (_placeStaticAt(x, y, z, color)) {
                    updatePixelAt(x, y, z);
                    updateStatus();
                    uniInterface();
                }
            },
            'moving': () => placeMoving(x, y, z),
            'falling': () => placeFalling(x, y, z),
            'prism': () => placePrism(x, y, z),
            'resizerGrow': () => placeResizer(x, y, z, 'grow'),
            'resizerShrink': () => placeResizer(x, y, z, 'shrink'),
            'bumper': () => placeBumper(x, y, z),
            'checkpoint': () => placeCheckpoint(x, y, z),
            'cameratrigger': () => placeCameraTrigger(x, y, z),
            'button': () => placeButton(x, y, z),
            'seqbutton': () => placeSequenceButton(x, y, z),
            'othercube': () => placeOtherCube(x, y, z),
            'darkcube': () => placeDarkCube(x, y, z),
            'waypoint': () => {                                        // ★ 新增
                if (!state.selectedElement || state.selectedElement.type !== 'moving') {
                    showToast('请先选中一个移动平台');
                    return;
                }
                const m = state.movingPlatforms.find(p => p.id === state.selectedElement.id);
                if (!m) return;
                const allEntries = getEntriesAt(x, y, z);
                const wpEntry = allEntries.find(e => e.type === 'waypoint' && e.data);
                if (wpEntry) {
                    state.selectedWaypoint = { movingId: wpEntry.data.parentId, idx: wpEntry.data.idx };
                    showToast(`选中路点 #${wpEntry.data.idx + 1}`);
                    requestRender(); updatePanel();
                    return;
                }
                addWaypointAt(m, x, y, z);
            },
        };
        const fn = toolMap[state.currentTool];
        if (fn) fn();
        else showToast('未知工具');
        return;
    }

    // ===== 非添加模式 =====
    if (state.currentTool === 'eraser') {
        handleEraserClick(x, y, z, staticCoord, elemIdsStr);
        return;
    }
    
    if (state.currentTool === 'waypoint') {
        // 必须先选中移动平台
        if (!state.selectedElement || state.selectedElement.type !== 'moving') {
            showToast('请先选中一个移动平台');
            return;
        }
        const m = state.movingPlatforms.find(p => p.id === state.selectedElement.id);
        if (!m) return;

        // 用 getEntriesAt 直接查询当前格的路点
        const allEntries = (typeof getEntriesAt === 'function')
            ? getEntriesAt(x, y, z)
            : [];
        const wpEntry = allEntries.find(e => e.type === 'waypoint' && e.data);

        if (wpEntry) {
            state.selectedWaypoint = {
                movingId: wpEntry.data.parentId,
                idx: wpEntry.data.idx
            };
            showToast(`选中路点 #${wpEntry.data.idx + 1}`);
            requestRender();
            updatePanel();
            return;
        }

        // 否则在当前格添加新路点
        addWaypointAt(m, x, y, z);
        return;
    }

    // 如果该位置有元素（非静态方块）
    if (elemIdsStr) {
        const ids = JSON.parse(elemIdsStr);
        // 过滤不可见元素
        const visibleIds = ids.filter(item => {
            let visible = true;
            switch (item.type) {
                case 'moving': visible = state.visibility.moving; break;
                case 'falling': visible = state.visibility.falling; break;
                case 'prism': visible = state.visibility.prism; break;
                case 'resizer': visible = state.visibility.resizer; break;
                case 'bumper': visible = state.visibility.bumper; break;
                case 'checkpoint': visible = state.visibility.checkpoint; break;
                case 'cameratrigger': visible = state.visibility.cameratrigger; break;
                case 'button': visible = state.visibility.button; break;
                case 'seqbutton': visible = state.visibility.buttonsequence; break;
                case 'othercube_trigger':
                case 'othercube_cube': visible = state.visibility.othercube; break;
                case 'darkcube_trigger':
                case 'darkcube_cube': visible = state.visibility.darkcube; break;
                case 'waypoint': visible = state.visibility.waypoint; break;
                case 'spawn': visible = state.visibility.spawn; break;
                case 'exit': visible = state.visibility.exit; break;
                default: visible = true;
            }
            return visible;
        });
        if (visibleIds.length > 0) {
            if (visibleIds.length > 1) {
                // 多个可见元素 → 弹出选择对话框
                const items = visibleIds.map(item => {
                    const typeMap = {
                        'moving': '移动平台', 'falling': '掉落平台', 'prism': '棱柱',
                        'resizer': '尺寸调整器', 'bumper': '撞击器', 'checkpoint': '存档点',
                        'cameratrigger': '相机触发', 'button': '按钮',
                        'othercube_trigger': '提示触发', 'othercube_cube': '提示方块',
                        'darkcube_trigger': '黑暗触发', 'darkcube_cube': '黑暗方块',
                        'seqbutton': '序列子按钮'
                    };
                    return { type: item.type, desc: (typeMap[item.type] || item.type) + ' #' + item.id, data: item };
                });
                showSelectDialog(items, (selected) => {
                    selectElement(selected.type, selected.data.id);
                });
            } else {
                const item = visibleIds[0];
                selectElement(item.type, item.id);
            }
            return; // 已选中，不再执行放置
        }
        // 如果没有可见元素，继续执行下面的逻辑（允许放置）
    }

    // 如果该位置有静态方块（且静态方块可见）
    if (staticCoord && state.visibility.static) {
        const parts = staticCoord.split(',').map(s => parseInt(s.trim()));
        if (parts.length === 3) {
            selectStatic(parts[0], parts[1], parts[2]);
            return;
        }
    }

    // 否则执行工具操作（放置元素）
    const toolMap = {
        'static': () => toggleStaticBlock(x, y, z),
        'moving': () => placeMoving(x, y, z),
        'falling': () => placeFalling(x, y, z),
        'prism': () => placePrism(x, y, z),
        'resizerGrow': () => placeResizer(x, y, z, 'grow'),
        'resizerShrink': () => placeResizer(x, y, z, 'shrink'),
        'bumper': () => placeBumper(x, y, z),
        'checkpoint': () => placeCheckpoint(x, y, z),
        'cameratrigger': () => placeCameraTrigger(x, y, z),
        'button': () => placeButton(x, y, z),
        'seqbutton': () => placeSequenceButton(x, y, z),
        'othercube': () => placeOtherCube(x, y, z),
        'darkcube': () => placeDarkCube(x, y, z),
    };
    if (toolMap[state.currentTool]) {
        toolMap[state.currentTool]();
    } else {
        showToast('未知工具');
    }
}

function addWaypointAt(m, x, y, z) {
    if (!m.waypoints) m.waypoints = [];
    const before = _cloneDeep(m);
    const keep = state.keepPrevProps;
    let newWp = { x, y, z, travelTime: 0, pauseTime: 0 };
    if (keep && m.waypoints.length > 0) {
        const last = m.waypoints[m.waypoints.length - 1];
        newWp.travelTime = last.travelTime ?? 0;
        // 但 pauseTime 固定为 0
        newWp.pauseTime = 0;
    }
    m.waypoints.push(newWp);
    _recordSet('moving', m, before);
    expandCanvasRangeForPoint(x, y, z);
    uniInterface();
    requestRender();
    updatePanel();
    showToast(`已添加路点 #${m.waypoints.length} (${x},${y},${z})`);
}

function setMovingPos(m, x, y, z) {
	if (!m.waypoints || m.waypoints.length === 0) {
		m.waypoints = [{ x, y, z, travelTime: 0, pauseTime: 0 }];
	} else {
		m.waypoints[0].x = x;
		m.waypoints[0].y = y;
		m.waypoints[0].z = z;
	}
}

function initStaticBlocks() {
    // 不再主动为每一层创建空数组，保留按需创建
    const { w, l, h } = state.level.size;
    // 清理超出 h 的层
    for (let z in state.staticBlocks) {
        if (z >= h) delete state.staticBlocks[z];
    }
}

function applyLevel() {
	const id = levelIdInput.value.trim() || '10001';
	const name = levelNameInput.value.trim() || 'MyLevel';
	const timeStr = levelTimeInput.value;
	const times = timeStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
	if (times.length !== 5) { showToast('时间阈值必须为5个数字'); return; }
	for (let i = 1; i < times.length; i++) {
		if (times[i] <= times[i - 1]) { showToast('时间阈值必须严格递增'); return; }
	}
	const w = parseInt(sizeWInput.value) || 10;
	const l = parseInt(sizeLInput.value) || 10;
	const h = parseInt(sizeHInput.value) || 3;
	if (w < 1 || l < 1 || h < 1) { showToast('尺寸至少 1x1x1'); return; }
	const spawn = parseCoord(spawnInput.value);
	if (!spawn) { showToast('出生点格式错误'); return; }
	const exit = parseCoord(exitInput.value);
	if (!exit) { showToast('终点格式错误'); return; }
    const themeV = parseInt(levelThemeInput.value);
    const theme = isNaN(themeV) ? 0 : clamp(themeV, 0, 3);

    const musicJavaV = parseInt(musicJavaInput.value);
    const musicJava = isNaN(musicJavaV) ? 0 : clamp(musicJavaV, 0, 11);

    const musicV = parseInt(musicInput.value);
    const music = isNaN(musicV) ? 6 : clamp(musicV, 0, 24);

    const zoomV = parseInt(levelZoomInput.value);
    const zoom = isNaN(zoomV) ? -1 : zoomV;
	// 读取 Angle 和 FOV，不赋默认值
	const angleStr = levelAngleInput.value.trim();
	const fovStr = levelFovInput.value.trim();
	let angleVal = NaN, fovVal = NaN;
	if (angleStr !== '') {
		let v = parseInt(angleStr);
		if (!isNaN(v)) angleVal = clamp(v, -184, 184);
	}
	if (fovStr !== '') {
		let v = parseInt(fovStr);
		if (!isNaN(v)) fovVal = clamp(v, 0, 184);
	}
	// 删除或设置属性
	if (!isNaN(angleVal)) state.level.angle = angleVal;
	else delete state.level.angle;
	if (!isNaN(fovVal)) state.level.fov = fovVal;
	else delete state.level.fov;
	// ModelTheme
	if (modelThemeInput.value.trim() !== '') {
		let v = parseInt(modelThemeInput.value);
		if (!isNaN(v) && v >= 0) state.level.modelTheme = v;
		else delete state.level.modelTheme;
	} else {
		delete state.level.modelTheme;
	}

	state.level.id = id;
	state.level.name = name;
	state.level.timeThresholds = times;
	state.level.size = { w, l, h };
	state.level.spawn = spawn;
	state.level.exit = exit;
	state.level.theme = theme;
	state.level.musicJava = musicJava;
	state.level.music = music;
	state.level.zoom = zoom;
	state.level.angle = angleVal;
	state.level.fov = fovVal;
	
	updateCanvasRangeFromSize();

    // 静态方块按新尺寸裁剪（保留按需创建，只转换非空层）
    const newStatic = {};
    for (const zKey in state.staticBlocks) {
        const zNum = parseInt(zKey, 10);
        if (isNaN(zNum) || zNum < 0 || zNum >= h) continue;
        const oldLayer = state.staticBlocks[zKey];
        if (!oldLayer) continue;

        let hasBlock = false;
        for (let y = 0; y < oldLayer.length && !hasBlock; y++) {
            const row = oldLayer[y];
            if (!row) continue;
            for (let x = 0; x < row.length; x++) {
                if (row[x]) { hasBlock = true; break; }
            }
        }
        if (!hasBlock) continue;

        const newLayer = Array.from({ length: l }, () => Array(w).fill(null));
        for (let y = 0; y < Math.min(l, oldLayer.length); y++) {
            const srcRow = oldLayer[y];
            if (!srcRow) continue;
            for (let x = 0; x < Math.min(w, srcRow.length); x++) {
                newLayer[y][x] = srcRow[x] || null;
            }
        }
        newStatic[zKey] = newLayer;
    }
    state.staticBlocks = newStatic;
    _recalcStaticCounts();

	const filterPos = (arr, getPos) => arr.filter(item => {
		const p = getPos(item);
		return p && typeof p.x === 'number' && typeof p.y === 'number' && typeof p.z === 'number';
	});
	state.movingPlatforms = filterPos(state.movingPlatforms, getMovingPos);
	state.fallingPlatforms = filterPos(state.fallingPlatforms, m => ({ x: m.x, y: m.y, z: m.z }));
	state.prisms = filterPos(state.prisms, m => ({ x: m.x, y: m.y, z: m.z }));
	state.resizers = filterPos(state.resizers, m => ({ x: m.x, y: m.y, z: m.z }));
	state.bumpers = filterPos(state.bumpers, m => ({ x: m.x, y: m.y, z: m.z }));
	state.checkpoints = filterPos(state.checkpoints, m => ({ x: m.x, y: m.y, z: m.z }));
	state.cameraTriggers = filterPos(state.cameraTriggers, m => ({ x: m.x, y: m.y, z: m.z }));
	state.buttons = state.buttons.filter(m => {
		if (m.movingPlatformID) return true;
		return m.x !== null && m.x !== undefined && isFinite(m.x) &&
			   m.y !== null && m.y !== undefined && isFinite(m.y) &&
			   m.z !== null && m.z !== undefined && isFinite(m.z);
	});
	state.otherCubes = filterPos(state.otherCubes, m => ({ x: m.triggerX, y: m.triggerY, z: m.triggerZ }));
	state.darkCubes = filterPos(state.darkCubes, m => ({ x: m.triggerX, y: m.triggerY, z: m.triggerZ }));

	layerInput.value = state.currentLayer;

	const useAngleEl = document.getElementById('levelUseAngle');
	const useAngle = useAngleEl ? useAngleEl.checked : false;
	state.levelUseAngle = useAngle;

	requestRender();
	updatePanel();
	updateElemList();
    const maxLayer = Math.max(getLayerRange().maxZ, state.currentLayer);
	layerInput.max = maxLayer;
	layerInput.value = state.currentLayer;
	if (threeScene) {
		clear3DScene();
	}

	// ★ 数组引用被 filterPos 替换，撤销栈失效；作为宏观操作整体清空
	state._undoStack = [];
	state._redoStack = [];
	rebuildSpatialIndex();
	_markAllDirty();

	uniInterface();
	syncLevelUI();
	showToast('Level 属性已应用');
}

// 橡皮擦处理
function handleEraserClick(x, y, z, staticCoord, elemIdsStr) {
	const toDelete = [];

	// ---- 静态方块 ----
	if (staticCoord && state.visibility.static) {
		const parts = staticCoord.split(',').map(s => parseInt(s.trim()));
		if (parts.length === 3) {
			const layer = state.staticBlocks[parts[2]];
			if (layer && layer[parts[1]] && layer[parts[1]][parts[0]]) {
				toDelete.push({ 
					type: 'static', 
					desc: `静态方块 (${parts[0]},${parts[1]},${parts[2]})`,
					data: parts 
				});
			}
		}
	}
    // ---- 移动方块路点 ----
    if (state.currentTool === 'eraser' && state.selectedWaypoint) {
        const { movingId, idx } = state.selectedWaypoint;
        const m = state.movingPlatforms.find(p => p.id === movingId);
        if (m && m.waypoints && idx > 0 && idx < m.waypoints.length) {
            const before = _cloneDeep(m);
            m.waypoints.splice(idx, 1);
            _recordSet('moving', m, before);
            state.selectedWaypoint = null;
            uniInterface();
            requestRender();
            updatePanel();
            return;
        }
    }

	// ---- 其他元素 ----
	if (elemIdsStr) {
		const ids = JSON.parse(elemIdsStr);
		ids.forEach(item => {
			let visible = true;
			switch (item.type) {
				case 'moving': visible = state.visibility.moving; break;
				case 'falling': visible = state.visibility.falling; break;
				case 'prism': visible = state.visibility.prism; break;
				case 'resizer': visible = state.visibility.resizer; break;
				case 'bumper': visible = state.visibility.bumper; break;
				case 'checkpoint': visible = state.visibility.checkpoint; break;
				case 'cameratrigger': visible = state.visibility.cameratrigger; break;
				case 'button': visible = state.visibility.button; break;
				case 'seqbutton': visible = state.visibility.buttonsequence; break;
				case 'othercube_trigger':
				case 'othercube_cube': visible = state.visibility.othercube; break;
				case 'darkcube_trigger':
				case 'darkcube_cube': visible = state.visibility.darkcube; break;
				case 'waypoint': visible = state.visibility.waypoint; break;
				case 'spawn': visible = state.visibility.spawn; break;
				case 'exit': visible = state.visibility.exit; break;
				default: visible = true;
			}
			if (!visible) return;

			let desc = '';
			const typeMap = {
				'moving': '移动平台', 'falling': '掉落平台', 'prism': '棱柱',
				'resizer': '尺寸调整器', 'bumper': '撞击器', 'checkpoint': '存档点',
				'cameratrigger': '相机触发', 'button': '按钮', 'seqbutton': '序列子按钮',
				'othercube_trigger': '提示触发', 'othercube_cube': '提示方块',
				'darkcube_trigger': '黑暗触发', 'darkcube_cube': '黑暗方块'
			};
			if (item.type === 'moving') {
				const m = state.movingPlatforms.find(p => p.id === item.id);
				if (m) { const pos = getMovingPos(m); desc = `移动平台 #${item.id} (${pos.x},${pos.y},${pos.z})`; }
			} else if (item.type === 'falling') {
				const m = state.fallingPlatforms.find(p => p.id === item.id);
				if (m) desc = `掉落平台 #${item.id} (${m.x},${m.y},${m.z})`;
			} else if (item.type === 'prism') {
				const m = state.prisms.find(p => p.id === item.id);
				if (m) desc = `棱柱 #${item.id} (${m.x},${m.y},${m.z})`;
			} else if (item.type === 'resizer') {
				const m = state.resizers.find(p => p.id === item.id);
				if (m) desc = `尺寸调整器 #${item.id} (${m.x},${m.y},${m.z})`;
			} else if (item.type === 'bumper') {
				const m = state.bumpers.find(p => p.id === item.id);
				if (m) desc = `撞击器 #${item.id} (${m.x},${m.y},${m.z})`;
			} else if (item.type === 'checkpoint') {
				const m = state.checkpoints.find(p => p.id === item.id);
				if (m) desc = `存档点 #${item.id} (${m.x},${m.y},${m.z})`;
			} else if (item.type === 'cameratrigger') {
				const m = state.cameraTriggers.find(p => p.id === item.id);
				if (m) desc = `相机触发 #${item.id} (${m.x},${m.y},${m.z})`;
			} else if (item.type === 'button') {
				const m = state.buttons.find(p => p.id === item.id);
				if (m) desc = `按钮 #${item.id} (${m.x},${m.y},${m.z})`;
			} else if (item.type === 'seqbutton') {
				let found = false;
				for (let seq of state.buttonSequences) {
					if (seq.buttons && seq.buttons.some(b => b.id === item.id)) { found = true; break; }
				}
				desc = `序列子按钮 #${item.id}${found ? '' : ' (已失效)'}`;
			} else if (item.type === 'othercube_trigger' || item.type === 'othercube_cube') {
				const m = state.otherCubes.find(p => p.id === item.id);
				if (m) desc = `提示方块 #${item.id} (触发:${m.triggerX},${m.triggerY},${m.triggerZ} 方块:${m.cubeX},${m.cubeY},${m.cubeZ})`;
			} else if (item.type === 'darkcube_trigger' || item.type === 'darkcube_cube') {
				const m = state.darkCubes.find(p => p.id === item.id);
				if (m) desc = `黑暗方块 #${item.id} (触发:${m.triggerX},${m.triggerY},${m.triggerZ} 方块:${m.cubeX},${m.cubeY},${m.cubeZ})`;
			}
			if (desc) toDelete.push({ type: item.type, desc, data: item });
		});
	}

	if (toDelete.length === 0) {
        if (!state._addSessionActive) showToast('此处无可删除的可见元素');
        return;
    }
	
	if (toDelete.length === 1) {
		const item = toDelete[0];
		if (item.type === 'static') {
			const [sx, sy, sz] = item.data;
			if (_deleteStaticAt(sx, sy, sz)) {
				requestRender();
				updatePanel();
				updateStatus();
				uniInterface();
				showToast('已删除静态方块');
			}
		} else {
			deleteElement(item.type, item.data.id);
		}
	} else {
		showSelectDialog(toDelete, (selected) => {
			if (selected.type === 'static') {
				const [sx, sy, sz] = selected.data;
				if (_deleteStaticAt(sx, sy, sz)) {
					requestRender();
					updatePanel();
					updateStatus();
					uniInterface();
					showToast('已删除静态方块');
				}
			} else {
				deleteElement(selected.type, selected.data.id);
			}
		});
	}
}

let lastSelectedCoord = null;

function selectElement(type, id, skipRender = false) {
    if (state._suppressUI) return;
	if (type === 'static') {
		const coord = parseCoord(id);
		if (!coord) {
			state.selectedElement = null;
			showToast('无效的静态方块坐标');
			return;
		}
		selectStatic(coord.x, coord.y, coord.z);
		return;
	}
    const oldCoord = lastSelectedCoord;
    if (state.currentTool === 'seqbutton' && type === 'buttonsequence') {
        state.seqEditingId = id;
        showToast(`序列子按钮模式：目标序列 #${id}`);
    }
    state.selectedElement = { type, id };
	const coord = getElementCoord(type, id);
	if (coord) {
		for (let [mesh, elem] of meshToElement) {
			if (elem.type === type && elem.id === id) {
				state.highlightedMesh = mesh;
				break;
			}
		}
	}

    const newCoord = getElementCoord(type, id);
    if (newCoord) {
        if (state.settings.autoJumpChunk !== false) {
            const chunkSize = state.settings.chunkSize || 100;
            const targetCX = Math.floor(newCoord.x / chunkSize);
            const targetCY = Math.floor(newCoord.y / chunkSize);
            if (!state.currentChunk) state.currentChunk = { x: 0, y: 0 };
            if (targetCX !== state.currentChunk.x || targetCY !== state.currentChunk.y) {
                state.currentChunk.x = targetCX;
                state.currentChunk.y = targetCY;
            }
        }
        if (state.settings.autoJumpLayer) {
            if (state.currentLayer !== newCoord.z) {
                state.currentLayer = newCoord.z;
                layerInput.value = newCoord.z;
                updateLayerMax();
            }
        }
    }
    
    if (oldCoord) updatePixelAt(oldCoord.x, oldCoord.y, oldCoord.z);
    if (!skipRender) requestRender();
    if (!skipRender) {
        updatePanel();
        updateElemList();
    }
    showToast(`已选中 ${type} #${id}`);
}

function getElementCoord(type, id) {
    if (type === 'static') {
        const sel = state.selectedElement;
        if (sel && sel.type === 'static' && sel.staticCoord) return sel.staticCoord;
        return null;
    }
    const arrays = {
        moving: state.movingPlatforms,
        falling: state.fallingPlatforms,
        prism: state.prisms,
        resizer: state.resizers,
        bumper: state.bumpers,
        checkpoint: state.checkpoints,
        cameratrigger: state.cameraTriggers,
        button: state.buttons,
        othercube: state.otherCubes,
        darkcube: state.darkCubes,
        buttonsequence: state.buttonSequences,
    };
    const arr = arrays[type];
    if (!arr) return null;
    const elem = arr.find(e => e.id === id);
    if (!elem) return null;
    if (type === 'moving') {
        const p = getMovingPos(elem);
        return { x: p.x, y: p.y, z: p.z };
    } else if (type === 'button' && elem.movingPlatformID) {
        const mp = state.movingPlatforms.find(m => m.id === elem.movingPlatformID || m.xmlId === elem.movingPlatformID);
        if (mp) {
            const p = getMovingPos(mp);
            return { x: p.x, y: p.y, z: p.z + 1 };
        }
    }
    if (elem.x !== undefined && elem.y !== undefined && elem.z !== undefined) {
        return { x: elem.x, y: elem.y, z: elem.z };
    }
    if (elem.triggerX !== undefined) {
        return { x: elem.triggerX, y: elem.triggerY, z: elem.triggerZ };
    }
    return null;
}

function deleteElement(type, id) {
	// seqbutton：从所属序列删，整体当一条撤销
	if (type === 'seqbutton') {
		for (let seq of state.buttonSequences) {
			const idx = seq.buttons ? seq.buttons.findIndex(b => b.id === id) : -1;
			if (idx !== -1) {
				const before = _cloneDeep(seq);
				const removedBtn = seq.buttons[idx];
				seq.buttons.splice(idx, 1);
				_removeFromIndex(removedBtn);
				_recordSet('buttonSequence', seq, before);
				if (state.selectedElement && state.selectedElement.type === 'seqbutton' && state.selectedElement.id === id) {
					state.selectedElement = null;
				}
				renderGrid();
				requestRender();
				updatePanel();
				updateElemList();
				updateStatus();
				uniInterface();
				showToast(`已删除子按钮 #${id}`);
				return;
			}
		}
		showToast('未找到该子按钮');
		return;
	}

	const arrays = {
		moving: state.movingPlatforms,
		falling: state.fallingPlatforms,
		prism: state.prisms,
		resizer: state.resizers,
		bumper: state.bumpers,
		checkpoint: state.checkpoints,
		cameratrigger: state.cameraTriggers,
		button: state.buttons,
		othercube: state.otherCubes,
		darkcube: state.darkCubes,
		buttonsequence: state.buttonSequences
	};
	let targetArr = null;
	if (type === 'othercube_trigger' || type === 'othercube_cube') targetArr = state.otherCubes;
	else if (type === 'darkcube_trigger' || type === 'darkcube_cube') targetArr = state.darkCubes;
	else targetArr = arrays[type];

	let deleted = false;
    if (targetArr) {
        const idx = targetArr.findIndex(m => m.id === id);
        if (idx !== -1) {
            const elemToDelete = targetArr[idx];

            // ★ 抓可能被 cleanReferences 波及的元素快照（before）
            const refIds = [elemToDelete.xmlId, elemToDelete.id, id].filter(Boolean);
            const effects = _snapshotDeleteEffects(refIds);

            // ★ moving 解绑副作用
            if (type === 'moving') {
                const mp = elemToDelete;
                const pos = getMovingPos(mp);
                state.buttons.forEach(btn => {
                    if (btn.movingPlatformID &&
                        (btn.movingPlatformID === mp.xmlId || btn.movingPlatformID === mp.id)) {
                        btn.x = pos.x; btn.y = pos.y; btn.z = pos.z + 1;
                        btn.movingPlatformID = '';
                    }
                });
                state.buttonSequences.forEach(seq => {
                    if (seq.buttons) {
                        seq.buttons.forEach(btn => {
                            if (btn.movingPlatformID &&
                                (btn.movingPlatformID === mp.xmlId || btn.movingPlatformID === mp.id)) {
                                btn.position = { x: pos.x, y: pos.y, z: pos.z + 1 };
                                btn.movingPlatformID = '';
                            }
                        });
                    }
                });
            }

            // cleanReferences 副作用
            cleanReferences(elemToDelete.xmlId || elemToDelete.id || id);

            // ★ 现抓 after（清理后状态）
            effects.forEach(e => { e.after = _cloneDeep(e.target); });

            // ★ 记录（_recordRemove 里会 splice + 更新索引 + 刷新 effects 的索引）
            _recordRemove(type, targetArr, elemToDelete, effects);
            deleted = true;
        }
    }

	if (deleted) {
		if (state.selectedElement && state.selectedElement.type === type && state.selectedElement.id === id) {
			state.selectedElement = null;
		}
		requestRender();
		updatePanel();
		updateElemList();
		updateStatus();
		uniInterface();
		showToast(`已删除 ${type} #${id}`);
	}
}

function toggleStaticBlock(x, y, z) {
    if (x < 0 || x >= state.level.size.w || y < 0 || y >= state.level.size.l || z < 0 || z >= state.level.size.h) {
        showToast('静态方块只能在关卡尺寸范围内放置');
        return;
    }
    const { w, l } = state.level.size;
    if (x < 0 || x >= w || y < 0 || y >= l) return;

    let layer = state.staticBlocks[z];
    if (!layer) {
        layer = getOrCreateLayer(z);
        if (!layer) return;
    }

    const current = layer[y] ? layer[y][x] : null;

    if (current) {
        const before = { ...current };
        layer[y][x] = null;
        _recordStep({ kind: 'static', x, y, z, before, after: null });
        _markDirty(`layer_${z}`);
        _adjustStaticCount(z, -1);
        if (state.selectedElement && state.selectedElement.type === 'static' &&
            state.selectedElement.staticCoord.x === x &&
            state.selectedElement.staticCoord.y === y &&
            state.selectedElement.staticCoord.z === z) {
            state.selectedElement = null;
        }
    } else {
        const color = state.staticColor || getStaticDefault(z);
        layer[y][x] = { r: color.r, g: color.g, b: color.b };
        _recordStep({ kind: 'static', x, y, z, before: null, after: { r: color.r, g: color.g, b: color.b } });
        _markDirty(`layer_${z}`);
        _adjustStaticCount(z, 1);
        selectStatic(x, y, z);
    }

    updatePixelAt(x, y, z);
    updatePanel();
    updateStatus();
    uniInterface();
}

function selectStatic(x, y, z) {
	const layer = state.staticBlocks[z];
	if (!layer || !layer[y] || !layer[y][x]) {
		state.selectedElement = null;
		updatePanel();
		requestRender();
		return;
	}

    if (state.settings.autoJumpChunk !== false) {
        const chunkSize = state.settings.chunkSize || 100;
        const targetCX = Math.floor(x / chunkSize);
        const targetCY = Math.floor(y / chunkSize);
        if (!state.currentChunk) state.currentChunk = { x: 0, y: 0 };
        if (targetCX !== state.currentChunk.x || targetCY !== state.currentChunk.y) {
            state.currentChunk.x = targetCX;
            state.currentChunk.y = targetCY;
        }
    }
    if (state.settings.autoJumpLayer) {
        if (state.currentLayer !== z) {
            state.currentLayer = z;
            layerInput.value = z;
            updateLayerMax();
        }
    }

	state.selectedElement = { type: 'static', staticCoord: { x, y, z } };
	requestRender();
	updatePanel();
	showToast(`选中静态方块 (${x},${y},${z})`);
}

function updateStaticRGB(x, y, z, r, g, b) {
	const layer = state.staticBlocks[z];
	if (!layer || !layer[y] || !layer[y][x]) return;
	const before = { ...layer[y][x] };
	const after = { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255) };
	layer[y][x] = after;
	_recordStep({ kind: 'static', x, y, z, before, after: { ...after } });
	_markDirty(`layer_${z}`);

	// 同步更新画笔颜色（UI 状态，不进撤销）
	state.staticColor = { ...after };
	const colorPicker = document.getElementById('staticColorPicker');
	if (colorPicker) {
		const hex = '#' + [after.r, after.g, after.b].map(c => c.toString(16).padStart(2, '0')).join('');
		colorPicker.value = hex;
	}
	requestRender();
	updatePanel();
	uniInterface();
}

function resetStaticColor(x, y, z) {
	const layer = state.staticBlocks[z];
	if (!layer || !layer[y] || !layer[y][x]) return;
	const before = { ...layer[y][x] };
	const def = getStaticDefault(z);
	layer[y][x] = { r: def.r, g: def.g, b: def.b };
	_recordStep({ kind: 'static', x, y, z, before, after: { r: def.r, g: def.g, b: def.b } });
	_markDirty(`layer_${z}`);

	state.staticColor = { r: def.r, g: def.g, b: def.b };
	const colorPicker = document.getElementById('staticColorPicker');
	if (colorPicker) {
		const hex = '#' + [def.r, def.g, def.b].map(c => c.toString(16).padStart(2, '0')).join('');
		colorPicker.value = hex;
	}
	requestRender();
	updatePanel();
	uniInterface();
	showToast('已恢复默认颜色');
}

function checkExist(arr, x, y, z, msg, getPos) {
    if (state.canvasEditMode === 'add') return false;
    const gp = getPos || (m => ({ x: m.x, y: m.y, z: m.z }));
    const exist = arr.some(m => {
        const p = gp(m);
        return p && p.x === x && p.y === y && p.z === z;
    });
    if (exist) { showToast(msg); return true; }
    return false;
}

function placeMoving(x, y, z) {
    expandCanvasRangeForPoint(x, y, z);
    if (checkExist(state.movingPlatforms, x, y, z, '该位置已有移动平台', getMovingPos)) return;

    const keep = state.keepPrevProps;
    const autoName = state.autoName;

    let waypoints = null;
    let baseProps = {};
    if (keep && state.movingPlatforms.length > 0) {
        const last = state.movingPlatforms[state.movingPlatforms.length - 1];
        const propsToKeep = ['autoStart', 'loopStartIndex', 'fullBlock'];
        if (state.unifiedMovement.enabled) {
            propsToKeep.push('relatedTo', 'offset');
        }
        propsToKeep.push('trace', 'traceMode', 'traceLength');
        propsToKeep.forEach(prop => {
            if (prop in last) baseProps[prop] = last[prop];
        });
        if (last.waypoints && last.waypoints.length > 0) {
            const base = last.waypoints[0];
            waypoints = last.waypoints.map(wp => ({
                x: x + (wp.x - base.x),
                y: y + (wp.y - base.y),
                z: z + (wp.z - base.z),
                travelTime: wp.travelTime || 0,
                pauseTime: 0
            }));
        }
    }

    if (!waypoints) {
        waypoints = [{ x, y, z, travelTime: 0, pauseTime: 0 }];
        if (x + 2 < state.level.size.w) {
            waypoints.push({ x: x + 2, y, z, travelTime: 30, pauseTime: 10 });
        }
    }

    const internalId = generateInternalId('M');
    const newM = {
        id: internalId,
        xmlId: autoName ? generateUniqueXmlId(internalId) : '',
        autoStart: true,
        loopStartIndex: 0,
        fullBlock: true,
        waypoints,
        relatedTo: '',
        offset: '',
        ...baseProps
    };

    if (state.unifiedMovement.enabled && state.unifiedMovement.baseId) {
        const base = state.movingPlatforms.find(m => (m.xmlId || m.id) === state.unifiedMovement.baseId);
        if (base) {
            const basePos = getMovingPos(base);
            newM.relatedTo = state.unifiedMovement.baseId;
            newM.offset = `${x - basePos.x},${y - basePos.y},${z - basePos.z}`;
            if (base.autoStart !== undefined) newM.autoStart = base.autoStart;
            if (base.loopStartIndex !== undefined) newM.loopStartIndex = base.loopStartIndex;
            newM.hideWaypoints = true;
        }
    }

    if (!state.unifiedMovement.enabled) {
        newM.relatedTo = '';
        newM.offset = '';
    }

    state.movingPlatforms.push(newM);
    _recordAdd('moving', state.movingPlatforms, newM);
    selectElement('moving', internalId);
    requestRender();
    updateElemList();
    updateStatus();
    uniInterface();
    showToast(`移动平台 #${internalId} 已放置`);
}

function placeFalling(x, y, z) {
	expandCanvasRangeForPoint(x, y, z);
	if (checkExist(state.fallingPlatforms, x, y, z, '该位置已有掉落平台')) return;
	const keep = state.keepPrevProps;
	let baseProps = {};
	if (keep && state.fallingPlatforms.length > 0) {
		const last = state.fallingPlatforms[state.fallingPlatforms.length - 1];
		const exclude = ['id', 'xmlId', 'x', 'y', 'z'];
		for (let key in last) {
			if (last.hasOwnProperty(key) && !exclude.includes(key)) {
				baseProps[key] = last[key];
			}
		}
	}
	const internalId = generateInternalId('F');
	const newElem = { id: internalId, xmlId: '', x, y, z, floatTime: 20, ...baseProps };
	state.fallingPlatforms.push(newElem);
	_recordAdd('falling', state.fallingPlatforms, newElem);
	selectElement('falling', internalId);
	requestRender();
	updateElemList();
	updateStatus();
	uniInterface();
	showToast(`掉落平台 #${internalId} 已放置`);
}

function placePrism(x, y, z) {
	expandCanvasRangeForPoint(x, y, z);
	if (checkExist(state.prisms, x, y, z, '该位置已有棱柱')) return;
	const keep = state.keepPrevProps;
	let baseProps = {};
	if (keep && state.prisms.length > 0) {
		const last = state.prisms[state.prisms.length - 1];
		const propsToKeep = ['energy'];
		propsToKeep.forEach(prop => { if (prop in last) baseProps[prop] = last[prop]; });
	}
	const internalId = generateInternalId('P');
	const newElem = { id: internalId, xmlId: '', x, y, z, energy: 1, ...baseProps };
	state.prisms.push(newElem);
	_recordAdd('prism', state.prisms, newElem);
	selectElement('prism', internalId);
	requestRender();
	updateElemList();
	updateStatus();
	uniInterface();
	showToast(`棱柱 #${internalId} 已放置`);
}

function placeResizer(x, y, z, type) {
	if (x < 0 || x >= state.level.size.w || y < 0 || y >= state.level.size.l || z <= 0 || z > state.level.size.h) {
		showToast('尺寸调整器只能在关卡尺寸范围内放置');
		return;
	}
	if (state.canvasEditMode !== 'add') {
        const exist = state.resizers.some(m => m.x === x && m.y === y && m.z === z && m.type === type);
        if (exist) { showToast('该位置已有同类型尺寸调整器'); return; }
    }
	const keep = state.keepPrevProps;
	let baseProps = {};
	if (keep && state.resizers.length > 0) {
		const last = state.resizers[state.resizers.length - 1];
		const propsToKeep = ['visible', 'radiusX', 'radiusY'];
		propsToKeep.forEach(prop => { if (prop in last) baseProps[prop] = last[prop]; });
	}
	const internalId = generateInternalId('R');
	const newElem = { id: internalId, xmlId: '', x, y, z, type, visible: true, radiusX: 0, radiusY: 0, ...baseProps };
	state.resizers.push(newElem);
	_recordAdd('resizer', state.resizers, newElem);
	selectElement('resizer', internalId);
	requestRender();
	updateElemList();
	updateStatus();
	uniInterface();
	showToast(`尺寸调整器 #${internalId} (${type}) 已放置`);
}

function placeBumper(x, y, z) {
	expandCanvasRangeForPoint(x, y, z);
	if (checkExist(state.bumpers, x, y, z, '该位置已有撞击器')) return;
    const keep = state.keepPrevProps;
    let baseProps = {};
    if (keep && state.bumpers.length > 0) {
        const last = state.bumpers[state.bumpers.length - 1];
        const propsToKeep = ['enabled'];
        propsToKeep.forEach(prop => { if (prop in last) baseProps[prop] = last[prop]; });
        ['north', 'east', 'south', 'west'].forEach(dir => {
            if (last[dir]) baseProps[dir] = { ...last[dir] };
        });
    }
	const internalId = generateInternalId('B');
	const autoName = state.autoName;
	const defaultDir = { startDelay: 0, pulseRate: 0 };
	const newElem = {
		id: internalId,
		xmlId: autoName ? generateUniqueXmlId(internalId) : '',
		x, y, z,
		enabled: true,
		north: { ...defaultDir, enabled: false },
		east: { ...defaultDir, enabled: false },
		south: { ...defaultDir, enabled: false },
		west: { ...defaultDir, enabled: false },
		...baseProps
	};
	state.bumpers.push(newElem);
	_recordAdd('bumper', state.bumpers, newElem);
	selectElement('bumper', internalId);
	requestRender();
	updateElemList();
	updateStatus();
	uniInterface();
	showToast(`撞击器 #${internalId} 已放置`);
}

function placeCheckpoint(x, y, z) {
	expandCanvasRangeForPoint(x, y, z);
	if (checkExist(state.checkpoints, x, y, z, '该位置已有存档点')) return;
	const keep = state.keepPrevProps;
	let baseProps = {};
	if (keep && state.checkpoints.length > 0) {
		const last = state.checkpoints[state.checkpoints.length - 1];
		const propsToKeep = ['respawnZ', 'radiusX', 'radiusY'];
		propsToKeep.forEach(prop => { if (prop in last) baseProps[prop] = last[prop]; });
	}
	const internalId = generateInternalId('CP');
	const newElem = { id: internalId, xmlId: '', x, y, z, respawnZ: z, radiusX: 0, radiusY: 0, ...baseProps };
	state.checkpoints.push(newElem);
	_recordAdd('checkpoint', state.checkpoints, newElem);
	selectElement('checkpoint', internalId);
	requestRender();
	updateElemList();
	updateStatus();
	uniInterface();
	showToast(`存档点 #${internalId} 已放置`);
}

function placeCameraTrigger(x, y, z) {
	expandCanvasRangeForPoint(x, y, z);
	if (checkExist(state.cameraTriggers, x, y, z, '该位置已有相机触发')) return;
	const keep = state.keepPrevProps;
	let baseProps = {};
	if (keep && state.cameraTriggers.length > 0) {
		const last = state.cameraTriggers[state.cameraTriggers.length - 1];
		const propsToKeep = ['radiusX', 'radiusY', 'zoom', 'angle', 'fov', 'startDelay', 'duration', 'singleUse', 'useAngle'];
		propsToKeep.forEach(prop => { if (prop in last) baseProps[prop] = last[prop]; });
	}
	const internalId = generateInternalId('CT');
	const newElem = {
		id: internalId, xmlId: '', x, y, z,
		radiusX: 0, radiusY: 0, zoom: -1, angle: 22, fov: 22,
		startDelay: 0, duration: 0, singleUse: false, useAngle: true,
		...baseProps
	};
	state.cameraTriggers.push(newElem);
	_recordAdd('cameratrigger', state.cameraTriggers, newElem);
	selectElement('cameratrigger', internalId);
	requestRender();
	updateElemList();
	updateStatus();
	uniInterface();
	showToast(`相机触发 #${internalId} 已放置`);
}

function placeButton(x, y, z) {
	expandCanvasRangeForPoint(x, y, z);
	if (checkExist(state.buttons, x, y, z, '该位置已有按钮')) return;
	const keep = state.keepPrevProps;
	let baseProps = {};
	if (keep && state.buttons.length > 0) {
		const last = state.buttons[state.buttons.length - 1];
		const propsToKeep = ['visible', 'disableCount', 'mode'];
		propsToKeep.forEach(prop => { if (prop in last) baseProps[prop] = last[prop]; });
	}
	const internalId = generateInternalId('Btn');
	const autoName = state.autoName;
	const newElem = {
		id: internalId,
		xmlId: autoName ? generateUniqueXmlId(internalId) : '',
		x, y, z,
		visible: true,
		disableCount: 0,
		mode: 'StayDown',
		movingPlatformID: '',
		affectMoving: '',
		affectBumpers: '',
		triggerAchievements: '',
		affectButtons: '',
		...baseProps
	};
	state.buttons.push(newElem);
	_recordAdd('button', state.buttons, newElem);
	selectElement('button', internalId);
	requestRender();
	updateElemList();
	updateStatus();
	uniInterface();
	showToast(`按钮 #${internalId} 已放置`);
}

function placeOtherCube(x, y, z) {
	expandCanvasRangeForPoint(x + 1, y, z);
	if (checkExist(state.otherCubes, x, y, z, '该位置已有提示方块触发点',
        m => ({ x: m.triggerX, y: m.triggerY, z: m.triggerZ }))) return;
	const keep = state.keepPrevProps;
	let baseProps = {};
	if (keep && state.otherCubes.length > 0) {
		const last = state.otherCubes[state.otherCubes.length - 1];
		const propsToKeep = ['radiusX', 'radiusY', 'mode', 'moveDirX', 'moveDirY', 'moveDirZ'];
		propsToKeep.forEach(prop => { if (prop in last) baseProps[prop] = last[prop]; });
	}
	const internalId = generateInternalId('OC');
	const newElem = {
		id: internalId, xmlId: '',
		triggerX: x, triggerY: y, triggerZ: z,
		cubeX: x + 1, cubeY: y, cubeZ: z,
		radiusX: 0, radiusY: 0, mode: 'AutoHide',
		moveDirX: 0, moveDirY: -1, moveDirZ: 0,
		movingBlockSync: '',
		subMovingPlatforms: [], subButtons: [], keyEvents: [],
		...baseProps
	};
	state.otherCubes.push(newElem);
	_recordAdd('othercube', state.otherCubes, newElem);
	selectElement('othercube', internalId);
	requestRender();
	updateElemList();
	updateStatus();
	uniInterface();
	showToast(`提示方块 #${internalId} 已放置`);
}

function placeDarkCube(x, y, z) {
	expandCanvasRangeForPoint(x + 1, y, z);
	if (checkExist(state.darkCubes, x, y, z, '该位置已有黑暗方块触发点',
        m => ({ x: m.triggerX, y: m.triggerY, z: m.triggerZ }))) return;
	const keep = state.keepPrevProps;
	let baseProps = {};
	if (keep && state.darkCubes.length > 0) {
		const last = state.darkCubes[state.darkCubes.length - 1];
		const propsToKeep = ['radiusX', 'radiusY'];
		propsToKeep.forEach(prop => { if (prop in last) baseProps[prop] = last[prop]; });
	}
	const internalId = generateInternalId('DC');
	const newElem = {
		id: internalId, xmlId: '',
		triggerX: x, triggerY: y, triggerZ: z,
		cubeX: x + 1, cubeY: y, cubeZ: z,
		radiusX: 0, radiusY: 0,
		movingBlockSync: '', keyEvents: [],
		...baseProps
	};
	state.darkCubes.push(newElem);
	_recordAdd('darkcube', state.darkCubes, newElem);
	selectElement('darkcube', internalId);
	requestRender();
	updateElemList();
	updateStatus();
	uniInterface();
	showToast(`黑暗方块 #${internalId} 已放置`);
}

function addButtonSequence() {
	const internalId = generateInternalId('BS');
	const newSeq = {
		id: internalId,
		xmlId: '',
		sequenceInOrder: false,
		affectMoving: '',
		affectBumpers: '',
		triggerAchievements: '',
		affectButtons: '',
		buttons: []
	};
	state.buttonSequences.push(newSeq);
	_recordAdd('buttonSequence', state.buttonSequences, newSeq);
	selectElement('buttonsequence', internalId);
	updateElemList();
	updatePanel();
	uniInterface();
	showToast(`按钮序列 #${internalId} 已创建`);
}

// ===== ButtonSequence 子按钮 =====
window.addButtonSequenceButton = function(parentId) {
	const parent = state.buttonSequences.find(b => b.id === parentId);
	if (!parent) return;
	const before = _cloneDeep(parent);
	if (!parent.buttons) parent.buttons = [];
	const internalId = generateInternalId('SB');
	const autoName = state.autoName;
	parent.buttons.push({
		id: internalId,
		xmlId: autoName ? generateUniqueXmlId(internalId) : '',
		visible: true,
		position: { x: 0, y: 0, z: 0 },
		movingPlatformID: ''
	});
	_recordSet('buttonSequence', parent, before);
	updatePanel();
	uniInterface();
	showToast('已添加子按钮');
};

window.removeButtonSequenceButton = function(parentId, idx) {
	const parent = state.buttonSequences.find(b => b.id === parentId);
	if (!parent || !parent.buttons || idx >= parent.buttons.length) return;
	const before = _cloneDeep(parent);
	const removedBtn = parent.buttons[idx];
	parent.buttons.splice(idx, 1);
	_removeFromIndex(removedBtn);
	_recordSet('buttonSequence', parent, before);
	renderGrid();
	updatePanel();
	updateElemList();
	uniInterface();
	showToast('已删除子按钮');
};

window.moveButtonSequenceButton = function(parentId, idx, delta) {
	const parent = state.buttonSequences.find(b => b.id === parentId);
	if (!parent || !parent.buttons || idx < 0 || idx >= parent.buttons.length) return;
	const newIdx = idx + delta;
	if (newIdx < 0 || newIdx >= parent.buttons.length) return;
	const before = _cloneDeep(parent);
	const tmp = parent.buttons[idx];
	parent.buttons[idx] = parent.buttons[newIdx];
	parent.buttons[newIdx] = tmp;
	_recordSet('buttonSequence', parent, before);
	updatePanel();
	uniInterface();
	showToast('已调整顺序');
};

window.updateButtonSequenceButtonProp = function(parentId, idx, key, val) {
	const parent = state.buttonSequences.find(b => b.id === parentId);
	if (!parent || !parent.buttons || idx >= parent.buttons.length) return;
	const before = _cloneDeep(parent);
	const btn = parent.buttons[idx];
	if (key === 'visible') {
		btn.visible = val;
	} else if (key === 'id') {
		let newId = String(val).trim();
		if (!newId) { showToast('编号不能为空'); return; }
		if (!/^[^\s,<>"']+$/.test(newId)) { showToast('编号包含非法字符'); return; }
		const allIds = [];
		state.movingPlatforms.forEach(m => allIds.push(m.id));
		state.fallingPlatforms.forEach(m => allIds.push(m.id));
		state.prisms.forEach(m => allIds.push(m.id));
		state.resizers.forEach(m => allIds.push(m.id));
		state.bumpers.forEach(m => allIds.push(m.id));
		state.checkpoints.forEach(m => allIds.push(m.id));
		state.cameraTriggers.forEach(m => allIds.push(m.id));
		state.buttons.forEach(m => allIds.push(m.id));
		state.buttonSequences.forEach(m => allIds.push(m.id));
		state.otherCubes.forEach(m => allIds.push(m.id));
		state.darkCubes.forEach(m => allIds.push(m.id));
		const conflict = allIds.some(id => id === newId && id !== btn.id);
		if (conflict) { showToast('ID已存在'); return; }
		const oldId = btn.id;
		btn.id = newId;
		if (state.selectedElement && state.selectedElement.type === 'seqbutton' && state.selectedElement.id === oldId) {
			state.selectedElement.id = newId;
		}
	} else {
		setField(btn, key, val);
	}
	_recordSet('buttonSequence', parent, before);
	uniInterface();
	updatePanel();
};

window.updateButtonSequenceButtonPos = function(parentId, idx, axis, val) {
	const parent = state.buttonSequences.find(b => b.id === parentId);
	if (!parent || !parent.buttons || idx >= parent.buttons.length) return;
	const before = _cloneDeep(parent);
	const btn = parent.buttons[idx];
	if (!btn.position) btn.position = { x: 0, y: 0, z: 0 };
	btn.position[axis] = val;
	btn.movingPlatformID = '';
	_recordSet('buttonSequence', parent, before);
	expandCanvasRangeForPoint(btn.position.x, btn.position.y, btn.position.z);
	uniInterface();
	updatePanel();
	requestRender();
};

window.updateButtonSequenceButtonMovingPlatform = function(parentId, idx, val) {
	const parent = state.buttonSequences.find(b => b.id === parentId);
	if (!parent || !parent.buttons || idx >= parent.buttons.length) return;
	const before = _cloneDeep(parent);
	const btn = parent.buttons[idx];

	if (val) {
		btn.movingPlatformID = val;
		const mp = state.movingPlatforms.find(m => m.id === val || m.xmlId === val);
		if (mp) {
			const pos = getMovingPos(mp);
			expandCanvasRangeForPoint(pos.x, pos.y, pos.z);
		}
	} else {
		if (btn.movingPlatformID) {
			const mp = state.movingPlatforms.find(m =>
				m.id === btn.movingPlatformID || m.xmlId === btn.movingPlatformID
			);
			if (mp) {
				const pos = getMovingPos(mp);
				btn.position = { x: pos.x, y: pos.y, z: pos.z + 1 };
				expandCanvasRangeForPoint(pos.x, pos.y, pos.z + 1);
			} else {
				if (!btn.position) btn.position = { x: 0, y: 0, z: 0 };
			}
		} else {
			if (!btn.position) btn.position = { x: 0, y: 0, z: 0 };
		}
		btn.movingPlatformID = '';
	}

	_recordSet('buttonSequence', parent, before);
	uniInterface();
	updatePanel();
	requestRender();
};

// ---- 坐标更新 ----
window.updateFallingPos = function(id, axis, val) {
	const elem = state.fallingPlatforms.find(p => p.id === id);
	if (!elem) return;
	const before = _cloneDeep(elem);
	if (axis === 'x') elem.x = val; else if (axis === 'y') elem.y = val; else if (axis === 'z') elem.z = val;
	_recordSet('falling', elem, before);
	expandCanvasRangeForPoint(elem.x, elem.y, elem.z);
	requestRender(); updatePanel(); uniInterface();
};

window.updatePrismPos = function(id, axis, val) {
	const elem = state.prisms.find(p => p.id === id);
	if (!elem) return;
	const before = _cloneDeep(elem);
	if (axis === 'x') elem.x = val; else if (axis === 'y') elem.y = val; else if (axis === 'z') elem.z = val;
	_recordSet('prism', elem, before);
	expandCanvasRangeForPoint(elem.x, elem.y, elem.z);
	requestRender(); updatePanel(); uniInterface();
};

window.updateResizerPos = function(id, axis, val) {
	const elem = state.resizers.find(p => p.id === id);
	if (!elem) return;
	const before = _cloneDeep(elem);
	if (axis === 'x') elem.x = clamp(val, 0, state.level.size.w - 1);
	else if (axis === 'y') elem.y = clamp(val, 0, state.level.size.l - 1);
	else if (axis === 'z') elem.z = clamp(val, 0, state.level.size.h);
	_recordSet('resizer', elem, before);
	expandCanvasRangeForPoint(elem.x, elem.y, elem.z);
	requestRender(); updatePanel(); uniInterface();
};

window.updateBumperPos = function(id, axis, val) {
	const elem = state.bumpers.find(p => p.id === id);
	if (!elem) return;
	const before = _cloneDeep(elem);
	if (axis === 'x') elem.x = val; else if (axis === 'y') elem.y = val; else if (axis === 'z') elem.z = val;
	_recordSet('bumper', elem, before);
	expandCanvasRangeForPoint(elem.x, elem.y, elem.z);
	requestRender(); updatePanel(); uniInterface();
};

window.updateCheckpointPos = function(id, axis, val) {
	const elem = state.checkpoints.find(p => p.id === id);
	if (!elem) return;
	const before = _cloneDeep(elem);
	if (axis === 'x') elem.x = val; else if (axis === 'y') elem.y = val; else if (axis === 'z') elem.z = val;
	_recordSet('checkpoint', elem, before);
	expandCanvasRangeForPoint(elem.x, elem.y, elem.z);
	requestRender(); updatePanel(); uniInterface();
};

window.updateCameraTriggerPos = function(id, axis, val) {
	const elem = state.cameraTriggers.find(p => p.id === id);
	if (!elem) return;
	const before = _cloneDeep(elem);
	if (axis === 'x') elem.x = val; else if (axis === 'y') elem.y = val; else if (axis === 'z') elem.z = val;
	_recordSet('cameratrigger', elem, before);
	expandCanvasRangeForPoint(elem.x, elem.y, elem.z);
	requestRender(); updatePanel(); uniInterface();
};

window.updateButtonPos = function(id, axis, val) {
	const elem = state.buttons.find(p => p.id === id);
	if (!elem) return;
	const before = _cloneDeep(elem);
	if (axis === 'x') elem.x = val; else if (axis === 'y') elem.y = val; else if (axis === 'z') elem.z = val;
	elem.movingPlatformID = '';
	_recordSet('button', elem, before);
	expandCanvasRangeForPoint(elem.x, elem.y, elem.z);
	requestRender(); updatePanel(); uniInterface();
};

// ===== OtherCube 子元素辅助 =====
window.addOtherCubeSubMP = function(parentId) {
	const parent = state.otherCubes.find(o => o.id === parentId);
	if (!parent) return;
	const before = _cloneDeep(parent);
	if (!parent.subMovingPlatforms) parent.subMovingPlatforms = [];
	parent.subMovingPlatforms.push({
		autoStart: false, loopStartIndex: 0, fullBlock: true
	});
	_recordSet('othercube', parent, before);
	updatePanel();
	uniInterface();
	showToast('已添加子 MovingPlatform');
};
window.removeOtherCubeSubMP = function(parentId, idx) {
	const parent = state.otherCubes.find(o => o.id === parentId);
	if (!parent || !parent.subMovingPlatforms) return;
	const before = _cloneDeep(parent);
	parent.subMovingPlatforms.splice(idx, 1);
	_recordSet('othercube', parent, before);
	updatePanel();
	uniInterface();
	showToast('已删除子 MovingPlatform');
};
window.updateOtherCubeSubMPProp = function(parentId, idx, key, val) {
	const parent = state.otherCubes.find(o => o.id === parentId);
	if (!parent || !parent.subMovingPlatforms || idx >= parent.subMovingPlatforms.length) return;
	const before = _cloneDeep(parent);
	setField(parent.subMovingPlatforms[idx], key, val);
	_recordSet('othercube', parent, before);
	uniInterface();
};

window.addOtherCubeSubButton = function(parentId) {
	const parent = state.otherCubes.find(o => o.id === parentId);
	if (!parent) return;
	const before = _cloneDeep(parent);
	if (!parent.subButtons) parent.subButtons = [];
	parent.subButtons.push({
		visible: false, disableCount: 0, mode: 'StayDown',
		affectMoving: '', affectBumpers: '', triggerAchievements: '', affectButtons: ''
	});
	_recordSet('othercube', parent, before);
	updatePanel();
	uniInterface();
	showToast('已添加子 Button');
};
window.removeOtherCubeSubButton = function(parentId, idx) {
	const parent = state.otherCubes.find(o => o.id === parentId);
	if (!parent || !parent.subButtons) return;
	const before = _cloneDeep(parent);
	parent.subButtons.splice(idx, 1);
	_recordSet('othercube', parent, before);
	updatePanel();
	uniInterface();
	showToast('已删除子 Button');
};
window.updateOtherCubeSubButtonProp = function(parentId, idx, key, val) {
	const parent = state.otherCubes.find(o => o.id === parentId);
	if (!parent || !parent.subButtons || idx >= parent.subButtons.length) return;
	const before = _cloneDeep(parent);
	setField(parent.subButtons[idx], key, val);
	_recordSet('othercube', parent, before);
	uniInterface();
};
window.updateOtherCubeSubButtonChecklist = function(parentId, idx, field, checkId, checked) {
	const parent = state.otherCubes.find(o => o.id === parentId);
	if (!parent || !parent.subButtons || idx >= parent.subButtons.length) return;
	const before = _cloneDeep(parent);
	const btn = parent.subButtons[idx];
	let list = (btn[field] || '').split(',').filter(s => s.trim() !== '');
	if (checked) {
		if (!list.includes(checkId)) list.push(checkId);
	} else {
		list = list.filter(s => s !== checkId);
	}
	btn[field] = list.join(',');
	_recordSet('othercube', parent, before);
	uniInterface();
};

window.clearKeyEvents = function(id, type) {
    const target = type === 'othercube' 
        ? state.otherCubes.find(o => o.id === id)
        : state.darkCubes.find(d => d.id === id);
    if (!target) return;
    if (!target.keyEvents || target.keyEvents.length === 0) {
        showToast('按键事件列表已为空');
        return;
    }
    if (!confirm('确定要清空所有按键事件吗？')) return;
    const before = _cloneDeep(target);
    target.keyEvents = [];
    _recordSet(type, target, before);
    uniInterface();
    updatePanel();
    showToast('已清空按键事件');
};

window.addOtherCubeKeyEvent = function(parentId) {
	const parent = state.otherCubes.find(o => o.id === parentId);
	if (!parent) return;
	const before = _cloneDeep(parent);
	if (!parent.keyEvents) parent.keyEvents = [];
	parent.keyEvents.push({ dir: 'West', type: 'Down', timeOffset: 0 });
	_recordSet('othercube', parent, before);
	updatePanel();
	uniInterface();
	showToast('已添加按键事件');
};
window.removeOtherCubeKeyEvent = function(parentId, idx) {
	const parent = state.otherCubes.find(o => o.id === parentId);
	if (!parent || !parent.keyEvents) return;
	const before = _cloneDeep(parent);
	parent.keyEvents.splice(idx, 1);
	_recordSet('othercube', parent, before);
	updatePanel();
	uniInterface();
	showToast('已删除按键事件');
};
window.updateOtherCubeKeyEventProp = function(parentId, idx, key, val) {
	const parent = state.otherCubes.find(o => o.id === parentId);
	if (!parent || !parent.keyEvents || idx >= parent.keyEvents.length) return;
	const before = _cloneDeep(parent);
	setField(parent.keyEvents[idx], key, val);
	_recordSet('othercube', parent, before);
	uniInterface();
};

// ===== DarkCube 子元素辅助 =====
window.addDarkCubeKeyEvent = function(parentId) {
	const parent = state.darkCubes.find(o => o.id === parentId);
	if (!parent) return;
	const before = _cloneDeep(parent);
	if (!parent.keyEvents) parent.keyEvents = [];
	parent.keyEvents.push({ dir: 'West', type: 'Down', timeOffset: 0 });
	_recordSet('darkcube', parent, before);
	updatePanel();
	uniInterface();
	showToast('已添加按键事件');
};
window.removeDarkCubeKeyEvent = function(parentId, idx) {
	const parent = state.darkCubes.find(o => o.id === parentId);
	if (!parent || !parent.keyEvents) return;
	const before = _cloneDeep(parent);
	parent.keyEvents.splice(idx, 1);
	_recordSet('darkcube', parent, before);
	updatePanel();
	uniInterface();
	showToast('已删除按键事件');
};
window.updateDarkCubeKeyEventProp = function(parentId, idx, key, val) {
	const parent = state.darkCubes.find(o => o.id === parentId);
	if (!parent || !parent.keyEvents || idx >= parent.keyEvents.length) return;
	const before = _cloneDeep(parent);
	setField(parent.keyEvents[idx], key, val);
	_recordSet('darkcube', parent, before);
	uniInterface();
};

// 更新函数
window.updateMovingProp = function(id, key, val) {
	const m = state.movingPlatforms.find(p => p.id === id);
	if (!m) return;
	const before = _cloneDeep(m);
	if (key === 'relatedTo') {
		setField(m, 'relatedTo', val);
	} else if (key === 'offset') {
		setField(m, 'offset', val);
	} else {
		setField(m, key, val);
	}
	if (key === 'loopStartIndex') {
		const maxWp = m.waypoints ? m.waypoints.length : 1;
		if (val > maxWp) m.loopStartIndex = maxWp;
	}
	_recordSet('moving', m, before);
	requestRender();
	updatePanel();
	updateElemList();
	uniInterface();
};

window.updateMovingPos = function(id, axis, val) {
	const m = state.movingPlatforms.find(p => p.id === id);
	if (!m) return;
	const before = _cloneDeep(m);
	const pos = getMovingPos(m);
	pos[axis] = val;
	setMovingPos(m, pos.x, pos.y, pos.z);
	_recordSet('moving', m, before);
	expandCanvasRangeForPoint(pos.x, pos.y, pos.z);
	requestRender();
	updatePanel();
	uniInterface();
};

window.updateWaypoint = function(id, idx, key, val) {
	const m = state.movingPlatforms.find(p => p.id === id);
	if (!m || !m.waypoints || idx >= m.waypoints.length) return;
	const before = _cloneDeep(m);
	if (key === 'x' || key === 'y' || key === 'z') {
		m.waypoints[idx][key] = val;
	} else {
		m.waypoints[idx][key] = Math.max(0, val);
	}
	_recordSet('moving', m, before);
	const wp = m.waypoints[idx];
	expandCanvasRangeForPoint(wp.x, wp.y, wp.z);
	updatePanel();
	requestRender();
	uniInterface();
};

window.addWaypoint = function(id) {
    const m = state.movingPlatforms.find(p => p.id === id);
    if (!m) return;
    if (!m.waypoints) m.waypoints = [];
    const before = _cloneDeep(m);
    const keep = state.keepPrevProps;
    const last = m.waypoints[m.waypoints.length - 1] || { x: 0, y: 0, z: 0, travelTime: 30 };
    const newWp = {
        x: Math.min(last.x + 1, state.level.size.w - 1),
        y: last.y, z: last.z,
        travelTime: keep ? (last.travelTime ?? 30) : 30,
        pauseTime: keep ? (last.pauseTime ?? 0) : 0,
    };
    m.waypoints.push(newWp);
    _recordSet('moving', m, before);
    expandCanvasRangeForPoint(newWp.x, newWp.y, newWp.z);
    updatePanel();
    requestRender();
    uniInterface();
    showToast('已添加路点');
};

window.removeWaypoint = function(id, idx) {
	if (idx === 0) { showToast('起点不能删除'); return; }
	const m = state.movingPlatforms.find(p => p.id === id);
	if (!m || !m.waypoints) return;
	const before = _cloneDeep(m);
	m.waypoints.splice(idx, 1);
	_recordSet('moving', m, before);
	updatePanel();
	requestRender();
	uniInterface();
	showToast('已删除路点');
};

window.updateFallingProp = function(id, key, val) {
	const m = state.fallingPlatforms.find(p => p.id === id);
	if (m) {
		const before = _cloneDeep(m);
		setField(m, key, val);
		_recordSet('falling', m, before);
		uniInterface(); requestRender(); updatePanel();
	}
};
window.updatePrismProp = function(id, key, val) {
	const m = state.prisms.find(p => p.id === id);
	if (m) {
		const before = _cloneDeep(m);
		setField(m, key, val);
		_recordSet('prism', m, before);
		uniInterface(); requestRender(); updatePanel();
	}
};
window.updateResizerProp = function(id, key, val) {
	const m = state.resizers.find(p => p.id === id);
	if (m) {
		const before = _cloneDeep(m);
		setField(m, key, val);
		_recordSet('resizer', m, before);
		uniInterface(); requestRender(); updatePanel();
	}
};
window.updateBumperProp = function(id, key, val) {
	const m = state.bumpers.find(p => p.id === id);
	if (m) {
		const before = _cloneDeep(m);
		setField(m, key, val);
		_recordSet('bumper', m, before);
		uniInterface(); requestRender(); updatePanel();
	}
};
window.updateBumperDirEnabled = function(id, dir, enabled) {
	const m = state.bumpers.find(p => p.id === id);
	if (m && m[dir]) {
		const before = _cloneDeep(m);
		m[dir].enabled = enabled;
		_recordSet('bumper', m, before);
		uniInterface(); requestRender(); updatePanel();
	}
};
window.updateBumperDir = function(id, dir, key, val) {
	const m = state.bumpers.find(p => p.id === id);
	if (m && m[dir]) {
		const before = _cloneDeep(m);
		m[dir][key] = val;
		_recordSet('bumper', m, before);
		uniInterface(); requestRender(); updatePanel();
	}
};
window.updateCheckpointProp = function(id, key, val) {
	const m = state.checkpoints.find(p => p.id === id);
	if (m) {
		const before = _cloneDeep(m);
		setField(m, key, val);
		_recordSet('checkpoint', m, before);
		uniInterface(); requestRender(); updatePanel();
	}
};
window.updateCameraTriggerProp = function(id, key, val) {
	const m = state.cameraTriggers.find(p => p.id === id);
	if (m) {
		const before = _cloneDeep(m);
		setField(m, key, val);
		_recordSet('cameratrigger', m, before);
		uniInterface(); requestRender(); updatePanel();
	}
};

window.updateButtonProp = function(id, key, val) {
    const m = state.buttons.find(p => p.id === id);
    if (!m) return;
    const before = _cloneDeep(m);

    if (key === 'movingPlatformID') {
        if (val) {
            m.movingPlatformID = val;
        } else {
            if (m.movingPlatformID) {
                const mp = state.movingPlatforms.find(p =>
                    p.id === m.movingPlatformID || p.xmlId === m.movingPlatformID
                );
                if (mp) {
                    const pos = getMovingPos(mp);
                    m.x = pos.x; m.y = pos.y; m.z = pos.z + 1;
                } else {
                    if (m.x === null || m.x === undefined) m.x = 0;
                    if (m.y === null || m.y === undefined) m.y = 0;
                    if (m.z === null || m.z === undefined) m.z = 0;
                }
            } else {
                if (m.x === null || m.x === undefined) m.x = 0;
                if (m.y === null || m.y === undefined) m.y = 0;
                if (m.z === null || m.z === undefined) m.z = 0;
            }
            m.movingPlatformID = '';
        }
    } else if (key === 'visible') {
        m.visible = val;
    } else {
        setField(m, key, val);
    }

    _recordSet('button', m, before);
    uniInterface();
    requestRender();
    updatePanel();
};
		
window.updateButtonChecklist = function(id, field, checkId, checked) {
    const elem = state.buttons.find(b => b.id === id);
    if (!elem) return;
    const before = _cloneDeep(elem);
    let str = elem[field] || '';
    const items = str.split(',').map(s => s.trim()).filter(s => s);
    if (checked) {
        const exists = items.some(item => {
            const match = item.match(/^([^(]+)\((\d+)\)$/);
            if (match) return match[1].trim() === checkId;
            return item === checkId;
        });
        if (!exists) items.push(checkId);
    } else {
        const newItems = items.filter(item => {
            const match = item.match(/^([^(]+)\((\d+)\)$/);
            if (match) return match[1].trim() !== checkId;
            return item !== checkId;
        });
        items.length = 0;
        items.push(...newItems);
    }
    elem[field] = items.join(',');
    _recordSet('button', elem, before);
    uniInterface();
    updatePanel();
};

window.updateButtonSeqChecklist = function(id, field, checkId, checked) {
    const seq = state.buttonSequences.find(b => b.id === id);
    if (!seq) return;
    const before = _cloneDeep(seq);
    let str = seq[field] || '';
    const items = str.split(',').map(s => s.trim()).filter(s => s);
    if (checked) {
        const exists = items.some(item => {
            const match = item.match(/^([^(]+)\((\d+)\)$/);
            if (match) return match[1].trim() === checkId;
            return item === checkId;
        });
        if (!exists) items.push(checkId);
    } else {
        const newItems = items.filter(item => {
            const match = item.match(/^([^(]+)\((\d+)\)$/);
            if (match) return match[1].trim() !== checkId;
            return item !== checkId;
        });
        items.length = 0;
        items.push(...newItems);
    }
    seq[field] = items.join(',');
    _recordSet('buttonSequence', seq, before);
    uniInterface();
    updatePanel();
};

window.updateButtonSeqProp = function(id, key, val) {
	const seq = state.buttonSequences.find(b => b.id === id);
	if (!seq) return;
	const before = _cloneDeep(seq);
	setField(seq, key, val);
	_recordSet('buttonSequence', seq, before);
	uniInterface();
	updatePanel();
};

window.updateButtonAffectData = function(btnId, field, checkId, value) {
    const btn = state.buttons.find(b => b.id === btnId);
    if (!btn) return;
    const before = _cloneDeep(btn);
    let str = btn[field] || '';
    const items = str.split(',').map(s => s.trim()).filter(s => s);
    const num = parseInt(value, 10);
    let filteredItems = items.filter(item => {
        const match = item.match(/^([^(]+)\((\d+)\)$/);
        if (match) return match[1].trim() !== checkId;
        return item !== checkId;
    });
    if (num !== -1 && !isNaN(num)) {
        filteredItems.push(`${checkId}(${num})`);
    } else {
        filteredItems.push(checkId);
    }
    btn[field] = filteredItems.join(',');
    _recordSet('button', btn, before);
    uniInterface();
    updatePanel();
};

window.updateButtonSeqAffectData = function(seqId, field, checkId, value) {
    const seq = state.buttonSequences.find(b => b.id === seqId);
    if (!seq) return;
    const before = _cloneDeep(seq);
    let str = seq[field] || '';
    const items = str.split(',').map(s => s.trim()).filter(s => s);
    const num = parseInt(value, 10);
    let filteredItems = items.filter(item => {
        const match = item.match(/^([^(]+)\((\d+)\)$/);
        if (match) return match[1].trim() !== checkId;
        return item !== checkId;
    });
    if (num !== -1 && !isNaN(num)) {
        filteredItems.push(`${checkId}(${num})`);
    } else {
        filteredItems.push(checkId);
    }
    seq[field] = filteredItems.join(',');
    _recordSet('buttonSequence', seq, before);
    uniInterface();
    updatePanel();
};

window.updateOtherCubeProp = function(id, key, val) {
	const m = state.otherCubes.find(p => p.id === id);
	if (m) {
		const before = _cloneDeep(m);
		setField(m, key, val);
		_recordSet('othercube', m, before);
		if (['triggerX','triggerY','triggerZ','cubeX','cubeY','cubeZ'].includes(key)) {
			expandCanvasRangeForPoint(m.triggerX, m.triggerY, m.triggerZ);
			expandCanvasRangeForPoint(m.cubeX, m.cubeY, m.cubeZ);
		}
		uniInterface(); requestRender(); updatePanel();
	}
};

window.updateDarkCubeProp = function(id, key, val) {
	const m = state.darkCubes.find(p => p.id === id);
	if (m) {
		const before = _cloneDeep(m);
		setField(m, key, val);
		_recordSet('darkcube', m, before);
		if (['triggerX','triggerY','triggerZ','cubeX','cubeY','cubeZ'].includes(key)) {
			expandCanvasRangeForPoint(m.triggerX, m.triggerY, m.triggerZ);
			expandCanvasRangeForPoint(m.cubeX, m.cubeY, m.cubeZ);
		}
		uniInterface(); requestRender(); updatePanel();
	}
};

window.applyStaticPreset = function(x, y, z, r, g, b) {
	updateStaticRGB(x, y, z, r, g, b);
};

window.updateInternalId = function(internalId, type, newId) {
	const arr = getArrayByType(type);
	const elem = arr.find(e => e.id === internalId);
	if (!elem) return;
	let finalId = newId.trim();
	if (!finalId) { showToast('编号不能为空'); return; }
	if (!/^[a-zA-Z0-9]+$/.test(finalId)) { showToast('只允许字母数字'); return; }
	const before = _cloneDeep(elem);
	let counter = 0;
	let candidate = finalId;
	while (arr.some(e => e.id === candidate && e.id !== internalId)) {
		counter++;
		candidate = finalId + 'a'.repeat(counter);
	}
	elem.id = candidate;
	const autoName = state.autoName;
	if (autoName && (type === 'moving' || type === 'bumper' || type === 'button')) {
		let xmlCandidate = candidate;
		let xmlCounter = 0;
		while (arr.some(e => e.xmlId === xmlCandidate && e.id !== internalId)) {
			xmlCounter++;
			xmlCandidate = candidate + 'a'.repeat(xmlCounter);
		}
		elem.xmlId = xmlCandidate;
	}
	_recordSet(type, elem, before);
	uniInterface();
	updatePanel();
	requestRender();
	showToast('编号已更新');
};

window.removeStatic = function(x, y, z) {
	if (_deleteStaticAt(x, y, z)) {
		requestRender();
		updatePanel();
		updateStatus();
		uniInterface();
		showToast('已删除静态方块');
	}
};

window.resetStaticColor = resetStaticColor;

window.moveWaypoint = function(movingId, idx, delta) {
    const m = state.movingPlatforms.find(p => p.id === movingId);
    if (!m || idx < 1 || idx >= m.waypoints.length) return;
    const newIdx = idx + delta;
    if (newIdx < 1 || newIdx >= m.waypoints.length) return;
    const before = _cloneDeep(m);
    [m.waypoints[idx], m.waypoints[newIdx]] = [m.waypoints[newIdx], m.waypoints[idx]];
    _recordSet('moving', m, before);
    uniInterface(); requestRender(); updatePanel(); showToast('路点顺序已调整');
};