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

// ★ 新增：获取或按需创建层
function getOrCreateLayer(z) {
    if (!state.staticBlocks[z]) {
        const { w, l } = state.level.size;
        state.staticBlocks[z] = Array.from({ length: l }, () => Array(w).fill(null));
    }
    return state.staticBlocks[z];
}
/**
 * 处理像素点击（由事件委托调用）
 * @param {number} x - 格子 X 坐标
 * @param {number} y - 格子 Y 坐标
 * @param {number} z - 当前层
 * @param {string|null} staticCoord - 静态方块的坐标字符串 "x,y,z" 或 null
 * @param {string|null} elemIdsStr - 元素 ID 列表的 JSON 字符串或 null
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
                    const layer = state.staticBlocks[parts[2]];
                    if (layer && layer[parts[1]] && layer[parts[1]][parts[0]]) {
                        layer[parts[1]][parts[0]] = null;
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
                const layer = state.staticBlocks[z] || getOrCreateLayer(z);   // ★ 按需建层
                if (!layer) return;
                const color = state.staticColor || getStaticDefault(z);
                layer[y][x] = { r: color.r, g: color.g, b: color.b };
                requestRender();
                updateStatus();
                uniInterface();
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
            'darkcube': () => placeDarkCube(x, y, z)
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

        // ★ 用 getEntriesAt 直接查询当前格的路点
        // （调用方传入的 elemIdsStr 已经被过滤掉了 waypoint）
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
                    let desc = '';
                    const typeMap = {
                        'moving': '移动平台',
                        'falling': '掉落平台',
                        'prism': '棱柱',
                        'resizer': '尺寸调整器',
                        'bumper': '撞击器',
                        'checkpoint': '存档点',
                        'cameratrigger': '相机触发',
                        'button': '按钮',
                        'othercube_trigger': '提示触发',
                        'othercube_cube': '提示方块',
                        'darkcube_trigger': '黑暗触发',
                        'darkcube_cube': '黑暗方块',
                        'seqbutton': '序列子按钮'
                    };
                    desc = (typeMap[item.type] || item.type) + ' #' + item.id;
                    return { type: item.type, desc, data: item };
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
    const keep = state.keepPrevProps;
    let newWp = { x, y, z, travelTime: 0, pauseTime: 0 };
    if (keep && m.waypoints.length > 0) {
        const last = m.waypoints[m.waypoints.length - 1];
        newWp.travelTime = last.travelTime ?? 0;
        // 但 pauseTime 固定为 0
        newWp.pauseTime = 0;
    }
    m.waypoints.push(newWp);
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


/*function initStaticBlocks() {
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
}*/
function initStaticBlocks() {
    // ★ 不再主动为每一层创建空数组，保留按需创建
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
	
	/*const newStatic = {};
	for (let z = 0; z < h; z++) {
		const oldLayer = state.staticBlocks[z] || [];
		const newLayer = Array.from({ length: l }, () => Array(w).fill(null));
		for (let y = 0; y < Math.min(l, oldLayer.length); y++) {
			for (let x = 0; x < Math.min(w, oldLayer[y]?.length || 0); x++) {
				newLayer[y][x] = oldLayer[y][x] || null;
			}
		}
		newStatic[z] = newLayer;
	}
	state.staticBlocks = newStatic;*/

    // 原来是：
    // const newStatic = {};
    // for (let z = 0; z < h; z++) { ...创建所有层... }
    // state.staticBlocks = newStatic;

    // 改为：
    const newStatic = {};
    for (const zKey in state.staticBlocks) {
        const zNum = parseInt(zKey, 10);
        if (isNaN(zNum) || zNum < 0 || zNum >= h) continue; // 超界或无效，丢弃
        const oldLayer = state.staticBlocks[zKey];
        if (!oldLayer) continue;

        // 检查是否全是空格，全空就不保留
        let hasBlock = false;
        for (let y = 0; y < oldLayer.length && !hasBlock; y++) {
            const row = oldLayer[y];
            if (!row) continue;
            for (let x = 0; x < row.length; x++) {
                if (row[x]) { hasBlock = true; break; }
            }
        }
        if (!hasBlock) continue;

        // 只转换非空层
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

	// 替换原有的 filterPosWithMax 调用为：
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
		// 否则必须坐标有效
		return m.x !== null && m.x !== undefined && isFinite(m.x) &&
			   m.y !== null && m.y !== undefined && isFinite(m.y) &&
			   m.z !== null && m.z !== undefined && isFinite(m.z);
	});
	state.otherCubes = filterPos(state.otherCubes, m => ({ x: m.triggerX, y: m.triggerY, z: m.triggerZ }));
	state.darkCubes = filterPos(state.darkCubes, m => ({ x: m.triggerX, y: m.triggerY, z: m.triggerZ }));

	//if (state.currentLayer > h) state.currentLayer = h;
	layerInput.value = state.currentLayer;

	// 在 applyLevel 中，读取 levelUseAngle 和禁用输入框
	const useAngleEl = document.getElementById('levelUseAngle');
	const useAngle = useAngleEl ? useAngleEl.checked : false;
	state.levelUseAngle = useAngle;

	requestRender();
	updatePanel();
	updateElemList();
	// 在 applyLevel 函数末尾，saveCache 之前添加：
	//const maxLayer = getLayerRange().maxZ;
    const maxLayer = Math.max(getLayerRange().maxZ, state.currentLayer);
	layerInput.max = maxLayer;
	//if (state.currentLayer > maxLayer) state.currentLayer = maxLayer;
	layerInput.value = state.currentLayer;
	if (threeScene) {
		clear3DScene();
	}
	uniInterface();
	syncLevelUI();
	showToast('Level 属性已应用');
}

// 橡皮擦处理（已扩展支持新元素）
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
            m.waypoints.splice(idx, 1);
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
			// 先检查该类型是否可见
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
			if (!visible) return; // 不可见，跳过

			let desc = '';
			const typeMap = {
				'moving': '移动平台',
				'falling': '掉落平台',
				'prism': '棱柱',
				'resizer': '尺寸调整器',
				'bumper': '撞击器',
				'checkpoint': '存档点',
				'cameratrigger': '相机触发',
				'button': '按钮',
				'seqbutton': '序列子按钮',
				'othercube_trigger': '提示触发',
				'othercube_cube': '提示方块',
				'darkcube_trigger': '黑暗触发',
				'darkcube_cube': '黑暗方块'
			};
			if (item.type === 'moving') {
				const m = state.movingPlatforms.find(p => p.id === item.id);
				if (m) {
					const pos = getMovingPos(m);
					desc = `移动平台 #${item.id} (${pos.x},${pos.y},${pos.z})`;
				}
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
					if (seq.buttons && seq.buttons.some(b => b.id === item.id)) {
						found = true;
						break;
					}
				}
				desc = `序列子按钮 #${item.id}${found ? '' : ' (已失效)'}`;
			} else if (item.type === 'othercube_trigger' || item.type === 'othercube_cube') {
				const m = state.otherCubes.find(p => p.id === item.id);
				if (m) desc = `提示方块 #${item.id} (触发:${m.triggerX},${m.triggerY},${m.triggerZ} 方块:${m.cubeX},${m.cubeY},${m.cubeZ})`;
			} else if (item.type === 'darkcube_trigger' || item.type === 'darkcube_cube') {
				const m = state.darkCubes.find(p => p.id === item.id);
				if (m) desc = `黑暗方块 #${item.id} (触发:${m.triggerX},${m.triggerY},${m.triggerZ} 方块:${m.cubeX},${m.cubeY},${m.cubeZ})`;
			}
			if (desc) {
				toDelete.push({ type: item.type, desc, data: item });
			}
		});
	}

	// ---- 后续处理（删除逻辑不变） ----
	if (toDelete.length === 0) {
        // 长按/连点场景下静默跳过，不打扰
        if (!state._addSessionActive) {
            showToast('此处无可删除的可见元素');
        }
        return;
    }
	
	if (toDelete.length === 1) {
		const item = toDelete[0];
		if (item.type === 'static') {
			const [sx, sy, sz] = item.data;
			const layer = state.staticBlocks[sz];
			if (layer && layer[sy]) {
				layer[sy][sx] = null;
				if (state.selectedElement && state.selectedElement.type === 'static' &&
					state.selectedElement.staticCoord.x === sx &&
					state.selectedElement.staticCoord.y === sy &&
					state.selectedElement.staticCoord.z === sz) {
					state.selectedElement = null;
				}
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
				const layer = state.staticBlocks[sz];
				if (layer && layer[sy]) {
					layer[sy][sx] = null;
					if (state.selectedElement && state.selectedElement.type === 'static' &&
						state.selectedElement.staticCoord.x === sx &&
						state.selectedElement.staticCoord.y === sy &&
						state.selectedElement.staticCoord.z === sz) {
						state.selectedElement = null;
					}
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

let lastSelectedCoord = null; // 新增：记录上一次选中坐标

function selectElement(type, id, skipRender = false) {
    if (state._suppressUI) return;
	if (type === 'static') {
		const coord = parseCoord(id);
		if (!coord) {
			// 如果 id 不是有效的坐标字符串，则清除选中并返回
			state.selectedElement = null;
			showToast('无效的静态方块坐标');
			return;
		}
		// 设置选中并调用 selectStatic 来确保 staticCoord 被正确设置
		selectStatic(coord.x, coord.y, coord.z);
		return;
	}
    const oldCoord = lastSelectedCoord;
    // 当前工具是"序列子按钮"时，选中的按钮序列直接作为目标
    if (state.currentTool === 'seqbutton' && type === 'buttonsequence') {
        state.seqEditingId = id;
        showToast(`序列子按钮模式：目标序列 #${id}`);
    }
    state.selectedElement = { type, id };
	const coord = getElementCoord(type, id);
	if (coord) {
		// 在3D场景中查找对应的mesh（通过meshToElement映射反向查找）
		for (let [mesh, elem] of meshToElement) {
			if (elem.type === type && elem.id === id) {
				state.highlightedMesh = mesh;
				//render3D();  // 新增此行
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
    
    // 清除旧选中
    if (oldCoord) {
        updatePixelAt(oldCoord.x, oldCoord.y, oldCoord.z);
    }
    if (!skipRender) {
        // 非跳过模式，触发全量刷新（但我们的 renderGrid 已优化）
        requestRender();
    }
    // 更新面板和列表（在非画笔模式下或单点模式下）
    if (!skipRender) {
        updatePanel();
        updateElemList();
    }
    showToast(`已选中 ${type} #${id}`);
}

function getElementCoord(type, id) {
    // 根据类型返回 {x,y,z}
    if (type === 'static') {
        // static 坐标存储在 selectedElement.staticCoord 中
        const sel = state.selectedElement;
        if (sel && sel.type === 'static' && sel.staticCoord) {
            return sel.staticCoord;
        }
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
    // 提取坐标
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
    // 其他类型直接有 x,y,z
    if (elem.x !== undefined && elem.y !== undefined && elem.z !== undefined) {
        return { x: elem.x, y: elem.y, z: elem.z };
    }
    // 特殊处理 OtherCube/DarkCube 取触发点
    if (elem.triggerX !== undefined) {
        return { x: elem.triggerX, y: elem.triggerY, z: elem.triggerZ };
    }
    return null;
}


function deleteElement(type, id) {
	let deleted = false;
	let deletedId = id;
	// 新增处理 seqbutton
	if (type === 'seqbutton') {
		// 查找所属序列
		for (let seq of state.buttonSequences) {
			const idx = seq.buttons ? seq.buttons.findIndex(b => b.id === id) : -1;
			if (idx !== -1) {
				seq.buttons.splice(idx, 1);
				deleted = true;
				break;
			}
		}
		if (deleted) {
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
	// 处理特殊类型（有子类型）
	let targetArr = null;
	if (type === 'othercube_trigger' || type === 'othercube_cube') targetArr = state.otherCubes;
	else if (type === 'darkcube_trigger' || type === 'darkcube_cube') targetArr = state.darkCubes;
	else targetArr = arrays[type];
    if (targetArr) {
        const idx = targetArr.findIndex(m => m.id === id);
        if (idx !== -1) {
            const elemToDelete = targetArr[idx];

            if (type === 'moving') {
                const mp = elemToDelete;
                const pos = getMovingPos(mp);

                state.buttons.forEach(btn => {
                    // ★ 先判断 btn.movingPlatformID 非空
                    if (btn.movingPlatformID &&
                        (btn.movingPlatformID === mp.xmlId || btn.movingPlatformID === mp.id)) {
                        btn.x = pos.x;
                        btn.y = pos.y;
                        btn.z = pos.z + 1;
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

            // 清理其他引用（传入 xmlId 或内部 id，确保 affect 列表等也能正确清理）
            cleanReferences(elemToDelete.xmlId || elemToDelete.id || id);

            targetArr.splice(idx, 1);
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

// 静态方块
/*function toggleStaticBlock(x, y, z) {
	if (x < 0 || x >= state.level.size.w || y < 0 || y >= state.level.size.l || z < 0 || z >= state.level.size.h) {
		showToast('静态方块只能在关卡尺寸范围内放置');
		return;
	}
    // ★ 修改这里：如果层不存在，且是增加方块，就创建它
	let layer = state.staticBlocks[z];
    if (!current && !layer) {
        layer = getOrCreateLayer(z);
    }
	if (!layer) return;
	const { w, l } = state.level.size;
	if (x < 0 || x >= w || y < 0 || y >= l) return;
	const current = layer[y][x];
	if (current) {
		layer[y][x] = null;
		if (state.selectedElement && state.selectedElement.type === 'static' &&
			state.selectedElement.staticCoord.x === x && state.selectedElement.staticCoord.y === y &&
			state.selectedElement.staticCoord.z === z) {
			state.selectedElement = null;
		}
	} else {
		let color = state.staticColor;
		if (!color) {
			color = getStaticDefault(z);
		}
		layer[y][x] = { r: color.r, g: color.g, b: color.b };
		selectStatic(x, y, z);
	}
	updatePixelAt(x, y, z);
	updatePanel();
	updateStatus();
	uniInterface();
}*/

function toggleStaticBlock(x, y, z) {
    if (x < 0 || x >= state.level.size.w || y < 0 || y >= state.level.size.l || z < 0 || z >= state.level.size.h) {
        showToast('静态方块只能在关卡尺寸范围内放置');
        return;
    }
    const { w, l } = state.level.size;
    if (x < 0 || x >= w || y < 0 || y >= l) return;

    let layer = state.staticBlocks[z];

    // ★ 只有"这一格是空、要放方块"时才需要创建层；
    //    删除操作不需要新建层（层不存在说明本来就空，直接 return）
    if (!layer) {
        // 层不存在 = 整层空 = 这一格必然为空 → 走"放置"分支，按需建层
        layer = getOrCreateLayer(z);
        if (!layer) return;
    }

    const current = layer[y] ? layer[y][x] : null;

    if (current) {
        // 删除
        layer[y][x] = null;
        if (state.selectedElement && state.selectedElement.type === 'static' &&
            state.selectedElement.staticCoord.x === x &&
            state.selectedElement.staticCoord.y === y &&
            state.selectedElement.staticCoord.z === z) {
            state.selectedElement = null;
        }
    } else {
        // 放置
        const color = state.staticColor || getStaticDefault(z);
        layer[y][x] = { r: color.r, g: color.g, b: color.b };
        selectStatic(x, y, z);
    }

    updatePixelAt(x, y, z);
    updatePanel();
    updateStatus();
    uniInterface();
}

// 在 selectStatic 中
function selectStatic(x, y, z) {
	const layer = state.staticBlocks[z];
	if (!layer || !layer[y] || !layer[y][x]) {
		state.selectedElement = null;
		updatePanel();
		requestRender();
		return;
	}

    // ★ 自动跳块/跳层
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
	layer[y][x] = { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255) };
	// 同步更新画笔颜色
	state.staticColor = { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255) };
	// 同步更新颜色选择器
	const colorPicker = document.getElementById('staticColorPicker');
	if (colorPicker) {
		const hex = '#' + [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255)].map(c => c.toString(16).padStart(2, '0')).join('');
		colorPicker.value = hex;
	}
	requestRender();
	updatePanel();
	uniInterface();
}

function resetStaticColor(x, y, z) {
	const layer = state.staticBlocks[z];
	if (!layer || !layer[y] || !layer[y][x]) return;
	const def = getStaticDefault(z);
	layer[y][x] = { r: def.r, g: def.g, b: def.b };
	// 同步更新画笔颜色和颜色选择器
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

// 检查目标位置是否已有同类元素；添加模式直接放行
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

// 放置各类元素
function placeMoving(x, y, z) {
    expandCanvasRangeForPoint(x, y, z);
    if (checkExist(state.movingPlatforms, x, y, z, '该位置已有移动平台', getMovingPos)) return;

    const keep = state.keepPrevProps;
    const autoName = state.autoName;

    // ★ 先决定路点：如果有上次可复用 → 直接生成完整 waypoints
    let waypoints = null;
    let baseProps = {};
    if (keep && state.movingPlatforms.length > 0) {
        const last = state.movingPlatforms[state.movingPlatforms.length - 1];
        const propsToKeep = ['autoStart', 'loopStartIndex', 'fullBlock'];
        // ★ 只在统一运动开启时才继承 relatedTo / offset
        if (state.unifiedMovement.enabled) {
            propsToKeep.push('relatedTo', 'offset');
        }
        // ★ Trace 相关属性一并继承
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
                pauseTime: 0        // pauseTime 统一 0
            }));
        }
    }

    // ★ 没有可复用 → 默认结构
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
        waypoints,            // ★ 一次性赋值完整数组
        relatedTo: '',
        offset: '',
        ...baseProps
    };

    // 统一运动处理
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
    
    // ★ 统一运动关闭时，强制清空 relatedTo / offset
    if (!state.unifiedMovement.enabled) {
        newM.relatedTo = '';
        newM.offset = '';
    }

    state.movingPlatforms.push(newM);
    // ★ 遍历所有路点扩展画布范围
    //newM.waypoints.forEach(wp => expandCanvasRangeForPoint(wp.x, wp.y, wp.z));
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
		// ===== 新增：保留上次属性（复制所有非标识属性） =====
		const keep = state.keepPrevProps;
		let baseProps = {};
		if (keep && state.fallingPlatforms.length > 0) {
			const last = state.fallingPlatforms[state.fallingPlatforms.length - 1];
			// 排除不需要继承的属性（标识符和坐标）
			const exclude = ['id', 'xmlId', 'x', 'y', 'z'];
			for (let key in last) {
				if (last.hasOwnProperty(key) && !exclude.includes(key)) {
					baseProps[key] = last[key];
				}
			}
		}
		// ===== 新增结束 =====
	const internalId = generateInternalId('F');
	state.fallingPlatforms.push({ id: internalId, xmlId: '', x, y, z, floatTime: 20, ...baseProps });
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
		// ===== 新增：保留上次属性 =====
		const keep = state.keepPrevProps;
		let baseProps = {};
		if (keep && state.prisms.length > 0) {
			const last = state.prisms[state.prisms.length - 1];
			// 可保留的属性列表
			const propsToKeep = ['energy'];
			propsToKeep.forEach(prop => {
				if (prop in last) baseProps[prop] = last[prop];
			});
		}
		// ===== 新增结束 =====
	const internalId = generateInternalId('P');
	state.prisms.push({ id: internalId, xmlId: '', x, y, z, energy: 1 , ...baseProps });
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
		// ===== 新增：保留上次属性 =====
		const keep = state.keepPrevProps;
		let baseProps = {};
		if (keep && state.resizers.length > 0) {
			const last = state.resizers[state.resizers.length - 1];
			// 可保留的属性列表
			const propsToKeep = ['visible', 'radiusX', 'radiusY'];
			propsToKeep.forEach(prop => {
				if (prop in last) baseProps[prop] = last[prop];
			});
		}
		// ===== 新增结束 =====
	const internalId = generateInternalId('R');
	state.resizers.push({ id: internalId, xmlId: '', x, y, z, type, visible: true, radiusX: 0, radiusY: 0 , ...baseProps });
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
    // ===== 新增：保留上次属性（含四个方向子元素） =====
    const keep = state.keepPrevProps;              // ★ 读 state
    let baseProps = {};
    if (keep && state.bumpers.length > 0) {
        const last = state.bumpers[state.bumpers.length - 1];
        // 顶层属性
        const propsToKeep = ['enabled'];
        propsToKeep.forEach(prop => {
            if (prop in last) baseProps[prop] = last[prop];
        });
        // ★ 四个方向子元素（深拷贝，避免后续修改互相污染）
        ['north', 'east', 'south', 'west'].forEach(dir => {
            if (last[dir]) baseProps[dir] = { ...last[dir] };
        });
    }
    // ===== 新增结束 =====
	const internalId = generateInternalId('B');
	const autoName = state.autoName;
	const defaultDir = { startDelay: 0, pulseRate: 0 };
	state.bumpers.push({
		id: internalId,
		xmlId: autoName ? generateUniqueXmlId(internalId) : '',
		x, y, z,
		enabled: true,
		north: { ...defaultDir, enabled: false },
		east: { ...defaultDir, enabled: false },
		south: { ...defaultDir, enabled: false },
		west: { ...defaultDir, enabled: false },
		...baseProps
	});
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
		// ===== 新增：保留上次属性 =====
		const keep = state.keepPrevProps;
		let baseProps = {};
		if (keep && state.checkpoints.length > 0) {
			const last = state.checkpoints[state.checkpoints.length - 1];
			// 可保留的属性列表
			const propsToKeep = ['respawnZ', 'radiusX', 'radiusY'];
			propsToKeep.forEach(prop => {
				if (prop in last) baseProps[prop] = last[prop];
			});
		}
		// ===== 新增结束 =====
	const internalId = generateInternalId('CP');
	state.checkpoints.push({ id: internalId, xmlId: '', x, y, z, respawnZ: z, radiusX: 0, radiusY: 0, ...baseProps });
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
		// ===== 新增：保留上次属性 =====
		const keep = state.keepPrevProps;
		let baseProps = {};
		if (keep && state.cameraTriggers.length > 0) {
			const last = state.cameraTriggers[state.cameraTriggers.length - 1];
			// 可保留的属性列表
			const propsToKeep = ['radiusX', 'radiusY', 'zoom', 'angle', 'fov', 'startDelay', 'duration', 'singleUse', 'useAngle'];
			propsToKeep.forEach(prop => {
				if (prop in last) baseProps[prop] = last[prop];
			});
		}
		// ===== 新增结束 =====
	const internalId = generateInternalId('CT');
	state.cameraTriggers.push({
		id: internalId,
		xmlId: '',
		x, y, z,
		radiusX: 0,
		radiusY: 0,
		zoom: -1,
		angle: 22,
		fov: 22,
		startDelay: 0,
		duration: 0,
		singleUse: false,
		useAngle: true,
		...baseProps
	});
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
		// ===== 新增：保留上次属性 =====
		const keep = state.keepPrevProps;
		let baseProps = {};
		if (keep && state.buttons.length > 0) {
			const last = state.buttons[state.buttons.length - 1];
			// 可保留的属性列表
			const propsToKeep = ['visible', 'disableCount', 'mode'];
			propsToKeep.forEach(prop => {
				if (prop in last) baseProps[prop] = last[prop];
			});
		}
		// ===== 新增结束 =====
	const internalId = generateInternalId('Btn');
	const autoName = state.autoName;
	state.buttons.push({
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
	});
	selectElement('button', internalId);
	requestRender();
	updateElemList();
	updateStatus();
	uniInterface();
	showToast(`按钮 #${internalId} 已放置`);
}

function placeOtherCube(x, y, z) {
	expandCanvasRangeForPoint(x + 1, y, z); // 默认 cube 位置
	if (checkExist(state.otherCubes, x, y, z, '该位置已有提示方块触发点',
        m => ({ x: m.triggerX, y: m.triggerY, z: m.triggerZ }))) return;
		// ===== 新增：保留上次属性 =====
		const keep = state.keepPrevProps;
		let baseProps = {};
		if (keep && state.otherCubes.length > 0) {
			const last = state.otherCubes[state.otherCubes.length - 1];
			// 可保留的属性列表
			const propsToKeep = ['radiusX', 'radiusY', 'mode', 'moveDirX', 'moveDirY', 'moveDirZ'];
			propsToKeep.forEach(prop => {
				if (prop in last) baseProps[prop] = last[prop];
			});
		}
		// ===== 新增结束 =====
	const internalId = generateInternalId('OC');
	state.otherCubes.push({
		id: internalId,
		xmlId: '',
		triggerX: x,
		triggerY: y,
		triggerZ: z,
		cubeX: x + 1,
		cubeY: y,
		cubeZ: z,
		radiusX: 0,
		radiusY: 0,
		mode: 'AutoHide',
		moveDirX: 0,
		moveDirY: -1,
		moveDirZ: 0,
		movingBlockSync: '',
		subMovingPlatforms: [],
		subButtons: [],
		keyEvents: [],
		...baseProps
	});
	selectElement('othercube', internalId);
	requestRender();
	updateElemList();
	updateStatus();
	uniInterface();
	showToast(`提示方块 #${internalId} 已放置`);
}

function placeDarkCube(x, y, z) {
	expandCanvasRangeForPoint(x + 1, y, z); // 默认 cube 位置
	if (checkExist(state.darkCubes, x, y, z, '该位置已有黑暗方块触发点',
        m => ({ x: m.triggerX, y: m.triggerY, z: m.triggerZ }))) return;
		// ===== 新增：保留上次属性 =====
		const keep = state.keepPrevProps;
		let baseProps = {};
		if (keep && state.darkCubes.length > 0) {
			const last = state.darkCubes[state.darkCubes.length - 1];
			// 可保留的属性列表
			const propsToKeep = ['radiusX', 'radiusY'];
			propsToKeep.forEach(prop => {
				if (prop in last) baseProps[prop] = last[prop];
			});
		}
		// ===== 新增结束 =====
	const internalId = generateInternalId('DC');
	state.darkCubes.push({
		id: internalId,
		xmlId: '',
		triggerX: x,
		triggerY: y,
		triggerZ: z,
		cubeX: x + 1,
		cubeY: y,
		cubeZ: z,
		radiusX: 0,
		radiusY: 0,
		movingBlockSync: '',
		keyEvents: [],
		...baseProps
	});
	selectElement('darkcube', internalId);
	requestRender();
	updateElemList();
	updateStatus();
	uniInterface();
	showToast(`黑暗方块 #${internalId} 已放置`);
}

function addButtonSequence() {
	const internalId = generateInternalId('BS');
	state.buttonSequences.push({
		id: internalId,
		xmlId: '',
		sequenceInOrder: false,
		affectMoving: '',
		affectBumpers: '',
		triggerAchievements: '',
		affectButtons: '',
		buttons: []
	});
	selectElement('buttonsequence', internalId);
	updateElemList();
	updatePanel();
	uniInterface();
	showToast(`按钮序列 #${internalId} 已创建`);
}



// ===== ButtonSequence 子按钮辅助函数 =====
window.addButtonSequenceButton = function(parentId) {
	const parent = state.buttonSequences.find(b => b.id === parentId);
	if (!parent) return;
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
	updatePanel();
	uniInterface();
	showToast('已添加子按钮');
};

window.removeButtonSequenceButton = function(parentId, idx) {
	const parent = state.buttonSequences.find(b => b.id === parentId);
	if (!parent || !parent.buttons || idx >= parent.buttons.length) return;
	parent.buttons.splice(idx, 1);
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
	// 交换位置
	const tmp = parent.buttons[idx];
	parent.buttons[idx] = parent.buttons[newIdx];
	parent.buttons[newIdx] = tmp;
	updatePanel();
	uniInterface();
	showToast('已调整顺序');
};

window.updateButtonSequenceButtonProp = function(parentId, idx, key, val) {
	const parent = state.buttonSequences.find(b => b.id === parentId);
	if (!parent || !parent.buttons || idx >= parent.buttons.length) return;
	const btn = parent.buttons[idx];
	if (key === 'visible') {
		btn.visible = val;
	} else if (key === 'id') {
		let newId = String(val).trim();
		if (!newId) { showToast('编号不能为空'); return; }
		// 放宽验证：允许汉字、字母、数字、下划线、连字符，不允许空格、逗号、尖括号、引号
		if (!/^[^\s,<>"']+$/.test(newId)) { showToast('编号包含非法字符'); return; }
		// 检查全局唯一性
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
		// 排除自己
		const conflict = allIds.some(id => id === newId && id !== btn.id);
		if (conflict) { showToast('ID已存在'); return; }
		// 更新按钮的id
		const oldId = btn.id;
		btn.id = newId;
		// 如果当前选中的元素就是这个子按钮，更新选中状态
		if (state.selectedElement && state.selectedElement.type === 'seqbutton' && state.selectedElement.id === oldId) {
			state.selectedElement.id = newId;
		}
		// 注意：其他元素可能引用此ID？对于子按钮，一般不被引用，可以忽略。
	} else {
		setField(btn, key, val);
	}
	uniInterface();
	updatePanel();
};

window.updateButtonSequenceButtonPos = function(parentId, idx, axis, val) {
	const parent = state.buttonSequences.find(b => b.id === parentId);
	if (!parent || !parent.buttons || idx >= parent.buttons.length) return;
	const btn = parent.buttons[idx];
	if (!btn.position) btn.position = { x: 0, y: 0, z: 0 };
	btn.position[axis] = val;
	btn.movingPlatformID = '';
	expandCanvasRangeForPoint(btn.position.x, btn.position.y, btn.position.z);
	uniInterface();
	updatePanel();
	requestRender();
};

window.updateButtonSequenceButtonMovingPlatform = function(parentId, idx, val) {
	const parent = state.buttonSequences.find(b => b.id === parentId);
	if (!parent || !parent.buttons || idx >= parent.buttons.length) return;
	const btn = parent.buttons[idx];

	if (val) {
		// 绑定：不动 position
		btn.movingPlatformID = val;
		const mp = state.movingPlatforms.find(m => m.id === val || m.xmlId === val);
		if (mp) {
			const pos = getMovingPos(mp);
			expandCanvasRangeForPoint(pos.x, pos.y, pos.z);
		}
	} else {
		// 解绑：把移动平台当前位置快照为子按钮 position
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

	uniInterface();
	updatePanel();
	requestRender();
};

// ---- 坐标更新函数 ----
window.updateFallingPos = function(id, axis, val) {
	const elem = state.fallingPlatforms.find(p => p.id === id);
	if (!elem) return;
	if (axis === 'x') elem.x = val;
	else if (axis === 'y') elem.y = val;
	else if (axis === 'z') elem.z = val;
	expandCanvasRangeForPoint(elem.x, elem.y, elem.z);
	requestRender();
	updatePanel();
	uniInterface();
};

window.updatePrismPos = function(id, axis, val) {
	const elem = state.prisms.find(p => p.id === id);
	if (!elem) return;
	if (axis === 'x') elem.x = val;
	else if (axis === 'y') elem.y = val;
	else if (axis === 'z') elem.z = val;
	expandCanvasRangeForPoint(elem.x, elem.y, elem.z);
	requestRender();
	updatePanel();
	uniInterface();
};

window.updateResizerPos = function(id, axis, val) {
	const elem = state.resizers.find(p => p.id === id);
	if (!elem) return;
	if (axis === 'x') elem.x = clamp(val, 0, state.level.size.w - 1);
	else if (axis === 'y') elem.y = clamp(val, 0, state.level.size.l - 1);
	else if (axis === 'z') elem.z = clamp(val, 0, state.level.size.h);
	expandCanvasRangeForPoint(elem.x, elem.y, elem.z);
	requestRender();
	updatePanel();
	uniInterface();
};

window.updateBumperPos = function(id, axis, val) {
	const elem = state.bumpers.find(p => p.id === id);
	if (!elem) return;
	if (axis === 'x') elem.x = val;
	else if (axis === 'y') elem.y = val;
	else if (axis === 'z') elem.z = val;
	expandCanvasRangeForPoint(elem.x, elem.y, elem.z);
	requestRender();
	updatePanel();
	uniInterface();
};

window.updateCheckpointPos = function(id, axis, val) {
	const elem = state.checkpoints.find(p => p.id === id);
	if (!elem) return;
	if (axis === 'x') elem.x = val;
	else if (axis === 'y') elem.y = val;
	else if (axis === 'z') elem.z = val;
	expandCanvasRangeForPoint(elem.x, elem.y, elem.z);
	requestRender();
	updatePanel();
	uniInterface();
};

window.updateCameraTriggerPos = function(id, axis, val) {
	const elem = state.cameraTriggers.find(p => p.id === id);
	if (!elem) return;
	if (axis === 'x') elem.x = val;
	else if (axis === 'y') elem.y = val;
	else if (axis === 'z') elem.z = val;
	expandCanvasRangeForPoint(elem.x, elem.y, elem.z);
	requestRender();
	updatePanel();
	uniInterface();
};

window.updateButtonPos = function(id, axis, val) {
	const elem = state.buttons.find(p => p.id === id);
	if (!elem) return;
	if (axis === 'x') elem.x = val;
	else if (axis === 'y') elem.y = val;
	else if (axis === 'z') elem.z = val;
	// 如果修改了位置，清除 MovingPlatformID
	elem.movingPlatformID = '';
	expandCanvasRangeForPoint(elem.x, elem.y, elem.z);
	requestRender();
	updatePanel();
	uniInterface();
};

// ===== OtherCube 子元素辅助函数 =====
window.addOtherCubeSubMP = function(parentId) {
	const parent = state.otherCubes.find(o => o.id === parentId);
	if (!parent) return;
	if (!parent.subMovingPlatforms) parent.subMovingPlatforms = [];
	parent.subMovingPlatforms.push({
		autoStart: false,
		loopStartIndex: 0,
		fullBlock: true,
		// waypoints 将由父元素自动生成，我们不需要存储，仅保存基本属性
	});
	updatePanel();
	uniInterface();
	showToast('已添加子 MovingPlatform');
};
window.removeOtherCubeSubMP = function(parentId, idx) {
	const parent = state.otherCubes.find(o => o.id === parentId);
	if (!parent || !parent.subMovingPlatforms) return;
	parent.subMovingPlatforms.splice(idx, 1);
	updatePanel();
	uniInterface();
	showToast('已删除子 MovingPlatform');
};
window.updateOtherCubeSubMPProp = function(parentId, idx, key, val) {
	const parent = state.otherCubes.find(o => o.id === parentId);
	if (!parent || !parent.subMovingPlatforms || idx >= parent.subMovingPlatforms.length) return;
	setField(parent.subMovingPlatforms[idx], key, val);
	uniInterface();
};

window.addOtherCubeSubButton = function(parentId) {
	const parent = state.otherCubes.find(o => o.id === parentId);
	if (!parent) return;
	if (!parent.subButtons) parent.subButtons = [];
	parent.subButtons.push({
		visible: false,
		disableCount: 0,
		mode: 'StayDown',
		affectMoving: '',
		affectBumpers: '',
		triggerAchievements: '',
		affectButtons: ''
	});
	updatePanel();
	uniInterface();
	showToast('已添加子 Button');
};
window.removeOtherCubeSubButton = function(parentId, idx) {
	const parent = state.otherCubes.find(o => o.id === parentId);
	if (!parent || !parent.subButtons) return;
	parent.subButtons.splice(idx, 1);
	updatePanel();
	uniInterface();
	showToast('已删除子 Button');
};
window.updateOtherCubeSubButtonProp = function(parentId, idx, key, val) {
	const parent = state.otherCubes.find(o => o.id === parentId);
	if (!parent || !parent.subButtons || idx >= parent.subButtons.length) return;
	setField(parent.subButtons[idx], key, val);
	uniInterface();
};
window.updateOtherCubeSubButtonChecklist = function(parentId, idx, field, checkId, checked) {
	const parent = state.otherCubes.find(o => o.id === parentId);
	if (!parent || !parent.subButtons || idx >= parent.subButtons.length) return;
	const btn = parent.subButtons[idx];
	let list = (btn[field] || '').split(',').filter(s => s.trim() !== '');
	if (checked) {
		if (!list.includes(checkId)) list.push(checkId);
	} else {
		list = list.filter(s => s !== checkId);
	}
	btn[field] = list.join(',');
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
    target.keyEvents = [];
    uniInterface();
    updatePanel();
    showToast('已清空按键事件');
};

window.addOtherCubeKeyEvent = function(parentId) {
	const parent = state.otherCubes.find(o => o.id === parentId);
	if (!parent) return;
	if (!parent.keyEvents) parent.keyEvents = [];
	parent.keyEvents.push({ dir: 'West', type: 'Down', timeOffset: 0 });
	updatePanel();
	uniInterface();
	showToast('已添加按键事件');
};
window.removeOtherCubeKeyEvent = function(parentId, idx) {
	const parent = state.otherCubes.find(o => o.id === parentId);
	if (!parent || !parent.keyEvents) return;
	parent.keyEvents.splice(idx, 1);
	updatePanel();
	uniInterface();
	showToast('已删除按键事件');
};
window.updateOtherCubeKeyEventProp = function(parentId, idx, key, val) {
	const parent = state.otherCubes.find(o => o.id === parentId);
	if (!parent || !parent.keyEvents || idx >= parent.keyEvents.length) return;
	setField(parent.keyEvents[idx], key, val);
	uniInterface();
};

// ===== DarkCube 子元素辅助函数 =====
window.addDarkCubeKeyEvent = function(parentId) {
	const parent = state.darkCubes.find(o => o.id === parentId);
	if (!parent) return;
	if (!parent.keyEvents) parent.keyEvents = [];
	parent.keyEvents.push({ dir: 'West', type: 'Down', timeOffset: 0 });
	updatePanel();
	uniInterface();
	showToast('已添加按键事件');
};
window.removeDarkCubeKeyEvent = function(parentId, idx) {
	const parent = state.darkCubes.find(o => o.id === parentId);
	if (!parent || !parent.keyEvents) return;
	parent.keyEvents.splice(idx, 1);
	updatePanel();
	uniInterface();
	showToast('已删除按键事件');
};
window.updateDarkCubeKeyEventProp = function(parentId, idx, key, val) {
	const parent = state.darkCubes.find(o => o.id === parentId);
	if (!parent || !parent.keyEvents || idx >= parent.keyEvents.length) return;
	setField(parent.keyEvents[idx], key, val);
	uniInterface();
};



// 更新函数
window.updateMovingProp = function(id, key, val) {
	const m = state.movingPlatforms.find(p => p.id === id);
	if (!m) return;
	if (key === 'relatedTo') {
		setField(m, 'relatedTo', val);
		updatePanel();
	} else if (key === 'offset') {
		setField(m, 'offset', val);
	} else {
		setField(m, key, val);
	}
	if (key === 'loopStartIndex') {
		const maxWp = m.waypoints ? m.waypoints.length : 1;
		if (val > maxWp) val = maxWp;
	}
	requestRender();
	updatePanel();
	updateElemList();
	uniInterface();
};

window.updateMovingPos = function(id, axis, val) {
	const m = state.movingPlatforms.find(p => p.id === id);
	if (!m) return;
	const pos = getMovingPos(m);
	pos[axis] = val;
	setMovingPos(m, pos.x, pos.y, pos.z);
	expandCanvasRangeForPoint(pos.x, pos.y, pos.z);
	requestRender();
	updatePanel();
	uniInterface();
};

window.updateWaypoint = function(id, idx, key, val) {
	const m = state.movingPlatforms.find(p => p.id === id);
	if (!m || !m.waypoints || idx >= m.waypoints.length) return;
	if (key === 'x' || key === 'y' || key === 'z') {
		m.waypoints[idx][key] = val;
	} else {
		m.waypoints[idx][key] = Math.max(0, val);
	}
	// 获取修改后的路点坐标，扩展画布范围
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
    const keep = state.keepPrevProps;
    const last = m.waypoints[m.waypoints.length - 1] || { x: 0, y: 0, z: 0, travelTime: 30 };
    const newWp = {
        x: Math.min(last.x + 1, state.level.size.w - 1),
        y: last.y, z: last.z,
        travelTime: keep ? (last.travelTime ?? 30) : 30,
        pauseTime: keep ? (last.pauseTime ?? 0) : 0,
    };
    m.waypoints.push(newWp);
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
	m.waypoints.splice(idx, 1);
	updatePanel();
	requestRender();
	uniInterface();
	showToast('已删除路点');
};

// 其他更新函数
window.updateFallingProp = function(id, key, val) {
	const m = state.fallingPlatforms.find(p => p.id === id);
	if (m) {
		setField(m, key, val);
		uniInterface();
		requestRender();
		updatePanel();
	}
};
window.updatePrismProp = function(id, key, val) {
	const m = state.prisms.find(p => p.id === id);
	if (m) {
		setField(m, key, val);
		uniInterface();
		requestRender();
		updatePanel();
	}
};
window.updateResizerProp = function(id, key, val) {
	const m = state.resizers.find(p => p.id === id);
	if (m) {
		setField(m, key, val);
		uniInterface();
		requestRender();
		updatePanel();
	}
};
window.updateBumperProp = function(id, key, val) {
	const m = state.bumpers.find(p => p.id === id);
	if (m) {
		setField(m, key, val);
		uniInterface();
		requestRender();
		updatePanel();
	}
};
window.updateBumperDirEnabled = function(id, dir, enabled) {
	const m = state.bumpers.find(p => p.id === id);
	if (m && m[dir]) {
		m[dir].enabled = enabled;
		uniInterface();
		requestRender();
		updatePanel();
	}
};
window.updateBumperDir = function(id, dir, key, val) {
	const m = state.bumpers.find(p => p.id === id);
	if (m && m[dir]) { m[dir][key] = val;
		uniInterface();
		requestRender();
		updatePanel(); }
};
window.updateCheckpointProp = function(id, key, val) {
	const m = state.checkpoints.find(p => p.id === id);
	if (m) {
		setField(m, key, val);
		uniInterface();
		requestRender();
		updatePanel();
	}
};
window.updateCameraTriggerProp = function(id, key, val) {
	const m = state.cameraTriggers.find(p => p.id === id);
	if (m) {
		setField(m, key, val);
		uniInterface();
		requestRender();
		updatePanel();
	}
};

window.updateButtonProp = function(id, key, val) {
    const m = state.buttons.find(p => p.id === id);
    if (!m) return;

    if (key === 'movingPlatformID') {
        if (val) {
            // 绑定移动平台：不碰 x/y/z（保留旧坐标，作为潜在回退）
            m.movingPlatformID = val;
        } else {
            // 解绑：把移动平台当前位置快照为按钮新坐标
            if (m.movingPlatformID) {
                const mp = state.movingPlatforms.find(p =>
                    p.id === m.movingPlatformID || p.xmlId === m.movingPlatformID
                );
                if (mp) {
                    const pos = getMovingPos(mp);
                    m.x = pos.x;
                    m.y = pos.y;
                    m.z = pos.z + 1;
                } else {
                    // 找不到平台时兜底
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

    uniInterface();
    requestRender();
    updatePanel();
};
		
// 原函数（替换）
window.updateButtonChecklist = function(id, field, checkId, checked) {
    const elem = state.buttons.find(b => b.id === id);
    if (!elem) return;
    let str = elem[field] || '';
    // 解析现有条目
    const items = str.split(',').map(s => s.trim()).filter(s => s);
    if (checked) {
        // 添加：如果该ID不在任何条目中，则添加 id(0)
        const exists = items.some(item => {
            const match = item.match(/^([^(]+)\((\d+)\)$/);
            if (match) return match[1].trim() === checkId;
            return item === checkId;
        });
        if (!exists) {
            items.push(checkId);
        }
    } else {
        // 移除：删除所有匹配该ID的条目（包括带括号的）
        const newItems = items.filter(item => {
            const match = item.match(/^([^(]+)\((\d+)\)$/);
            if (match) return match[1].trim() !== checkId;
            return item !== checkId;
        });
        items.length = 0;
        items.push(...newItems);
    }
    elem[field] = items.join(',');
    uniInterface();
    updatePanel();
};

// 同理，按钮序列的：
window.updateButtonSeqChecklist = function(id, field, checkId, checked) {
    const seq = state.buttonSequences.find(b => b.id === id);
    if (!seq) return;
    let str = seq[field] || '';
    const items = str.split(',').map(s => s.trim()).filter(s => s);
    if (checked) {
        const exists = items.some(item => {
            const match = item.match(/^([^(]+)\((\d+)\)$/);
            if (match) return match[1].trim() === checkId;
            return item === checkId;
        });
        if (!exists) {
            items.push(checkId);
        }
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
    uniInterface();
    updatePanel();
};

// 更新按钮序列的其他属性（如 sequenceInOrder, triggerAchievements 等）
window.updateButtonSeqProp = function(id, key, val) {
	const seq = state.buttonSequences.find(b => b.id === id);
	if (!seq) return;
	setField(seq, key, val);
	uniInterface();
	updatePanel();
};


window.updateButtonAffectData = function(btnId, field, checkId, value) {
    const btn = state.buttons.find(b => b.id === btnId);
    if (!btn) return;
    let str = btn[field] || '';
    const items = str.split(',').map(s => s.trim()).filter(s => s);
    const num = parseInt(value, 10);
    // 移除原有该ID的条目（无论是纯ID还是带括号）
    let filteredItems = items.filter(item => {
        const match = item.match(/^([^(]+)\((\d+)\)$/);
        if (match) return match[1].trim() !== checkId;
        return item !== checkId;
    });
    if (num !== -1 && !isNaN(num)) {
        // 添加带括号的
        filteredItems.push(`${checkId}(${num})`);
    } else {
        // 添加纯ID（即不输出数据）
        filteredItems.push(checkId);
    }
    btn[field] = filteredItems.join(',');
    uniInterface();
    updatePanel();
};

// 序列版本
window.updateButtonSeqAffectData = function(seqId, field, checkId, value) {
    const seq = state.buttonSequences.find(b => b.id === seqId);
    if (!seq) return;
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
    uniInterface();
    updatePanel();
};
// OtherCube / DarkCube 更新
window.updateOtherCubeProp = function(id, key, val) {
	const m = state.otherCubes.find(p => p.id === id);
	if (m) {
		setField(m, key, val);
		// 如果修改的是坐标相关，扩展范围
		if (['triggerX','triggerY','triggerZ','cubeX','cubeY','cubeZ'].includes(key)) {
			expandCanvasRangeForPoint(m.triggerX, m.triggerY, m.triggerZ);
			expandCanvasRangeForPoint(m.cubeX, m.cubeY, m.cubeZ);
		}
		uniInterface();
		requestRender();
		updatePanel();
	}
};

window.updateDarkCubeProp = function(id, key, val) {
	const m = state.darkCubes.find(p => p.id === id);
	if (m) {
		setField(m, key, val);
		if (['triggerX','triggerY','triggerZ','cubeX','cubeY','cubeZ'].includes(key)) {
			expandCanvasRangeForPoint(m.triggerX, m.triggerY, m.triggerZ);
			expandCanvasRangeForPoint(m.cubeX, m.cubeY, m.cubeZ);
		}
		uniInterface();
		requestRender();
		updatePanel();
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
	let counter = 0;
	let candidate = finalId;
	while (arr.some(e => e.id === candidate && e.id !== internalId)) {
		counter++;
		candidate = finalId + 'a'.repeat(counter);
	}
	elem.id = candidate;
	// 自动同步xmlid（如果启用自动命名且类型是 moving/bumper/button）
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
	uniInterface();
	updatePanel();
	requestRender();
	showToast('编号已更新');
};

window.removeStatic = function(x, y, z) {
	const layer = state.staticBlocks[z];
	if (layer && layer[y]) {
		layer[y][x] = null;
		if (state.selectedElement && state.selectedElement.type === 'static' &&
			state.selectedElement.staticCoord.x === x && state.selectedElement.staticCoord.y === y &&
			state.selectedElement.staticCoord.z === z) {
			state.selectedElement = null;
		}
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
    [m.waypoints[idx], m.waypoints[newIdx]] = [m.waypoints[newIdx], m.waypoints[idx]];
    uniInterface(); requestRender(); updatePanel(); showToast('路点顺序已调整');
};