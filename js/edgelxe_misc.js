
window.deleteElement = deleteElement;
window.selectElement = selectElement;
window.closeSelectDialog = closeSelectDialog;
window.addButtonSequence = addButtonSequence;
window.updateElementId = function(type, oldId, newId) {
	if (!newId.trim()) { showToast('ID不能为空'); return; }
	// 放宽验证：允许汉字、字母、数字、下划线、连字符，不允许空格、逗号、尖括号、引号
	if (!/^[^\s,<>"']+$/.test(newId)) { showToast('ID包含非法字符'); return; }
	// 收集所有元素类型的id（全局）
	const allIds = new Set();
	const typeKeys = ['movingPlatforms','fallingPlatforms','prisms','resizers','bumpers','checkpoints','cameraTriggers','buttons','buttonSequences','otherCubes','darkCubes'];
	typeKeys.forEach(key => {
		const arr = state[key] || [];
		arr.forEach(item => {
			if (item.id) allIds.add(item.id);
		});
	});
	const arrays = {
		moving: state.movingPlatforms,
		falling: state.fallingPlatforms,
		prism: state.prisms,
		resizer: state.resizers,
		bumper: state.bumpers,
		checkpoint: state.checkpoints,
		cameratrigger: state.cameraTriggers,
		button: state.buttons,
		buttonsequence: state.buttonSequences,
		othercube: state.otherCubes,
		darkcube: state.darkCubes,
	};
	const arr = arrays[type];
	if (!arr) return;
	const elem = arr.find(m => m.id === oldId);
	if (!elem) return;
	// 从全局集合中移除自己的旧ID
	if (elem.id) allIds.delete(elem.id);
	let candidate = newId.trim();
	if (allIds.has(candidate)) {
		// 冲突，自动追加6位十六进制后缀
		let attempts = 0;
		let newCandidate;
		do {
			const suffix = Math.floor(Math.random() * 16777216).toString(16).padStart(6, '0');
			newCandidate = candidate + suffix;
			attempts++;
		} while (allIds.has(newCandidate) && attempts < 30);
		if (allIds.has(newCandidate)) {
			showToast('无法生成唯一ID，请手动修改');
			return;
		}
		candidate = newCandidate;
		showToast('ID已存在，已自动追加随机后缀');
	}
	elem.id = candidate;
	// 自动同步xmlid（如果启用自动命名且类型是 moving/bumper/button）此处不做自动同步，用户手动点击同步按钮
	// 更新选中状态
	if (state.selectedElement && state.selectedElement.type === type && state.selectedElement.id === oldId) {
		state.selectedElement.id = candidate;
	}
	requestRender();
	updatePanel();
	updateElemList();
	saveCache();
	showToast('编号已更新');
};

document.addEventListener('mouseup', () => {
		state.isDrawing = false;
	});
	
// 颜色选择器
const colorPicker = document.getElementById('staticColorPicker');
colorPicker.addEventListener('input', function() {
	const hex = this.value;
	const r = parseInt(hex.slice(1,3), 16);
	const g = parseInt(hex.slice(3,5), 16);
	const b = parseInt(hex.slice(5,7), 16);
	state.staticColor = { r, g, b };
	// 如果当前工具是静态，则应用颜色（可选）
});
// 初始化颜色选择器值（根据当前层的默认颜色，或之前保存的）
const defaultColor = getStaticDefault(state.currentLayer);
const hex = '#' + [defaultColor.r, defaultColor.g, defaultColor.b].map(c => c.toString(16).padStart(2,'0')).join('');
colorPicker.value = hex;

// 显示控制
const visibilityDiv = document.getElementById('visibilityCheckboxes');
const visibilityTypes = [
	{ key: 'static', label: '静态' },
	{ key: 'moving', label: '移动' },
	{ key: 'falling', label: '掉落' },
	{ key: 'prism', label: '棱柱' },
	{ key: 'resizer', label: '尺寸' },
	{ key: 'bumper', label: '撞击' },
	{ key: 'checkpoint', label: '存档' },
	{ key: 'cameratrigger', label: '相机' },
	{ key: 'button', label: '按钮' },
	{ key: 'othercube', label: '提示' },
	{ key: 'darkcube', label: '黑暗' },
	{ key: 'buttonsequence', label: '序列' },
	{ key: 'waypoint', label: '路点' },
	{ key: 'spawn', label: '出生点' },
	{ key: 'exit', label: '终点' }
];
visibilityTypes.forEach(type => {
	const label = document.createElement('label');
	label.style.cssText = 'display:flex;align-items:center;gap:4px;color:#ccc;';
	const cb = document.createElement('input');
	cb.type = 'checkbox';
    cb.dataset.visKey = type.key;
	cb.checked = state.visibility[type.key];
	cb.addEventListener('change', function() {
		state.visibility[type.key] = this.checked;
		requestRender();
		saveCache();
	});
	label.appendChild(cb);
	label.appendChild(document.createTextNode(type.label));
	visibilityDiv.appendChild(label);
});

// ---- 全选复选框 ----
const selectAllLabel = document.createElement('label');
selectAllLabel.style.cssText = 'display:flex;align-items:center;gap:4px;color:#8ab4f8;font-weight:bold;margin-left:8px;';
const selectAllCb = document.createElement('input');
selectAllCb.type = 'checkbox';
selectAllCb.checked = true;
selectAllCb.id = 'selectAllVisibility';
selectAllCb.addEventListener('change', function() {
	const checked = this.checked;
	// 获取所有可见性复选框（排除自己）
	const allCbs = visibilityDiv.querySelectorAll('input[type="checkbox"]');
	allCbs.forEach(cb => {
		if (cb !== selectAllCb) {
			cb.checked = checked;
			// 触发 change 事件以更新 state
			const evt = new Event('change', { bubbles: true });
			cb.dispatchEvent(evt);
		}
	});
});
selectAllLabel.appendChild(selectAllCb);
selectAllLabel.appendChild(document.createTextNode('全选'));
visibilityDiv.appendChild(selectAllLabel);

// 当其他复选框变化时，更新全选状态（半选/全选状态）
function updateSelectAllState() {
	const allCbs = visibilityDiv.querySelectorAll('input[type="checkbox"]');
	let allChecked = true;
	let anyChecked = false;
	allCbs.forEach(cb => {
		if (cb.id !== 'selectAllVisibility') {
			if (!cb.checked) allChecked = false;
			if (cb.checked) anyChecked = true;
		}
	});
	const selectAll = document.getElementById('selectAllVisibility');
	if (selectAll) {
		selectAll.checked = allChecked;
		selectAll.indeterminate = !allChecked && anyChecked;
	}
}

// 根据 state.visibility 同步所有复选框的勾选状态
function syncVisibilityUI() {
    if (!visibilityDiv) return;
    visibilityDiv.querySelectorAll('input[type="checkbox"][data-vis-key]').forEach(cb => {
        const key = cb.dataset.visKey;
        if (key && key in state.visibility) {
            cb.checked = !!state.visibility[key];
        }
    });
    // 顺便更新“全选”状态
    if (typeof updateSelectAllState === 'function') {
        updateSelectAllState();
    }
}
window.syncVisibilityUI = syncVisibilityUI;   // 便于其他地方调用

// 监听所有复选框的 change 事件以更新全选状态
visibilityDiv.addEventListener('change', function(e) {
	if (e.target && e.target.type === 'checkbox' && e.target.id !== 'selectAllVisibility') {
		updateSelectAllState();
	}
});

// 初始化全选状态
updateSelectAllState();

document.getElementById('toolSingle').addEventListener('click', function() {
	state.drawMode = 'single';
	this.classList.add('active');
	document.getElementById('toolBrush').classList.remove('active');
	showToast('模式: 单点');
});

document.getElementById('toolBrush').addEventListener('click', function() {
	state.drawMode = 'brush';
	this.classList.add('active');
	document.getElementById('toolSingle').classList.remove('active');
	showToast('模式: 画笔');
});

// 3D预览
document.getElementById('toggle3dBtn').addEventListener('click', function() {
	show3D();
});

document.getElementById('close3dBtn').addEventListener('click', function() {
	hide3D();
});

// 窗口大小变化时调整3D
window.addEventListener('resize', onResize3D);


function newProject() {
	// 检查是否有数据（静态块或元素）
	let hasData = false;
	for (const z in state.staticBlocks) {
		const layer = state.staticBlocks[z];
		for (let y = 0; y < layer.length; y++) {
			for (let x = 0; x < layer[y].length; x++) {
				if (layer[y][x]) { hasData = true; break; }
			}
			if (hasData) break;
		}
		if (hasData) break;
	}
	if (!hasData) {
		// 检查其他元素
		hasData = state.movingPlatforms.length > 0 || state.fallingPlatforms.length > 0 ||
				  state.prisms.length > 0 || state.resizers.length > 0 ||
				  state.bumpers.length > 0 || state.checkpoints.length > 0 ||
				  state.cameraTriggers.length > 0 || state.buttons.length > 0 ||
				  state.buttonSequences.length > 0 || state.otherCubes.length > 0 ||
				  state.darkCubes.length > 0;
	}

	if (hasData) {
		const wantNew = confirm(
			'确定新建项目吗？ \n\n' +
			'点击【确定】→ 确认新建\n' +
			'点击【取消】→ 不新建'
		);
		if (wantNew) {
			const confirmNew = confirm(
				'是否保存当前项目？\n\n' +
				'点击【确定】→ 保存并导出为zip\n' +
				'点击【取消】→ 丢弃当前所有数据'
			);
			if (confirmNew) {
				exportZip(); // 导出并继续新建
			}
		} else {
			return; 
		}
	}

	// 重置所有数据
	const { w, l, h } = state.level.size;
	// 重置静态块（全空）
	const newStatic = {};
	for (let z = 0; z < h; z++) {
		newStatic[z] = Array.from({ length: l }, () => Array(w).fill(null));
	}
	state.staticBlocks = newStatic;

	// 重置所有元素数组
	state.movingPlatforms = [];
	state.fallingPlatforms = [];
	state.prisms = [];
	state.resizers = [];
	state.bumpers = [];
	state.checkpoints = [];
	state.cameraTriggers = [];
	state.buttons = [];
	state.buttonSequences = [];
	state.otherCubes = [];
	state.darkCubes = [];
	state.unknownElements = [];
	state.nextIdCounter = 1;
	state._idCounters = {};  // ← 添加这行
	state.selectedElement = null;

	// 重置 level 为默认值（但保留当前尺寸？此处重置为默认 10x10x3）
	state.level = {
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
	};

	state.currentLayer = 0;
	layerInput.value = 0;
	
	// ---- 清理3D场景 ----
    if (threeScene) {
        clear3DScene();
    }
    state.highlightedMesh = null;
    state.selected3D = null;
    state.selectedElement = null;

	syncLevelUI();
	updateLayerMax();
	requestRender();
	updatePanel();
	updateElemList();
	refreshUnifiedBaseList();
	updateStatus();
	saveCache();
	showToast('已新建空项目');
}

function updateLayerMax() {
	const minZ = state.canvasRange.minZ;
	const maxZ = state.canvasRange.maxZ;
	layerInput.min = minZ;
	layerInput.max = maxZ;
	if (state.currentLayer < minZ) {
		state.currentLayer = minZ;
		layerInput.value = minZ;
		requestRender();
	} else if (state.currentLayer > maxZ) {
		state.currentLayer = maxZ;
		layerInput.value = maxZ;
		requestRender();
	}
}

// 根据 level.size 更新 canvasRange（确保至少包含 size 范围）
function updateCanvasRangeFromSize() {
	const { w, l, h } = state.level.size;
	let minX = 0, maxX = w - 1, minY = 0, maxY = l - 1, minZ = 0, maxZ = h - 1;

	// 收集所有元素的坐标（包括路点、子按钮等）
	const allPoints = [];

	// 移动平台起点 + 路点
	state.movingPlatforms.forEach(m => {
		const p = getMovingPos(m);
		if (p) allPoints.push(p);
		if (m.waypoints) {
			m.waypoints.forEach(wp => allPoints.push(wp));
		}
	});

	// 其他元素
	state.fallingPlatforms.forEach(m => allPoints.push({ x: m.x, y: m.y, z: m.z }));
	state.prisms.forEach(m => allPoints.push({ x: m.x, y: m.y, z: m.z }));
	state.resizers.forEach(m => allPoints.push({ x: m.x, y: m.y, z: m.z }));
	state.bumpers.forEach(m => allPoints.push({ x: m.x, y: m.y, z: m.z }));
	state.checkpoints.forEach(m => allPoints.push({ x: m.x, y: m.y, z: m.z }));
	state.cameraTriggers.forEach(m => allPoints.push({ x: m.x, y: m.y, z: m.z }));
	state.buttons.forEach(m => allPoints.push({ x: m.x, y: m.y, z: m.z }));

	// OtherCube / DarkCube 的触发点和方块位置
	state.otherCubes.forEach(m => {
		allPoints.push({ x: m.triggerX, y: m.triggerY, z: m.triggerZ });
		allPoints.push({ x: m.cubeX, y: m.cubeY, z: m.cubeZ });
	});
	state.darkCubes.forEach(m => {
		allPoints.push({ x: m.triggerX, y: m.triggerY, z: m.triggerZ });
		allPoints.push({ x: m.cubeX, y: m.cubeY, z: m.cubeZ });
	});

	// 按钮序列内的子按钮位置
	state.buttonSequences.forEach(seq => {
		if (seq.buttons) {
			seq.buttons.forEach(btn => {
				if (btn.position) allPoints.push(btn.position);
				// 如果绑定了移动平台，该位置由移动平台覆盖，无需重复
			});
		}
	});

	// 扩展范围
	allPoints.forEach(p => {
		if (p.x !== undefined && p.y !== undefined && p.z !== undefined) {
			if (p.x < minX) minX = p.x;
			if (p.x > maxX) maxX = p.x;
			if (p.y < minY) minY = p.y;
			if (p.y > maxY) maxY = p.y;
			if (p.z < minZ) minZ = p.z;
			if (p.z > maxZ) maxZ = p.z;
		}
	});

	// 确保至少包含整个关卡尺寸
	minX = Math.min(minX, 0);
	maxX = Math.max(maxX, w - 1);
	minY = Math.min(minY, 0);
	maxY = Math.max(maxY, l - 1);
	minZ = Math.min(minZ, 0);
	maxZ = Math.max(maxZ, h - 1);

	state.canvasRange.minX = minX;
	state.canvasRange.maxX = maxX;
	state.canvasRange.minY = minY;
	state.canvasRange.maxY = maxY;
	state.canvasRange.minZ = minZ;
	state.canvasRange.maxZ = maxZ;
    // 把当前层纳入范围，避免撤销/切层时被钳制
    const curZ = state.currentLayer;
    if (typeof curZ === 'number' && !isNaN(curZ)) {
        if (curZ < minZ) minZ = curZ;
        if (curZ > maxZ) maxZ = curZ;
        state.canvasRange.minZ = minZ;
        state.canvasRange.maxZ = maxZ;
    }
}
// 扩展 canvasRange 以包含某个点（用于其他元素添加时）
function expandCanvasRangeForPoint(x, y, z) {
	if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return;
	let changed = false;
	if (x < state.canvasRange.minX) { state.canvasRange.minX = x; changed = true; }
	if (x > state.canvasRange.maxX) { state.canvasRange.maxX = x; changed = true; }
	if (y < state.canvasRange.minY) { state.canvasRange.minY = y; changed = true; }
	if (y > state.canvasRange.maxY) { state.canvasRange.maxY = y; changed = true; }
	if (z < state.canvasRange.minZ) { state.canvasRange.minZ = z; changed = true; }
	if (z > state.canvasRange.maxZ) { state.canvasRange.maxZ = z; changed = true; }
	if (changed) {
		updateLayerMax();   // 更新层数限制
		requestRender();
	}/**/
}

function rebuildSpatialIndex() {
    state.spatialIndex.clear();
    const index = state.spatialIndex;

	// 辅助：写入索引，支持额外数据
    function addEntry(key, type, id, extra) {
        if (!index.has(key)) index.set(key, []);
        index.get(key).push({ type, id, extra });
    }

    // 移动平台（含起点）
    state.movingPlatforms.forEach(m => {
        const p = getMovingPos(m);
        if (p && typeof p.x === 'number') {
            addEntry(`${p.x},${p.y},${p.z}`, 'moving', m.id);
        }
    });

    // 路点（跳过起点，因为已包含）
    state.movingPlatforms.forEach(m => {
        if (m.waypoints) {
            m.waypoints.forEach((wp, idx) => {
                if (idx === 0) return;
                if (wp.x !== undefined) {
                    addEntry(`${wp.x},${wp.y},${wp.z}`, 'waypoint', null, { idx, parentId: m.id, z: wp.z });
                }
            });
        }
    });

    // 掉落平台
    state.fallingPlatforms.forEach(m => addEntry(`${m.x},${m.y},${m.z}`, 'falling', m.id));
    // 棱柱
    state.prisms.forEach(m => addEntry(`${m.x},${m.y},${m.z}`, 'prism', m.id));
    // 尺寸调整器
    state.resizers.forEach(m => addEntry(`${m.x},${m.y},${m.z}`, 'resizer', m.id));
    // 撞击器
    state.bumpers.forEach(m => addEntry(`${m.x},${m.y},${m.z}`, 'bumper', m.id));
    // 存档点
    state.checkpoints.forEach(m => addEntry(`${m.x},${m.y},${m.z}`, 'checkpoint', m.id));
    // 相机触发器
    state.cameraTriggers.forEach(m => addEntry(`${m.x},${m.y},${m.z}`, 'cameratrigger', m.id));
    // 普通按钮
    state.buttons.forEach(m => {
        let pos = { x: m.x, y: m.y, z: m.z };
        if (m.movingPlatformID) {
            const mp = state.movingPlatforms.find(p => p.id === m.movingPlatformID || p.xmlId === m.movingPlatformID);
            if (mp) pos = getMovingPos(mp);
        }
        if (pos && typeof pos.x === 'number') {
            addEntry(`${pos.x},${pos.y},${pos.z}`, 'button', m.id);
        }
    });
    // 序列子按钮
    state.buttonSequences.forEach(seq => {
        if (!seq.buttons) return;
        seq.buttons.forEach(btn => {
            let pos = null;
            if (btn.movingPlatformID) {
                const mp = state.movingPlatforms.find(p => p.id === btn.movingPlatformID || p.xmlId === btn.movingPlatformID);
                if (mp) pos = getMovingPos(mp);
            } else if (btn.position) {
                pos = btn.position;
            }
            if (pos && typeof pos.x === 'number') {
                addEntry(`${pos.x},${pos.y},${pos.z}`, 'seqbutton', btn.id);
            }
        });
    });
    // OtherCube（触发点和立方体位置）
    state.otherCubes.forEach(m => {
        addEntry(`${m.triggerX},${m.triggerY},${m.triggerZ}`, 'othercube_trigger', m.id);
        addEntry(`${m.cubeX},${m.cubeY},${m.cubeZ}`, 'othercube_cube', m.id);
    });
    // DarkCube
    state.darkCubes.forEach(m => {
        addEntry(`${m.triggerX},${m.triggerY},${m.triggerZ}`, 'darkcube_trigger', m.id);
        addEntry(`${m.cubeX},${m.cubeY},${m.cubeZ}`, 'darkcube_cube', m.id);
    });
}

function generateInternalId(prefix) {
	// 确保计数器存在
	if (!state._idCounters) {
		state._idCounters = {};
	}
	if (!state._idCounters[prefix]) {
		state._idCounters[prefix] = 0;
	}

	// 收集所有已存在的内部 ID（全局唯一）
	const allIds = new Set();
	const typeKeys = [
		'movingPlatforms', 'fallingPlatforms', 'prisms', 'resizers',
		'bumpers', 'checkpoints', 'cameraTriggers', 'buttons',
		'buttonSequences', 'otherCubes', 'darkCubes'
	];
	typeKeys.forEach(key => {
		const arr = state[key] || [];
		arr.forEach(item => {
			if (item.id) allIds.add(item.id);
		});
	});

	// 尝试生成唯一 ID
	let base;
	let candidate;
	let attempts = 0;
	do {
		state._idCounters[prefix]++;
		base = prefix + state._idCounters[prefix];
		candidate = base;

		// 如果冲突，追加 6 位随机十六进制后缀
		if (allIds.has(candidate)) {
			const suffix = Math.floor(Math.random() * 16777216)
								 .toString(16)
								 .padStart(6, '0');
			candidate = base + suffix;
			// 极低概率再次冲突，再试几次
			let extra = 0;
			while (allIds.has(candidate) && extra < 10) {
				extra++;
				const suffix2 = Math.floor(Math.random() * 16777216)
									 .toString(16)
									 .padStart(6, '0');
				candidate = base + suffix2;
			}
			// 终极保险：使用时间戳
			if (allIds.has(candidate)) {
				candidate = base + Date.now().toString(16).slice(-6);
			}
		}
		attempts++;
	} while (allIds.has(candidate) && attempts < 20);

	// 最后的保底
	while (allIds.has(candidate)) {
		candidate = base + Math.floor(Math.random() * 16777216)
						   .toString(16)
						   .padStart(6, '0');
	}

	return candidate;
}

function getArrayByType(type) {
	const map = {
		moving: state.movingPlatforms,
		falling: state.fallingPlatforms,
		prism: state.prisms,
		resizer: state.resizers,
		bumper: state.bumpers,
		checkpoint: state.checkpoints,
		cameratrigger: state.cameraTriggers,
		button: state.buttons,
		buttonsequence: state.buttonSequences,
		othercube: state.otherCubes,
		darkcube: state.darkCubes
	};
	return map[type] || [];
}

window.updateXmlId = function(internalId, type, newId) {
	const arr = getArrayByType(type);
	const elem = arr.find(e => e.id === internalId);
	if (!elem) return;
	let val = newId.trim();
	if (val) {
		if (!/^[a-zA-Z0-9]+$/.test(val)) { showToast('ID只能包含字母和数字'); return; }
		// 根据类型决定检查范围
		let conflict = false;
		if (type === 'moving') {
			// 检查所有移动平台
			conflict = state.movingPlatforms.some(m => m.xmlId === val && m.id !== internalId);
		} else if (type === 'bumper') {
			conflict = state.bumpers.some(b => b.xmlId === val && b.id !== internalId);
		} else if (type === 'button') {
			// 检查所有普通按钮和序列子按钮
			const allButtonXmlIds = new Set();
			state.buttons.forEach(b => { if (b.xmlId) allButtonXmlIds.add(b.xmlId); });
			state.buttonSequences.forEach(seq => {
				(seq.buttons || []).forEach(sb => { if (sb.xmlId) allButtonXmlIds.add(sb.xmlId); });
			});
			// 排除自己
			if (elem.xmlId) allButtonXmlIds.delete(elem.xmlId);
			conflict = allButtonXmlIds.has(val);
		} else {
			// 其他类型（如falling, prism等）没有xmlId，但保留原逻辑仅检查同数组
			conflict = arr.some(e => e.xmlId === val && e.id !== internalId);
		}
		if (conflict) {
			showToast('ID已存在，请修改');
			return;
		}
		setField(elem, 'xmlId', val);
	} else {
		delete elem.xmlId;
	}
	requestRender();
	updatePanel();
	updateElemList();
	saveCache();
	showToast('ID已更新');
};

window.syncXmlId = function(internalId, type) {
	const arr = getArrayByType(type);
	const elem = arr.find(e => e.id === internalId);
	if (!elem) return;
	let val = elem.id;
	let counter = 0;
	let candidate = val;
	while (arr.some(e => e.xmlId === candidate && e.id !== internalId)) {
		counter++;
		candidate = val + 'a'.repeat(counter);
	}
	elem.xmlId = candidate;
	requestRender();
	updatePanel();
	updateElemList();
	saveCache();
	showToast('已同步ID');
};

window.updateButtonSequenceButtonXmlId = function(parentId, idx, newId) {
	const parent = state.buttonSequences.find(b => b.id === parentId);
	if (!parent || !parent.buttons || idx >= parent.buttons.length) return;
	const btn = parent.buttons[idx];
	let val = newId.trim();
	if (val) {
		if (!/^[a-zA-Z0-9]+$/.test(val)) { showToast('ID只允许字母数字'); return; }
		// 检查所有按钮（普通按钮和所有序列子按钮）的xmlId
		const allButtonXmlIds = new Set();
		state.buttons.forEach(b => { if (b.xmlId) allButtonXmlIds.add(b.xmlId); });
		state.buttonSequences.forEach(seq => {
			(seq.buttons || []).forEach(sb => { if (sb.xmlId) allButtonXmlIds.add(sb.xmlId); });
		});
		// 排除自己
		if (btn.xmlId) allButtonXmlIds.delete(btn.xmlId);
		if (allButtonXmlIds.has(val)) {
			showToast('ID已存在，请修改');
			return;
		}
		btn.xmlId = val;
	} else {
		btn.xmlId = '';
	}
	requestRender();
	saveCache();
	updatePanel();
	showToast('ID已更新');
};

// 同步子按钮的编号到ID
window.syncButtonSequenceButtonXmlId = function(parentId, idx) {
	const parent = state.buttonSequences.find(b => b.id === parentId);
	if (!parent || !parent.buttons || idx >= parent.buttons.length) return;
	const btn = parent.buttons[idx];
	let val = btn.id;
	let counter = 0;
	let candidate = val;
	while (parent.buttons.some(e => e.xmlId === candidate && e !== btn)) {
		counter++;
		candidate = val + 'a'.repeat(counter);
	}
	btn.xmlId = candidate;
	saveCache();
	updatePanel();
	showToast('已同步ID');
};

function setField(obj, key, val) {
	// 保留字符串（包括空）、数字（非NaN）和布尔值
	if (typeof val === 'string') {
		obj[key] = val;
	} else if (typeof val === 'number' && !isNaN(val)) {
		obj[key] = val;
	} else if (typeof val === 'boolean') {
		obj[key] = val;
	} else {
		delete obj[key];
	}
}

function placeSequenceButton(x, y, z) {
	expandCanvasRangeForPoint(x, y, z);
	const seqId = state.seqEditingId;
	if (!seqId) {
		showToast('请先通过按钮序列面板中的“序列子按钮”按钮选择一个序列');
		return;
	}
	const parent = state.buttonSequences.find(b => b.id === seqId);
	if (!parent) {
		showToast('选中的按钮序列不存在，请重新选择');
		state.seqEditingId = null;
		return;
	}
	if (!parent.buttons) parent.buttons = [];
	const internalId = generateInternalId('SB');
	const autoName = document.getElementById('autoNameCheck').checked;
	parent.buttons.push({
		id: internalId,
		xmlId: autoName ? generateUniqueXmlId(internalId) : '',
		visible: true,
		position: { x, y, z },
		movingPlatformID: ''
	});
	updatePanel();
	updateElemList();
	requestRender();
	saveCache();
	showToast(`已在序列 #${seqId} 添加子按钮`);
}
function openSequenceEditor(seqId) {
	const parent = state.buttonSequences.find(b => b.id === seqId);
	if (!parent || !parent.buttons) return;
	let dialog = document.getElementById('seqEditorDialog');
	if (!dialog) {
		const div = document.createElement('div');
		div.id = 'seqEditorDialog';
		div.className = 'select-dialog';
		div.innerHTML = `
			<div class="dialog-box" style="min-width:400px;">
				<h4>调整按钮序列</h4>
				<div id="seqEditorList" style="max-height:300px;overflow-y:auto;"></div>
				<button class="cancel-btn" onclick="window.closeSeqEditor()">关闭</button>
			</div>
		`;
		document.body.appendChild(div);
		dialog = div; // ← 关键修复
	}
	dialog.style.display = 'flex';
	dialog.classList.add('active');
	renderSeqEditorList(seqId);
	fixFormFieldAssociations(dialog);
}

window.closeSeqEditor = function() {
	const dialog = document.getElementById('seqEditorDialog');
	if (dialog) {
		dialog.style.display = 'none';
		dialog.classList.remove('active');
	}
};

function renderSeqEditorList(seqId) {
	const parent = state.buttonSequences.find(b => b.id === seqId);
	if (!parent) return;
	const list = document.getElementById('seqEditorList');
	if (!list) return;
	let html = '';
	parent.buttons.forEach((btn, idx) => {
		const pos = btn.position ? `${btn.position.x},${btn.position.y},${btn.position.z}` : (btn.movingPlatformID || '无');
		html += `
			<div style="display:flex;align-items:center;gap:8px;padding:4px;border-bottom:1px solid #2a3a5a;">
				<span>#${idx+1}</span>
				<span style="font-size:12px;color:#8ab4f8;">${btn.id}${btn.xmlId ? ' ('+btn.xmlId+')' : ''}</span>
				<span style="font-size:11px;">位置: ${pos}</span>
				<label>可见
					<select onchange="updateSeqButtonProp('${seqId}',${idx},'visible', this.value==='null' ? null : (this.value==='true'))">
						<option value="true"  ${btn.visible === true  ? 'selected' : ''}>是</option>
						<option value="false" ${btn.visible === false ? 'selected' : ''}>否</option>
						<option value="null"  ${btn.visible === null  ? 'selected' : ''}>半透明</option>
					</select>
				</label>
				<button style="background:#1a4a7a;border:none;color:#fff;border-radius:3px;padding:0 8px;" onclick="moveSeqButton('${seqId}',${idx},-1)">↑</button>
				<button style="background:#1a4a7a;border:none;color:#fff;border-radius:3px;padding:0 8px;" onclick="moveSeqButton('${seqId}',${idx},1)">↓</button>
				<button style="background:#a03030;border:none;color:#fff;border-radius:3px;padding:0 8px;" onclick="removeSeqButton('${seqId}',${idx})">✕</button>
			</div>
		`;
	});
	list.innerHTML = html || '<div style="color:#5a7a9a;padding:10px;">暂无子按钮</div>';
}

// 辅助函数
function moveSeqButton(seqId, idx, delta) {
	const parent = state.buttonSequences.find(b => b.id === seqId);
	if (!parent || !parent.buttons) return;
	const newIdx = idx + delta;
	if (newIdx < 0 || newIdx >= parent.buttons.length) return;
	[parent.buttons[idx], parent.buttons[newIdx]] = [parent.buttons[newIdx], parent.buttons[idx]];
	renderSeqEditorList(seqId);
	updatePanel();
	saveCache();
}

function removeSeqButton(seqId, idx) {
	const parent = state.buttonSequences.find(b => b.id === seqId);
	if (!parent || !parent.buttons) return;
	parent.buttons.splice(idx, 1);
	renderSeqEditorList(seqId);
	updatePanel();
	saveCache();
}

function updateSeqButtonProp(seqId, idx, key, val) {
    const parent = state.buttonSequences.find(b => b.id === seqId);
    if (!parent || !parent.buttons || idx >= parent.buttons.length) return;
    const btn = parent.buttons[idx];
    if (key === 'visible') btn.visible = val;
    else setField(btn, key, val);
    saveCache();
}

function unbindSeqButton(seqId, btnId) {
	const seq = state.buttonSequences.find(b => b.id === seqId);
	if (!seq) return;
	const idx = seq.buttons.findIndex(b => b.id === btnId);
	if (idx === -1) return;
	const btn = seq.buttons[idx];
	// 从序列移除
	seq.buttons.splice(idx, 1);
	// 创建独立按钮
	const newBtn = {
		id: btn.id,
		xmlId: btn.xmlId || '',
		x: btn.position ? btn.position.x : 0,
		y: btn.position ? btn.position.y : 0,
		z: btn.position ? btn.position.z : 0,
		visible: btn.visible !== undefined ? btn.visible : true,
		disableCount: 0,
		mode: 'StayDown',
		movingPlatformID: btn.movingPlatformID || '',
		affectMoving: '',
		affectBumpers: '',
		triggerAchievements: '',
		affectButtons: ''
	};
	state.buttons.push(newBtn);
	// 更新选中状态为这个新按钮
	state.selectedElement = { type: 'button', id: newBtn.id };
	updatePanel();
	updateElemList();
	requestRender();
	saveCache();
	showToast('已解绑为普通按钮');
}

function activateSeqTool(seqId) {
	state.seqEditingId = seqId;
	setTool('seqbutton');
	showToast('已切换到序列子按钮模式，点击画布添加子按钮');
}


function getEntriesAt(x, y, z) {
    const key = `${x},${y},${z}`;
    const entries = state.spatialIndex.get(key);
    if (!entries) return [];
    // 为了保持原有数据结构（含 data 字段），需要扩展返回
    // 但原函数返回的数组元素包含 type, id, data，而索引只存了 type 和 id，没有 data。
    // 为了兼容，我们根据 type 和 id 实时获取 data（代价小，因为命中数量很少）
    return entries.map(entry => {
        let data = null;
        // 根据 type 获取实际对象
        switch (entry.type) {
            case 'moving': data = state.movingPlatforms.find(m => m.id === entry.id); break;
			case 'waypoint': {
				const extra = entry.extra;
				if (extra) {
					data = { idx: extra.idx, parentId: extra.parentId, z: extra.z };
				}
				break;
			}
            /*case 'waypoint': {
                // 需要从路点中查找，但我们索引中没有存路点的具体信息，只存了 idx 和 parentId，但未存
                // 由于路点索引我们未存储完整信息，这里做特殊处理：重新遍历路点（数量少，影响不大）
                // 或者我们可以在索引中存储更多信息，为简单，我们在此处临时查找
                for (let m of state.movingPlatforms) {
                    if (m.waypoints) {
                        const idx = m.waypoints.findIndex(wp => wp.x === x && wp.y === y && wp.z === z);
                        if (idx > 0) {
                            data = { idx, parentId: m.id, z: wp.z };
                            break;
                        }
                    }
                }
                break;
            }*/
            case 'falling': data = state.fallingPlatforms.find(m => m.id === entry.id); break;
            case 'prism': data = state.prisms.find(m => m.id === entry.id); break;
            case 'resizer': data = state.resizers.find(m => m.id === entry.id); break;
            case 'bumper': data = state.bumpers.find(m => m.id === entry.id); break;
            case 'checkpoint': data = state.checkpoints.find(m => m.id === entry.id); break;
            case 'cameratrigger': data = state.cameraTriggers.find(m => m.id === entry.id); break;
            case 'button': data = state.buttons.find(m => m.id === entry.id); break;
            case 'seqbutton': {
                for (let seq of state.buttonSequences) {
                    const btn = seq.buttons ? seq.buttons.find(b => b.id === entry.id) : null;
                    if (btn) { data = { seqId: seq.id, btn }; break; }
                }
                break;
            }
            case 'othercube_trigger':
            case 'othercube_cube': data = state.otherCubes.find(m => m.id === entry.id); break;
            case 'darkcube_trigger':
            case 'darkcube_cube': data = state.darkCubes.find(m => m.id === entry.id); break;
        }
        return { type: entry.type, id: entry.id, data };
    });
}

function getCanvasOffset() {
    return { minX: currentMinX, minY: currentMinY };
}

function getStaticCoord(x, y, z) {
    const layer = state.staticBlocks[z];
    if (layer && layer[y] && layer[y][x]) {
        return `${x},${y},${z}`;
    }
    return null;
}

function onPointerMove(event) {
    const rect = threeContainer.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    if (state.interactionMode === 'preview') {
        // 预览模式不处理高亮，但可更新准星位置
        return;
    }

    raycaster.setFromCamera(pointer, threeCamera);
    const meshes = [...meshToElement.keys()];
    const intersects = raycaster.intersectObjects(meshes);
    if (intersects.length > 0) {
        const hitMesh = intersects[0].object;
        if (state.highlightedMesh !== hitMesh) {
            state.highlightedMesh = hitMesh;
            render3D(); // 重绘刷新高亮
        }
    } else {
        if (state.highlightedMesh) {
            state.highlightedMesh = null;
            render3D();
        }
    }
}

let mouseDownButton = -1; // 记录按下的键

function onPointerDown(event) {
    mouseDownPos.x = event.clientX;
    mouseDownPos.y = event.clientY;
    isDragging = false;
    mouseDownButton = event.button; // 0=左键, 2=右键
}

function onPointerUp(event) {
    const dx = event.clientX - mouseDownPos.x;
    const dy = event.clientY - mouseDownPos.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist > 5) {
        isDragging = true;
        return;
    }
    if (isDragging) return;

    // 处理右键删除（仅编辑模式）
    if (event.button === 2 && state.interactionMode === 'edit') {
		if (state.highlightedMesh) {
			const elem = meshToElement.get(state.highlightedMesh);
			if (elem) {
				if (elem.type === 'static') {
					// 静态方块使用专用删除函数
					const { x, y, z } = elem.coord;
					removeStatic(x, y, z);
				} else {
					deleteElement(elem.type, elem.id);
				}
				render3D();
				showToast('已删除元素');
			}
		}
        return;
    }

    // 左键点击（选择或编辑模式）
    if (event.button === 0) {
		
        // ← 新增：快速填充记录模式，拦截点击记录元素坐标
        if (window.QuickFill && window.QuickFill.isRecording && window.QuickFill.isRecording()) {
            if (state.highlightedMesh) {
                const elem = meshToElement.get(state.highlightedMesh);
                if (elem) {
                    let coord = null;
                    if (elem.type === 'static' && elem.coord) {
                        coord = elem.coord;
                    } else if (elem.id) {
                        coord = getElementCoord(elem.type, elem.id);
                    }
                    if (coord) {
                        window.QuickFill.recordAt(coord.x, coord.y, coord.z);
                    }
                }
            }
            return;   // 记录模式下不再执行放置/选择
        }
        
		// ---- 新增：橡皮擦模式 ----
        if (state.currentTool === 'eraser' && state.interactionMode === 'edit') {
            if (state.highlightedMesh) {
                const elem = meshToElement.get(state.highlightedMesh);
                if (elem) {
                    if (elem.type === 'static') {
                        const { x, y, z } = elem.coord;
                        removeStatic(x, y, z);
                    } else {
                        deleteElement(elem.type, elem.id);
                    }
                    render3D();
                    showToast('已删除元素');
                }
            }
            return;
        }
		
        if (state.interactionMode === 'select') {
            handleSelectClick(event);
        } else if (state.interactionMode === 'edit') {
            handleEditClick(event);
        }
    }
}

function handleSelectClick(event) {
	if (!state.highlightedMesh) return;
    const elem = meshToElement.get(state.highlightedMesh);
    if (!elem) return;
    // 将3D选择同步到2D选中
    if (elem.type === 'static') {
        // 静态方块使用坐标选择
        selectStatic(elem.coord.x, elem.coord.y, elem.coord.z);
    } else {
        selectElement(elem.type, elem.id);
    }
    state.selected3D = elem;
    // 更新属性面板（selectElement内部会调用updatePanel）
}

function handleEditClick(event) {
    if (!state.highlightedMesh) {
        // 点击空白处无操作
        return;
    }
    const intersect = raycaster.intersectObjects([...meshToElement.keys()])[0];
    if (!intersect) return;
    const faceNormal = intersect.face.normal.clone();
    faceNormal.transformDirection(intersect.object.matrixWorld);
    const pos = intersect.point.clone().add(faceNormal.multiplyScalar(0.5));
    // 从关卡尺寸重新计算中心
    const { w, l } = state.level.size;
    const centerX = w / 2;
    const centerZ = l / 2;
    const x = Math.round(pos.x + centerX - 0.5);
    const y = Math.round(pos.z + centerZ - 0.5);
    const z = Math.round(pos.y - 0.5);
    placeElementAt(state.currentTool, x, y, z);
}

let keys = { w: false, a: false, s: false, d: false, space: false, shift: false };

function onKeyDown(e) {
    if (e.target.tagName === 'INPUT') return;
    const key = e.key.toLowerCase();
    if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
        keys[key] = true;
        e.preventDefault();
    }
    if (key === ' ') {
        keys.space = true;
        e.preventDefault();
    }
    if (key === 'shift') {
        keys.shift = true;
        e.preventDefault();
    }
}

function onKeyUp(e) {
    const key = e.key.toLowerCase();
    if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
        keys[key] = false;
        e.preventDefault();
    }
    if (key === ' ') {
        keys.space = false;
        e.preventDefault();
    }
    if (key === 'shift') {
        keys.shift = false;
        e.preventDefault();
    }
}

function setInteractionMode(mode) {
    state.interactionMode = mode;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    const btnMap = { preview: 'modePreview', select: 'modeSelect', edit: 'modeEdit' };
    document.getElementById(btnMap[mode]).classList.add('active');
    document.getElementById('modeHint').textContent = 
        mode === 'preview' ? '鼠标拖拽旋转' :
        mode === 'select' ? '左键选择元素' : '左键添加/右键删除';
    // 切换光标样式
    threeContainer.style.cursor = mode === 'preview' ? 'grab' : 'crosshair';
}

function placeElementAt(tool, x, y, z) {
    const map = {
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
    if (map[tool]) {
        map[tool]();
        render3D(); // 放置后刷新3D视图
    } else {
        showToast('当前工具不支持3D放置');
    }
}

function clear3DScene() {
    if (!threeScene) return;
    // 移除所有自定义对象（lights, grid等固有对象保留）
    threeObjects.forEach(obj => {
        threeScene.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
    });
    threeObjects = [];
    // 清除meshPool
    meshPool.forEach((mesh, key) => {
        threeScene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
    });
    meshPool.clear();
    // 清除高亮辅助
    if (selectedHighlightHelper) {
        threeScene.remove(selectedHighlightHelper);
        selectedHighlightHelper.geometry.dispose();
        selectedHighlightHelper.material.dispose();
        selectedHighlightHelper = null;
    }
    if (currentHighlightHelper) {
        threeScene.remove(currentHighlightHelper);
        currentHighlightHelper.geometry.dispose();
        currentHighlightHelper.material.dispose();
        currentHighlightHelper = null;
    }
    meshToElement.clear();
    //isFirst3DRender = true;
    // 重新渲染
    render3D();
}

window.getLevelXmlString = generateXMLString;















const compileDialog = document.getElementById('compileDialog');
const compileCurrentBtn = document.getElementById('compileCurrentBtn');
const closeCompileDialogBtn = document.getElementById('closeCompileDialogBtn');
const compileLog = document.getElementById('compileLog');
const compileDownloadArea = document.getElementById('compileDownloadArea');
const compilePngInput = document.getElementById('compilePngInput');
const compileTheme = document.getElementById('compileTheme');

// 获取 XML 输入元素
const compileXmlInput = document.getElementById('compileXmlInput');

// 抽出主题解析为独立函数，ZIP 分支也能复用
function parseCompileXmlTheme(file) {
    const reader = new FileReader();
    reader.onload = function(ev) {
        try {
            const text = ev.target.result;
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(text, 'application/xml');
            const levelNode = xmlDoc.documentElement;
            let theme = 0;
            if (levelNode && levelNode.tagName.toLowerCase() === 'level') {
                function getAttrInsensitive(el, attr) {
                    const attrs = el.attributes;
                    for (let i = 0; i < attrs.length; i++) {
                        if (attrs[i].name.toLowerCase() === attr.toLowerCase()) {
                            return attrs[i].value;
                        }
                    }
                    return null;
                }
                let modelTheme = getAttrInsensitive(levelNode, 'ModelTheme');
                if (modelTheme !== null) {
                    theme = parseInt(modelTheme, 10);
                    if (isNaN(theme)) theme = 0;
                } else {
                    let themeAttr = getAttrInsensitive(levelNode, 'Theme');
                    if (themeAttr !== null) {
                        theme = parseInt(themeAttr, 10);
                        if (isNaN(theme)) theme = 0;
                    }
                }
                const themeSelect = document.getElementById('compileTheme');
                if (themeSelect) {
                    for (let i = 0; i < themeSelect.options.length; i++) {
                        if (parseInt(themeSelect.options[i].value, 10) === theme) {
                            themeSelect.selectedIndex = i;
                            break;
                        }
                    }
                }
                addCompileLog('info', `已从 XML 解析主题: ${theme}`);
            }
        } catch (e) {
            addCompileLog('warn', '解析 XML 主题失败: ' + e.message);
        }
    };
    reader.readAsText(file);
}

document.getElementById('compileXmlInput').addEventListener('change', async function(e) {
    const file = this.files[0];
    if (!file) return;

    // ---- ZIP 分支 ----
    if (file.name.toLowerCase().endsWith('.zip')) {
        if (typeof JSZip === 'undefined') {
            addCompileLog('err', 'JSZip 未加载，无法解析 ZIP');
            return;
        }
        try {
            addCompileLog('info', `正在解压 ${file.name}...`);
            const zip = await JSZip.loadAsync(file);
            const entries = Object.keys(zip.files).filter(name => !zip.files[name].dir);

            const xmlEntry = entries.find(n => n.toLowerCase().endsWith('.xml'));
            if (!xmlEntry) {
                addCompileLog('err', 'ZIP 中未找到 XML 文件');
                return;
            }
            const xmlText = await zip.files[xmlEntry].async('string');
            const xmlName = xmlEntry.split('/').pop();
            const xmlFile = new File([xmlText], xmlName, { type: 'text/xml' });

            const pngEntries = entries.filter(n => n.toLowerCase().endsWith('.png'));
            const pngFiles = [];
            for (const name of pngEntries) {
                const blob = await zip.files[name].async('blob');
                const shortName = name.split('/').pop();
                pngFiles.push(new File([blob], shortName, { type: 'image/png' }));
            }

            // 用 DataTransfer 设置 input.files（只读属性需要这么绕）
            const dtXml = new DataTransfer();
            dtXml.items.add(xmlFile);
            this.files = dtXml.files;

            const pngInput = document.getElementById('compilePngInput');
            const dtPng = new DataTransfer();
            for (const f of pngFiles) dtPng.items.add(f);
            pngInput.files = dtPng.files;

            addCompileLog('ok', `已从 ZIP 解压：${xmlName} + ${pngFiles.length} 个 PNG`);
            parseCompileXmlTheme(xmlFile);
        } catch (err) {
            addCompileLog('err', `ZIP 解析失败：${err.message}`);
            console.error(err);
        }
        return;
    }

    // ---- 普通 XML 分支 ----
    parseCompileXmlTheme(file);
});

document.getElementById('compileImportBtn').addEventListener('click', async () => {
    // 1. 检查 XML 文件
    if (compileXmlInput.files.length === 0) {
        addCompileLog('err', '请选择 XML 文件');
        return;
    }
    const xmlFile = compileXmlInput.files[0];

    // 2. PNG 文件
    const pngFiles = Array.from(compilePngInput.files);
    if (pngFiles.length === 0) {
        addCompileLog('warn', '未选择任何 PNG 层文件，碰撞地图将为空。');
    }

    // 3. 创建编译器
    const compiler = new EdgeCompiler(addCompileLog);
	const phoneModeCheckbox = document.getElementById('compilePhoneMode');
	if (phoneModeCheckbox) {
		compiler.phoneMode = phoneModeCheckbox.checked;
	}
    try {
        // 读取 XML
        const xmlText = await xmlFile.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
        if (xmlDoc.querySelector('parsererror')) {
            throw new Error('XML 解析失败');
        }
        compiler.xml = xmlDoc;
        addCompileLog('ok', `已加载 XML: ${xmlFile.name}`);

        // 加载 PNG（同之前）
        let loadedPngCount = 0;
        for (const file of pngFiles) {
            try {
                const img = await createImageBitmap(file);
                const c = document.createElement('canvas');
                c.width = img.width;
                c.height = img.height;
                const ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, img.width, img.height);
                const zMatch = file.name.match(/(\d+)(?=\.[^.]+$)/) || file.name.match(/_(\d+)\./);
                const z = zMatch ? parseInt(zMatch[1], 10) : null;
                if (z === null) {
                    addCompileLog('warn', `无法识别层数: ${file.name}，跳过`);
                    continue;
                }
                compiler.pngs[z] = imageData;
                addCompileLog('ok', `已加载 PNG 层 ${z}: ${file.name} (${img.width}×${img.height})`);
                loadedPngCount++;
            } catch (e) {
                addCompileLog('err', `加载 PNG 失败 ${file.name}: ${e.message}`);
            }
        }
        if (loadedPngCount === 0 && pngFiles.length > 0) {
            addCompileLog('warn', '没有成功加载任何 PNG 层');
        }

        // 编译
        const binBuffer = compiler.compile();
        const xmlBaseName = xmlFile.name.replace(/\.[^.]+$/, '') || 'imported_level';
        const internalName = xmlBaseName;

		let esoBuffer = null;
		let esoName = null;
        if (pngFiles.length > 0) {
            const theme = parseInt(compileTheme.value, 10);
            const layeredMode = document.getElementById('compileLayeredTexture')?.checked || false;
            try {
                esoBuffer = generateESOFromPngs(compiler.xml, compiler.pngs, theme, xmlBaseName, layeredMode);
                esoName = generateEsoName(xmlBaseName);
                addCompileLog('info', `已生成 ESO${layeredMode ? '（层高渐变）' : ''} (${esoBuffer.byteLength} 字节)`);
            } catch (e) {
                addCompileLog('warn', `未生成 ESO：${e.message}。仍可下载 BIN 和 ZIP。`);
                esoBuffer = null;
                esoName = null;
            }
        } else {
            addCompileLog('info', '未选择PNG，不生成ESO文件');
        }

		renderDownloadLinks(binBuffer, esoBuffer, xmlBaseName, esoName);

        addCompileLog('ok', '编译完成！');

    } catch (e) {
        addCompileLog('err', `编译失败: ${e.message}`);
        console.error(e);
    }
});

// 打开对话框
document.getElementById('compileBtn').addEventListener('click', () => {
    compileDialog.style.display = 'flex';
    compileLog.textContent = '';
    compileDownloadArea.innerHTML = '';
    compilePngInput.value = ''; // 清空之前的文件
});

// 关闭对话框
closeCompileDialogBtn.addEventListener('click', () => {
    compileDialog.style.display = 'none';
});
// 点击背景关闭
compileDialog.addEventListener('click', (e) => {
    if (e.target === compileDialog) compileDialog.style.display = 'none';
});

// 日志辅助函数
function addCompileLog(type, msg) {
    const colors = { ok: '#4ade80', warn: '#fbbf24', err: '#f87171', info: '#38bdf8' };
    const line = document.createElement('div');
    line.style.color = colors[type] || '#eee';
    line.textContent = `[${type.toUpperCase()}] ${msg}`;
    compileLog.appendChild(line);
    compileLog.scrollTop = compileLog.scrollHeight;
}

/**
 * 在编译对话框中渲染下载链接（BIN、ESO、ZIP）
 * @param {ArrayBuffer} binBuffer - 编译出的 BIN 数据
 * @param {ArrayBuffer} esoBuffer - 生成的 ESO 数据
 * @param {string} baseName - 文件名前缀（不含扩展名）
 */
/**
 * 在编译对话框中渲染下载链接（BIN、ESO、ZIP）
 * @param {ArrayBuffer} binBuffer - 编译出的 BIN 数据
 * @param {ArrayBuffer} esoBuffer - 生成的 ESO 数据
 * @param {string} baseName - 文件名前缀（不含扩展名）
 * @param {string} esoFileName - ESO 文件的完整名称（包含 .eso）
 */
function renderDownloadLinks(binBuffer, esoBuffer, baseName, esoFileName) {
    const downloadArea = document.getElementById('compileDownloadArea');
    downloadArea.innerHTML = '';

    // ---- BIN ----
    const binBlob = new Blob([binBuffer], { type: 'application/octet-stream' });
    const binUrl = URL.createObjectURL(binBlob);
    const binLink = document.createElement('a');
    binLink.href = binUrl;
    binLink.download = `${baseName}.bin`;
    binLink.className = 'download-link';
    binLink.textContent = `⬇ 下载 BIN (${binBuffer.byteLength} 字节)`;
    binLink.style.cssText = 'display:inline-block; padding:8px 14px; background:#14532d; border:1px solid #22c55e; border-radius:6px; color:#86efac; text-decoration:none; font-weight:600; margin-right:8px; cursor:pointer;';
    downloadArea.appendChild(binLink);

    // ---- ESO（仅当存在） ----
    if (esoBuffer && esoFileName) {
        const esoBlob = new Blob([esoBuffer], { type: 'application/octet-stream' });
        const esoUrl = URL.createObjectURL(esoBlob);
        const esoLink = document.createElement('a');
        esoLink.href = esoUrl;
        esoLink.download = esoFileName;
        esoLink.className = 'download-link';
        esoLink.textContent = `⬇ 下载 ESO (${esoBuffer.byteLength} 字节)`;
        esoLink.style.cssText = 'display:inline-block; padding:8px 14px; background:#14532d; border:1px solid #22c55e; border-radius:6px; color:#86efac; text-decoration:none; font-weight:600; margin-right:8px; cursor:pointer;';
        downloadArea.appendChild(esoLink);
    }

    // ---- ZIP（包含BIN，若ESO存在则也包含） ----
    if (typeof JSZip !== 'undefined') {
        const zip = new JSZip();
        zip.file(`${baseName}.bin`, binBlob);
        if (esoBuffer && esoFileName) {
            zip.file(esoFileName, new Blob([esoBuffer], { type: 'application/octet-stream' }));
        }
        zip.generateAsync({ type: 'blob' })
           .then((zipBlob) => {
               const zipUrl = URL.createObjectURL(zipBlob);
               const zipLink = document.createElement('a');
               zipLink.href = zipUrl;
               zipLink.download = `${baseName}.zip`;
               zipLink.className = 'download-link';
               zipLink.textContent = `⬇ 下载 ZIP (${zipBlob.size} 字节)`;
               zipLink.style.cssText = 'display:inline-block; padding:8px 14px; background:#14532d; border:1px solid #22c55e; border-radius:6px; color:#86efac; text-decoration:none; font-weight:600; margin-right:8px; cursor:pointer;';
               downloadArea.appendChild(zipLink);
           })
           .catch(err => {
               addCompileLog('warn', '生成 ZIP 失败: ' + err.message);
           });
    } else {
        addCompileLog('warn', 'JSZip 未加载，无法生成 ZIP 下载');
    }
}
// 编译当前关卡
compileCurrentBtn.addEventListener('click', async () => {
    // 1. 获取当前关卡的 XML 字符串
    let xmlString;
    if (typeof window.getLevelXmlString === 'function') {
        xmlString = window.getLevelXmlString();
    } else {
        addCompileLog('err', '未找到 window.getLevelXmlString，请确保编辑器已暴露该函数。');
        return;
    }
    if (!xmlString) {
        addCompileLog('err', '获取 XML 失败，请检查编辑器状态。');
        return;
    }

    // 2. 导出 PNG 各层（类似 exportPNG 的逻辑）
    const { w, l, h } = state.level.size;
    const baseName = state.level.name || 'level';
    const pngFiles = [];
    for (let z = 0; z < h; z++) {
        const layer = state.staticBlocks[z] || Array.from({ length: l }, () => Array(w).fill(null));
        // 检查该层是否有静态方块
        let hasBlock = false;
        for (let y = 0; y < l; y++) {
            for (let x = 0; x < w; x++) {
                if (layer[y] && layer[y][x]) { hasBlock = true; break; }
            }
            if (hasBlock) break;
        }
        if (!hasBlock) continue; // 无方块层跳过
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = l;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(w, l);
        const data = imageData.data;
        for (let y = 0; y < l; y++) {
            for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 4;
                const block = layer[y] && layer[y][x];
                if (block) {
                    data[idx] = block.r;
                    data[idx+1] = block.g;
                    data[idx+2] = block.b;
                    data[idx+3] = 255;
                } else {
                    data[idx] = 0;
                    data[idx+1] = 0;
                    data[idx+2] = 0;
                    data[idx+3] = 255;
                }
            }
        }
        ctx.putImageData(imageData, 0, 0);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const file = new File([blob], `${baseName}.${z}.png`, { type: 'image/png' });
        pngFiles.push(file);
    }

    // 3. 解析 XML 获取 ModelTheme 或 Theme，并更新下拉框
	let theme = 0;
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, 'application/xml');
        const levelNode = xmlDoc.documentElement;
        if (levelNode && levelNode.tagName.toLowerCase() === 'level') {
            let modelTheme = levelNode.getAttribute('ModelTheme');
            if (modelTheme !== null) {
                theme = parseInt(modelTheme, 10);
                if (isNaN(theme)) theme = 0;
            } else {
                let themeAttr = levelNode.getAttribute('Theme');
                if (themeAttr !== null) {
                    theme = parseInt(themeAttr, 10);
                    if (isNaN(theme)) theme = 0;
                }
            }
        }
    } catch (e) {}
    // 更新编译主题下拉框
    const themeSelect = document.getElementById('compileTheme');
    if (themeSelect) {
        const options = themeSelect.options;
        for (let i = 0; i < options.length; i++) {
            if (parseInt(options[i].value, 10) === theme) {
                themeSelect.selectedIndex = i;
                break;
            }
        }
    }

    // 4. 将 XML 和 PNG 文件填充到编译对话框的 input 中
    const xmlFile = new File([xmlString], `${baseName}.xml`, { type: 'text/xml' });
    const xmlInput = document.getElementById('compileXmlInput');
    const pngInput = document.getElementById('compilePngInput');

    // 使用 DataTransfer 设置文件列表（因为 input.files 是只读的）
    function setFiles(input, files) {
        const dt = new DataTransfer();
        for (const f of files) {
            dt.items.add(f);
        }
        input.files = dt.files;
        // 触发 change 事件以便界面更新（可选）
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    setFiles(xmlInput, [xmlFile]);
    if (pngFiles.length > 0) {
        setFiles(pngInput, pngFiles);
    } else {
        // 如果没有 PNG，清空
        setFiles(pngInput, []);
    }

    // 5. 更新提示信息
    addCompileLog('info', `已导入当前关卡（${baseName}）的 XML 和 ${pngFiles.length} 个 PNG 层，主题已自动识别。`);
    showToast('已导入当前关卡，请点击“导入XML+PNG编译”进行编译。');

    // 可选：自动打开编译对话框（如果未打开）
    const dialog = document.getElementById('compileDialog');
    if (dialog.style.display !== 'flex') {
        dialog.style.display = 'flex';
        // 清空旧日志和下载区（保持干净）
        document.getElementById('compileLog').textContent = '';
        document.getElementById('compileDownloadArea').innerHTML = '';
    }
});

// 判断 affect 字符串中是否包含指定 ID（无论有无括号数据）
function isAffectIdPresent(str, id) {
    if (!str) return false;
    const items = str.split(',').map(s => s.trim()).filter(s => s);
    return items.some(item => {
        const match = item.match(/^([^(]+)\((\d+)\)$/);
        if (match) return match[1].trim() === id;
        return item === id;
    });
}

document.getElementById('clearXmlBtn').addEventListener('click', function() {
    document.getElementById('compileXmlInput').value = '';
    addCompileLog('info', '已清除XML / ZIP文件');
});
document.getElementById('clearPngBtn').addEventListener('click', function() {
    document.getElementById('compilePngInput').value = '';
    addCompileLog('info', '已清除PNG文件');
});
document.getElementById('clearAllBtn').addEventListener('click', function() {
    document.getElementById('compileXmlInput').value = '';
    document.getElementById('compilePngInput').value = '';
    document.getElementById('compileDownloadArea').innerHTML = '';
    addCompileLog('info', '已清除全部文件');
});

const unifiedCheck = document.getElementById('unifiedMovementCheck');
const unifiedSelect = document.getElementById('unifiedBaseSelect');

// 更新下拉列表（当移动平台变动时调用）
function refreshUnifiedBaseList() {
    const currentVal = unifiedSelect.value;
    unifiedSelect.innerHTML = '<option value="">— 选择基准移动平台 —</option>';
    // 只遍历拥有 xmlId 的移动平台
    state.movingPlatforms.forEach(m => {
        if (!m.xmlId) return; // 跳过没有外部 ID 的平台
        const pos = getMovingPos(m);
        const label = `${m.xmlId} (${pos.x},${pos.y},${pos.z})`;
        const opt = document.createElement('option');
        opt.value = m.xmlId;   // 值使用 xmlId
        opt.textContent = label;
        unifiedSelect.appendChild(opt);
    });
    if (currentVal && [...unifiedSelect.options].some(o => o.value === currentVal)) {
        unifiedSelect.value = currentVal;
    } else {
        unifiedSelect.value = '';
        state.unifiedMovement.baseId = null;
        state.unifiedMovement.basePos = null;
    }
}

// 初始化下拉
refreshUnifiedBaseList();

// 监听复选框
unifiedCheck.addEventListener('change', function() {
    state.unifiedMovement.enabled = this.checked;
    unifiedSelect.disabled = !this.checked;
    if (!this.checked) {
        state.unifiedMovement.baseId = null;
        state.unifiedMovement.basePos = null;
        unifiedSelect.value = '';
    } else {
        // 若当前有选中的移动平台，自动填入
        if (state.selectedElement && state.selectedElement.type === 'moving') {
            const m = state.movingPlatforms.find(p => p.id === state.selectedElement.id);
            if (m) {
                const id = m.xmlId || m.id;
                if ([...unifiedSelect.options].some(o => o.value === id)) {
                    unifiedSelect.value = id;
                    updateUnifiedBase(id);
                }
            }
        }
    }
});

// 监听下拉选择
unifiedSelect.addEventListener('change', function() {
    const val = this.value;
    if (val) {
        updateUnifiedBase(val);
    } else {
        state.unifiedMovement.baseId = null;
        state.unifiedMovement.basePos = null;
    }
});

function updateUnifiedBase(id) {
    const m = state.movingPlatforms.find(p => (p.xmlId || p.id) === id);
    if (m) {
        state.unifiedMovement.baseId = id;
        state.unifiedMovement.basePos = getMovingPos(m);
    } else {
        state.unifiedMovement.baseId = null;
        state.unifiedMovement.basePos = null;
    }
}

// 在移动平台增删改后调用 refreshUnifiedBaseList
// 可以在 placeMoving、deleteElement 等函数中添加调用，或使用 MutationObserver

function decompileBin(buffer, baseName) {
    const decompiler = new EdgeDecompiler(buffer);
    const result = decompiler.decompile();
    return result;
}

// ===== 反编译 UI 控制 =====
let _selectedBinFile = null;
let _decompileResult = null;

// 安全调用日志函数（避免循环引用）
function safeLog(type, msg) {
    if (typeof window.addCompileLog === 'function') {
        window.addCompileLog(type, msg);
    } else {
        console.log(`[${type}] ${msg}`);
    }
}

// 显示反编译结果（下载按钮）
function showDecompileButtons(result, baseName) {
    const area = document.getElementById('decompileDownloadArea');
    if (!area) return;
    area.innerHTML = '';
    _decompileResult = { result, baseName };

    // 1. 下载 XML
    const btnXml = document.createElement('button');
    btnXml.textContent = '⬇ 下载 XML';
    btnXml.className = 'download-link';
    btnXml.style.cssText = 'display:inline-block; padding:6px 14px; background:#14532d; border:1px solid #22c55e; border-radius:6px; color:#86efac; text-decoration:none; font-weight:600; cursor:pointer; margin-right:8px;';
    btnXml.onclick = function() {
        const xmlBlob = new Blob([result.xml], { type: 'text/xml' });
        downloadFile(xmlBlob, `${baseName}.xml`);
    };
    area.appendChild(btnXml);

    // 2. 下载 PNG（逐个下载所有层）
    const btnPng = document.createElement('button');
    btnPng.textContent = '⬇ 下载所有 PNG';
    btnPng.className = 'download-link';
    btnPng.style.cssText = 'display:inline-block; padding:6px 14px; background:#14532d; border:1px solid #22c55e; border-radius:6px; color:#86efac; text-decoration:none; font-weight:600; cursor:pointer;';
    btnPng.onclick = function() {
        const layers = Object.keys(result.pngs);
        if (layers.length === 0) {
            addCompileLog('warn', '没有 PNG 层可下载');
            return;
        }
        addCompileLog('info', `开始下载 ${layers.length} 个 PNG 层...`);
        // 逐个下载，间隔 300ms 避免浏览器阻止
        layers.forEach((z, index) => {
            setTimeout(() => {
                const imageData = result.pngs[z];
                const canvas = document.createElement('canvas');
                canvas.width = imageData.width;
                canvas.height = imageData.height;
                const ctx = canvas.getContext('2d');
                ctx.putImageData(imageData, 0, 0);
                canvas.toBlob((blob) => {
                    downloadFile(blob, `${baseName}.${z}.png`);
                    if (index === layers.length - 1) {
                        addCompileLog('ok', `所有 PNG 层下载完成`);
                    }
                }, 'image/png');
            }, index * 300);
        });
    };
    area.appendChild(btnPng);

    // 3. 下载完整 ZIP（包含 XML 和所有 PNG，保留作为备选）
    const btnZip = document.createElement('button');
    btnZip.textContent = '⬇ 下载 ZIP (完整)';
    btnZip.className = 'download-link';
    btnZip.style.cssText = 'display:inline-block; padding:6px 14px; background:#14532d; border:1px solid #22c55e; border-radius:6px; color:#86efac; text-decoration:none; font-weight:600; cursor:pointer;';
    btnZip.onclick = function() {
        if (typeof JSZip === 'undefined') {
            safeLog('warn', 'JSZip 库未加载，无法打包');
            return;
        }
        const zip = new JSZip();
        zip.file(`${baseName}.xml`, result.xml);
        const promises = [];
        for (const z in result.pngs) {
            const imageData = result.pngs[z];
            const canvas = document.createElement('canvas');
            canvas.width = imageData.width;
            canvas.height = imageData.height;
            const ctx = canvas.getContext('2d');
            ctx.putImageData(imageData, 0, 0);
            promises.push(new Promise((resolve) => {
                canvas.toBlob((blob) => {
                    resolve({ name: `${baseName}.${z}.png`, blob });
                }, 'image/png');
            }));
        }
        Promise.all(promises).then((files) => {
            files.forEach(f => zip.file(f.name, f.blob));
            zip.generateAsync({ type: 'blob' }).then((content) => {
                downloadFile(content, `${baseName}.zip`);
            });
        }).catch(err => safeLog('err', '生成 ZIP 失败: ' + err.message));
    };
    area.appendChild(btnZip);
}

// 选择文件按钮（触发文件选择）
document.getElementById('decompileSelectBtn').addEventListener('click', function() {
    document.getElementById('decompileBinInput').click();
});

// 文件选择后只保存引用，不自动反编译
document.getElementById('decompileBinInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) {
        _selectedBinFile = null;
        safeLog('info', '已清除 BIN 文件选择');
        return;
    }
    _selectedBinFile = file;
    const sizeKB = (file.size / 1024).toFixed(1);
    safeLog('info', `已选择 BIN 文件: ${file.name} (${sizeKB} KB)，点击“反编译”按钮开始`);
    e.target.value = ''; // 允许重复选择同一文件
});

// 反编译按钮（手动触发）
document.getElementById('decompileActionBtn').addEventListener('click', function() {
    if (!_selectedBinFile) {
        safeLog('warn', '请先选择一个 BIN 文件');
        return;
    }
    const file = _selectedBinFile;
    const baseName = file.name.replace(/\.[^.]+$/, '');
    safeLog('info', `开始反编译: ${file.name} (${(file.size/1024).toFixed(1)} KB)`);

    const reader = new FileReader();
    reader.onload = function(ev) {
        try {
            const buffer = ev.target.result;
            const staticMovingToPng =
                document.getElementById('decompileStaticMovingToPng')?.checked || false;
            const result = decompileBin(buffer, baseName, { staticMovingToPng });
            const pngCount = Object.keys(result.pngs).length;
            safeLog('ok', `反编译成功: ${file.name} → XML + ${pngCount} 个 PNG 层`);
            showDecompileButtons(result, baseName);
        } catch (err) {
            safeLog('err', `反编译失败: ${err.message}`);
            console.error(err);
        }
    };
    reader.onerror = function() {
        safeLog('err', '读取文件失败');
    };
    reader.readAsArrayBuffer(file);
});

// 清除反编译文件
function clearDecompileFiles() {
    _selectedBinFile = null;
    const input = document.getElementById('decompileBinInput');
    if (input) input.value = '';
    const area = document.getElementById('decompileDownloadArea');
    if (area) area.innerHTML = '';
    _decompileResult = null;
    safeLog('info', '已清除反编译文件');
}

document.getElementById('clearDecompileBtn').addEventListener('click', clearDecompileFiles);

// 从文本导入按键事件
function addKeyEventsFromText(id, type) {
    const textarea = document.getElementById(`keyEventInput_${id}`);
    if (!textarea) return;
    const text = textarea.value.trim();
    if (!text) {
        showToast('请输入按键事件文本');
        return;
    }
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line);
    if (lines.length === 0) {
        showToast('没有有效行');
        return;
    }

    const target = type === 'othercube' 
        ? state.otherCubes.find(o => o.id === id)
        : state.darkCubes.find(d => d.id === id);
    if (!target) {
        showToast('目标元素不存在');
        return;
    }
    if (!target.keyEvents) target.keyEvents = [];

    const parsed = [];
    for (const line of lines) {
        // 尝试解析两种格式：
        // 1. "WestDown 14" 或 "WestDown14"
        // 2. "<WestDown TimeOffset=\"14\" />"
        let match = line.match(/^(West|East|North|South)(Down|Up)\s*(\d+)$/i);
        if (match) {
            const dir = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
            const typeEv = match[2].charAt(0).toUpperCase() + match[2].slice(1).toLowerCase();
            const timeOffset = parseInt(match[3], 10);
            if (!isNaN(timeOffset)) {
                parsed.push({ dir, type: typeEv, timeOffset });
            }
        } else {
            // 尝试 XML 格式
            const xmlMatch = line.match(/<((West|East|North|South)(Down|Up))\s+TimeOffset\s*=\s*["'](\d+)["']\s*\/>/i);
            if (xmlMatch) {
                const dir = xmlMatch[2].charAt(0).toUpperCase() + xmlMatch[2].slice(1).toLowerCase();
                const typeEv = xmlMatch[3].charAt(0).toUpperCase() + xmlMatch[3].slice(1).toLowerCase();
                const timeOffset = parseInt(xmlMatch[4], 10);
                if (!isNaN(timeOffset)) {
                    parsed.push({ dir, type: typeEv, timeOffset });
                }
            }
        }
    }

    if (parsed.length === 0) {
        showToast('未解析到任何有效事件');
        return;
    }

    target.keyEvents.push(...parsed);
    saveCache();
    updatePanel();
    showToast(`成功导入 ${parsed.length} 个按键事件`);
}

window.splitWaypoint = function(movingId, idx) {
    const m = state.movingPlatforms.find(p => p.id === movingId);
    if (!m || !m.waypoints || idx < 1 || idx >= m.waypoints.length) {
        showToast('无效的路点');
        return;
    }
    const nStr = prompt('要将该段拆分成几份？', '2');
    if (nStr === null) return;
    const n = parseInt(nStr, 10);
    if (isNaN(n) || n < 2) {
        showToast('请输入大于1的整数');
        return;
    }

    const prev = m.waypoints[idx - 1];
    const cur = m.waypoints[idx];

    // 计算总位移和时间
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    const dz = cur.z - prev.z;
    const totalTime = cur.travelTime; // 假定从 prev 到 cur 的时间

    // 时间分段
    const baseTime = Math.floor(totalTime / n);
    const remTime = totalTime % n;

    // 生成 n-1 个中间点（不包括终点）
    const newPoints = [];
    for (let i = 1; i <= n - 1; i++) {
        const t = i / n;
        let x = prev.x + dx * t;
        let y = prev.y + dy * t;
        let z = prev.z + dz * t;
        // 四舍五入为整数
        x = Math.round(x);
        y = Math.round(y);
        z = Math.round(z);
        newPoints.push({
            x, y, z,
            travelTime: baseTime,
            pauseTime: 0  // 中间点 pauseTime 为 0
        });
    }

    // 更新终点的 travelTime（坐标不变）
    cur.travelTime = baseTime + remTime;
    // cur.pauseTime 保持不变

    // 在 cur 之前插入所有中间点
    m.waypoints.splice(idx, 0, ...newPoints);

    rebuildSpatialIndex();
    updatePanel();
    requestRender();
    saveCache();
    showToast(`路点已拆分为 ${n} 段`);
};

window.moveCheckpoint = function(idx, delta) {
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= state.checkpoints.length) return;
    // 交换数组元素
    [state.checkpoints[idx], state.checkpoints[newIdx]] = [state.checkpoints[newIdx], state.checkpoints[idx]];
    // 刷新列表和缓存
    updateElemList();
    saveCache();
};

function hasProjectData() {
    for (const z in state.staticBlocks) {
        const layer = state.staticBlocks[z];
        for (let y = 0; y < layer.length; y++) {
            for (let x = 0; x < layer[y].length; x++) {
                if (layer[y][x]) return true;
            }
        }
    }
    return state.movingPlatforms.length > 0 ||
           state.fallingPlatforms.length > 0 ||
           state.prisms.length > 0 ||
           state.resizers.length > 0 ||
           state.bumpers.length > 0 ||
           state.checkpoints.length > 0 ||
           state.cameraTriggers.length > 0 ||
           state.buttons.length > 0 ||
           state.buttonSequences.length > 0 ||
           state.otherCubes.length > 0 ||
           state.darkCubes.length > 0;
}