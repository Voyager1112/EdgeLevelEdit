// 工具函数
function showToast(msg) {
	toastEl.textContent = msg;
	toastEl.classList.add('show');
	clearTimeout(window.toastTimer);
	window.toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3000);
}

/**
 * 修复表单字段与标签的关联（消除浏览器警告）
 * @param {HTMLElement} container - 要修复的容器元素，默认为 document
 */
function fixFormFieldAssociations(container) {
    container = container || document;
    // 处理所有没有 id 的 input、select、textarea
    container.querySelectorAll('input:not([id]), select:not([id]), textarea:not([id])').forEach(el => {
        // 基于元素类型和父级信息生成稳定的 id
        let baseId = el.name || el.getAttribute('data-field') || 'field';
        let id = baseId + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        el.id = id;

        // 尝试关联 label
        // 情况1：el 被 label 包裹
        let label = el.closest('label');
        if (label && !label.hasAttribute('for')) {
            label.setAttribute('for', id);
            return;
        }

        // 情况2：el 前面有兄弟 label
        let prev = el.previousElementSibling;
        while (prev) {
            if (prev.tagName === 'LABEL' && !prev.hasAttribute('for')) {
                prev.setAttribute('for', id);
                return;
            }
            prev = prev.previousElementSibling;
        }

        // 情况3：el 的父级是 label（但未被 closest 捕获，因为中间可能有其他元素）
        let parent = el.parentElement;
        while (parent) {
            if (parent.tagName === 'LABEL' && !parent.hasAttribute('for')) {
                parent.setAttribute('for', id);
                return;
            }
            parent = parent.parentElement;
        }
    });
}

// 辅助函数：获取外部ID标签
function getDisplayId(elemId, type) {
	let xmlId = null;
	switch (type) {
		case 'moving': {
			const el = state.movingPlatforms.find(m => m.id === elemId);
			if (el) xmlId = el.xmlId;
			break;
		}
		case 'bumper': {
			const el = state.bumpers.find(b => b.id === elemId);
			if (el) xmlId = el.xmlId;
			break;
		}
		case 'button': {
			const el = state.buttons.find(b => b.id === elemId);
			if (el) xmlId = el.xmlId;
			break;
		}
		case 'seqbutton': {
			for (let seq of state.buttonSequences) {
				const btn = seq.buttons ? seq.buttons.find(b => b.id === elemId) : null;
				if (btn) { xmlId = btn.xmlId; break; }
			}
			break;
		}
	}
	return xmlId ? `${elemId}(${xmlId})` : `${elemId}(无ID)`;
}

// 选择对话框
function showSelectDialog(items, callback) {
	const options = document.getElementById('dialogOptions');
	options.innerHTML = '';
	items.forEach((item) => {
		const btn = document.createElement('button');
		btn.textContent = item.desc;
		btn.onclick = () => {
			closeSelectDialog();
			callback(item);
		};
		options.appendChild(btn);
	});
	selectDialog.style.display = 'flex';
	selectDialog.classList.add('active');
	window._selectCallback = callback;
}

function closeSelectDialog() {
	selectDialog.style.display = 'none';
	selectDialog.classList.remove('active');
	window._selectCallback = null;
}
window.closeSelectDialog = closeSelectDialog;
selectDialog.addEventListener('click', (e) => {
	if (e.target === selectDialog) closeSelectDialog();
});

// 切换按钮序列展开状态
function toggleSequenceExpand(seqId) {
    if (!state.expandedSequences) state.expandedSequences = {};
    state.expandedSequences[seqId] = !state.expandedSequences[seqId];
    updateElemList();
}
window.toggleSequenceExpand = toggleSequenceExpand;

// 在列表里操作子按钮排序后，需要额外刷新列表
window.moveSeqButtonInList = function(parentId, idx, delta) {
    // 复用已有的 moveButtonSequenceButton（它会处理数组交换、saveCache、updatePanel）
    if (typeof moveButtonSequenceButton === 'function') {
        moveButtonSequenceButton(parentId, idx, delta);
    }
    updateElemList();   // 刷新列表顺序
};

// 元素列表
function updateElemList() {
    if (state._suppressUI) return;
    const filterType = document.getElementById('elemFilterSelect')?.value || 'all';
    const all = [];
    const movingPosMap = {};

    state.movingPlatforms.forEach(m => {
        const pos = getMovingPos(m);
        movingPosMap[m.id] = pos;
        if (m.xmlId) movingPosMap[m.xmlId] = pos;
    });
    state.movingPlatforms.forEach(m => {
        const pos = getMovingPos(m);
        const displayId = m.xmlId ? `${m.id}(${m.xmlId})` : m.id;
        all.push({ type: 'moving', id: m.id, desc: `移动 ${displayId} (${pos.x},${pos.y},${pos.z})` });
    });
    state.fallingPlatforms.forEach(m => all.push({ type: 'falling', id: m.id, desc: `掉落 #${m.id} (${m.x},${m.y},${m.z})` }));
    state.prisms.forEach(m => all.push({ type: 'prism', id: m.id, desc: `棱柱 #${m.id} (${m.x},${m.y},${m.z})` }));
    state.resizers.forEach(m => all.push({ type: 'resizer', id: m.id, desc: `调整 #${m.id} (${m.x},${m.y},${m.z})` }));
    state.bumpers.forEach(m => {
        const displayId = m.xmlId ? `${m.id}(${m.xmlId})` : m.id;
        all.push({ type: 'bumper', id: m.id, desc: `撞击 ${displayId} (${m.x},${m.y},${m.z})` });
    });
    state.checkpoints.forEach(m => all.push({ type: 'checkpoint', id: m.id, desc: `存档 #${m.id} (${m.x},${m.y},${m.z})` }));
    state.cameraTriggers.forEach(m => all.push({ type: 'cameratrigger', id: m.id, desc: `相机 #${m.id} (${m.x},${m.y},${m.z})` }));
    /*state.buttons.forEach(m => {
        const displayId = m.xmlId ? `${m.id}(${m.xmlId})` : m.id;
        let coordStr = '';
        if (m.movingPlatformID) {
            const pos = movingPosMap[m.movingPlatformID];
            if (pos) coordStr = `(${pos.x},${pos.y},${pos.z})`;
            else coordStr = `(绑定移动平台 #${m.movingPlatformID})`;
        } else {
            coordStr = `(${m.x},${m.y},${m.z})`;
        }
        all.push({ type: 'button', id: m.id, desc: `按钮 ${displayId} ${coordStr}` });
    });*/
    state.buttons.forEach(m => {
        const displayId = m.xmlId ? `${m.id}(${m.xmlId})` : m.id;
        let coordStr = '';
        if (m.movingPlatformID) {
            const pos = movingPosMap[m.movingPlatformID];
            if (pos) coordStr = `${pos.x},${pos.y},${pos.z}`;
            else coordStr = `?`;
        } else {
            coordStr = `${m.x},${m.y},${m.z}`;
        }
        const mpStr = m.movingPlatformID ? '[' + m.movingPlatformID + ']' : '';
        all.push({
            type: 'button',
            id: m.id,
            desc: `按钮 ${displayId} ${mpStr} (${coordStr})`
        });
    });
    state.buttonSequences.forEach(m => {
        const count = (m.buttons || []).length;
        all.push({ type: 'buttonsequence', id: m.id, desc: `按钮序列 #${m.id} (${count}个按钮)` });
    });
    state.otherCubes.forEach(m => all.push({ type: 'othercube', id: m.id, desc: `提示 #${m.id} (触发${m.triggerX},${m.triggerY},${m.triggerZ})` }));
    state.darkCubes.forEach(m => all.push({ type: 'darkcube', id: m.id, desc: `黑暗 #${m.id} (触发${m.triggerX},${m.triggerY},${m.triggerZ})` }));

    // ---- 应用筛选 ----
    let filtered = all;
    if (filterType !== 'all') {
        filtered = all.filter(item => item.type === filterType);
    }

    if (filtered.length === 0) {
        elemListContainer.innerHTML = '<div style="color:#5a7a9a;font-size:12px;padding:4px;">暂无元素</div>';
        return;
    }

    let html = '';
    filtered.forEach(item => {
        const active = (state.selectedElement && state.selectedElement.type === item.type && 
                        state.selectedElement.id === item.id) ? 'active' : '';

        let extraButtons = '';

        // ---- 存档点排序按钮 ----
        if (item.type === 'checkpoint') {
            const idx = state.checkpoints.findIndex(c => c.id === item.id);
            if (idx !== -1) {
                extraButtons = `
                    <button onclick="event.stopPropagation(); moveCheckpoint(${idx}, -1)" 
                            style="background:#1a4a7a;border:none;color:#fff;border-radius:3px;cursor:pointer;padding:0 6px;margin-left:4px;">↑</button>
                    <button onclick="event.stopPropagation(); moveCheckpoint(${idx}, 1)" 
                            style="background:#1a4a7a;border:none;color:#fff;border-radius:3px;cursor:pointer;padding:0 6px;margin-left:2px;">↓</button>
                `;
            }
        }

        // ---- 按钮序列展开/收起按钮 ----
        if (item.type === 'buttonsequence') {
            const seq = state.buttonSequences.find(s => s.id === item.id);
            if (seq && seq.buttons && seq.buttons.length > 0) {
                const expanded = state.expandedSequences && state.expandedSequences[item.id];
                extraButtons = `
                    <button onclick="event.stopPropagation(); toggleSequenceExpand('${item.id}')" 
                            title="${expanded ? '收起' : '展开'}"
                            style="background:#1a4a7a;border:none;color:#fff;border-radius:3px;cursor:pointer;padding:0 6px;margin-left:4px;">${expanded ? '▼' : '◀'}</button>
                `;
            }
        }

        html += `
            <div class="elem-item ${active}" onclick="selectElement('${item.type}', '${item.id}')">
                <span>${item.desc}</span>
                ${extraButtons}
            </div>
        `;

        // ---- 展开的子按钮列表 ----
        if (item.type === 'buttonsequence') {
            const seq = state.buttonSequences.find(s => s.id === item.id);
            const expanded = state.expandedSequences && state.expandedSequences[item.id];
            if (seq && expanded && seq.buttons && seq.buttons.length > 0) {
                seq.buttons.forEach((btn, idx) => {
                    const subActive = (state.selectedElement &&
                                       state.selectedElement.type === 'seqbutton' &&
                                       state.selectedElement.id === btn.id) ? 'active' : '';
                    const dispId = btn.xmlId ? `${btn.id}(${btn.xmlId})` : btn.id;
                    const subBg = subActive ? '' : 'background:#0a1a2a;';

                    // ---- 计算所属移动平台和坐标 ----
                    let subMpStr = btn.movingPlatformID ? `[${btn.movingPlatformID}]` : '';
                    let subCoordStr = '';
                    if (btn.movingPlatformID) {
                        const pos = movingPosMap[btn.movingPlatformID];
                        if (pos) subCoordStr = `${pos.x},${pos.y},${pos.z}`;
                        else subCoordStr = '?';
                    } else if (btn.position) {
                        subCoordStr = `${btn.position.x},${btn.position.y},${btn.position.z}`;
                    } else {
                        subCoordStr = '-';
                    }
                    // ---------------------------------

                    html += `
                        <div class="elem-item ${subActive}" 
                             style="padding-left:22px;${subBg}font-size:11px;"
                             onclick="selectElement('seqbutton', '${btn.id}')">
                            <span>↳ #${idx+1} ${dispId} ${subMpStr} (${subCoordStr})</span>
                            <span style="display:flex;gap:2px;">
                                <button onclick="event.stopPropagation(); moveSeqButtonInList('${item.id}', ${idx}, -1)" 
                                        style="background:#1a4a7a;border:none;color:#fff;border-radius:3px;cursor:pointer;padding:0 6px;">↑</button>
                                <button onclick="event.stopPropagation(); moveSeqButtonInList('${item.id}', ${idx}, 1)" 
                                        style="background:#1a4a7a;border:none;color:#fff;border-radius:3px;cursor:pointer;padding:0 6px;">↓</button>
                            </span>
                        </div>
                    `;
                });
            }
        }
    });
    html += `<div style="padding:4px 0;"><button class="add-btn" onclick="addButtonSequence()">+ 创建按钮序列</button></div>`;
    elemListContainer.innerHTML = html;
    refreshUnifiedBaseList();
}

function updateStatus() {
    if (state._suppressUI) return;
	let sc = 0;
	for (const z in state.staticBlocks) {
		const layer = state.staticBlocks[z];
		for (let y = 0; y < layer.length; y++) {
			for (let x = 0; x < layer[y].length; x++) {
				if (layer[y][x]) sc++;
			}
		}
	}
	statusRight.textContent =
		`静态: ${sc} | 移动: ${state.movingPlatforms.length} | 掉落: ${state.fallingPlatforms.length} | 棱柱: ${state.prisms.length} | 放大: ${state.resizers.filter(r=>r.type==='grow').length} | 缩小: ${state.resizers.filter(r=>r.type==='shrink').length} | 撞击: ${state.bumpers.length} | 存档: ${state.checkpoints.length} | 相机: ${state.cameraTriggers.length} | 按钮: ${state.buttons.length} | 提示: ${state.otherCubes.length} | 黑暗: ${state.darkCubes.length} | 按钮序列: ${state.buttonSequences.length}`;
}

// 缩放
function setZoom(value) {
    value = Math.max(25, value);
    state.zoom = value / 100;
    zoomSlider.value = value;
    zoomNumber.value = value;
    // 不再使用 transform，直接重新渲染（CSS 尺寸会更新）
    requestRender();
}



function clearLayer() {
	const z = state.currentLayer;
	const layer = state.staticBlocks[z];
	if (!layer) { showToast('层不存在'); return; }
	if (!confirm(`清空第 ${z} 层所有静态方块？`)) return;
	for (let y = 0; y < layer.length; y++) {
		for (let x = 0; x < layer[y].length; x++) {
			layer[y][x] = null;
		}
	}
	if (state.selectedElement && state.selectedElement.type === 'static' && state.selectedElement.staticCoord.z ===
		z) {
		state.selectedElement = null;
	}
	requestRender();
	updatePanel();
	updateStatus();
	saveCache();
	showToast(`第 ${z} 层已清空`);
}

function changeLayer() {
    let z = parseInt(layerInput.value) || 0;
    const { minZ, maxZ } = getLayerRange();
    if (z < minZ) z = minZ;
    else if (z > maxZ) z = maxZ;

    const oldLayer = state.currentLayer;

    // 层数没变：只同步 input，不记历史
    if (z === oldLayer) {
        layerInput.value = z;
        return;
    }

    // ★ 切层前先入栈一份"当前状态（旧层）"快照
    // 这样撤销第一步会回到旧层，第二步再撤销才是切层前的操作
    if (!state._suppressUndo) {
        if (!state._undoStack) state._undoStack = [];
        if (!state._redoStack) state._redoStack = [];
        const snap = state._lastSavedSnapshot;
        const top = state._undoStack[state._undoStack.length - 1];
        if (snap !== undefined && snap !== top) {
            state._undoStack.push(snap);
            if (state._undoStack.length > UNDO_MAX) state._undoStack.shift();
            state._redoStack.length = 0;
        }
    }

    // 应用新层数
    state.currentLayer = z;
    layerInput.value = z;
    state.selectedElement = null;

    // 切层后的新基线：内容不变，只是 layer 变了
    state._lastSavedSnapshot = _serializeHistory();

    requestRender();
    updatePanel();
    updateElemList();
}

function getLayerRange() {
	let minZ = 0, maxZ = state.level.size.h - 1;
	const allZ = [
		// 移动平台的所有路点（不仅仅是起点）
		...state.movingPlatforms.flatMap(m => (m.waypoints || []).map(wp => wp.z)),
		...state.fallingPlatforms.map(m => m.z),
		...state.prisms.map(m => m.z),
		...state.bumpers.map(m => m.z),
		...state.resizers.map(m => m.z),
		...state.checkpoints.map(m => m.z),
		...state.cameraTriggers.map(m => m.z),
		...state.buttons.map(m => m.z),
		...state.buttonSequences.flatMap(seq => (seq.buttons || []).map(btn => btn.position ? btn.position.z : 0)),
		...state.otherCubes.flatMap(m => [m.triggerZ, m.cubeZ]),
		...state.darkCubes.flatMap(m => [m.triggerZ, m.cubeZ])
	];
	if (allZ.length > 0) {
		minZ = Math.min(...allZ, minZ);
		maxZ = Math.max(...allZ, maxZ);
	}
	return { minZ, maxZ };
}

function setTool(tool) {
	state.currentTool = tool;
	// 清除所有工具栏按钮的高亮
	document.querySelectorAll('.toolbar button[id^="tool"]:not(#toolSingle):not(#toolBrush)').forEach(b => b.classList.remove('active'));
	// 清除所有面板中的同功能按钮的高亮
	document.querySelectorAll('.seq-tool-btn').forEach(b => b.classList.remove('active'));
	
	const btnMap = {
		static: 'toolStatic',
		moving: 'toolMoving',
		falling: 'toolFalling',
		prism: 'toolPrism',
		resizerGrow: 'toolResizerGrow',
		resizerShrink: 'toolResizerShrink',
		bumper: 'toolBumper',
		checkpoint: 'toolCheckpoint',
		cameratrigger: 'toolCameraTrigger',
		button: 'toolButton',
		seqbutton: 'toolSeqButton',
		othercube: 'toolOtherCube',
		darkcube: 'toolDarkCube',
		eraser: 'toolEraser'
	};
	const id = btnMap[tool];
	if (id) {
		const btn = document.getElementById(id);
		if (btn) btn.classList.add('active');
		// 同时高亮所有 data-tool 匹配的按钮
		document.querySelectorAll(`.seq-tool-btn[data-tool="${tool}"]`).forEach(b => b.classList.add('active'));
	}
	showToast(`工具: ${tool}`);
}
function syncLevelUI() {
	const lv = state.level;
	levelIdInput.value = lv.id;
	levelNameInput.value = lv.name;
	levelTimeInput.value = lv.timeThresholds.join(',');
	sizeWInput.value = lv.size.w;
	sizeLInput.value = lv.size.l;
	sizeHInput.value = lv.size.h;
	spawnInput.value = formatCoord(lv.spawn);
	exitInput.value = formatCoord(lv.exit);
	levelThemeInput.value = lv.theme;
	musicJavaInput.value = lv.musicJava;
	musicInput.value = lv.music;
	levelZoomInput.value = lv.zoom;
	levelAngleInput.value = ('angle' in lv) ? lv.angle : '';
	levelFovInput.value = ('fov' in lv) ? lv.fov : '';
	modelThemeInput.value = ('modelTheme' in lv) ? lv.modelTheme : '';
	/*if (state.currentLayer > lv.size.h) {
		state.currentLayer = lv.size.h;
		layerInput.value = state.currentLayer;
	}*/
    // 上限交给 updateLayerMax（canvasRange 已含当前层），这里只保证有效数字
    if (typeof state.currentLayer !== 'number' || isNaN(state.currentLayer)) {
        state.currentLayer = 0;
    }
    layerInput.value = state.currentLayer;
		const useAngleCheck = document.getElementById('levelUseAngle');
		if (useAngleCheck) {
			useAngleCheck.checked = state.levelUseAngle || false;
		}
	updateCanvasRangeFromSize();
	updateLayerMax();
}

// ===== 辅助：从 affect 字符串中提取指定 ID 的数据 =====
function getAffectData(str, id) {
    if (!str) return -1;
    // 匹配 id(数字) 或单独 id
    const parts = str.split(',').map(s => s.trim()).filter(s => s);
    for (let part of parts) {
        const match = part.match(/^([^(]+)\((\d+)\)$/);
        if (match) {
            const pid = match[1].trim();
            if (pid === id) return parseInt(match[2], 10);
        } else if (part === id) {
            // 旧格式无数据，视为0
            return -1;
        }
    }
    return -1;
}

/**
 * 生成全局唯一的 xmlId
 * @param {string} baseId - 基础 ID，如 'M1'
 * @returns {string} 唯一的 xmlId，若冲突则自动追加随机后缀
 */
function generateUniqueXmlId(baseId) {
	// 收集所有已存在的 xmlId（包括所有元素类型的 xmlId 字段）
	const allXmlIds = new Set();
	const typeKeys = [
		'movingPlatforms', 'fallingPlatforms', 'prisms', 'resizers',
		'bumpers', 'checkpoints', 'cameraTriggers', 'buttons',
		'buttonSequences', 'otherCubes', 'darkCubes'
	];
	typeKeys.forEach(key => {
		const arr = state[key] || [];
		arr.forEach(item => {
			if (item.xmlId) allXmlIds.add(item.xmlId);
		});
	});

	let candidate = baseId;
	let attempts = 0;
	// 如果冲突，追加随机十六进制后缀
	while (allXmlIds.has(candidate) && attempts < 30) {
		const rand = Math.floor(Math.random() * 65536)
						   .toString(16)
						   .padStart(4, '0');
		candidate = baseId + rand;
		attempts++;
	}
	// 极端情况：仍冲突则使用时间戳
	if (allXmlIds.has(candidate)) {
		candidate = baseId + Date.now().toString(16).slice(-4);
	}
	return candidate;
}

// 清理所有引用指定ID的属性（用于删除元素时）
// 判断 affect 字符串中某一项是否引用了指定 ID（支持 "id" 和 "id(data)" 两种格式）
function _affectItemMatchesId(item, id) {
    const match = item.match(/^([^(]+)(\([^)]*\))?$/);
    const itemId = match ? match[1].trim() : item.trim();
    return itemId === id;
}

// 从 affect 字符串中移除所有引用指定 ID 的项
function _removeIdFromAffectStr(str, id) {
    if (!str) return str;
    const items = str.split(',').map(s => s.trim()).filter(s => s);
    const filtered = items.filter(item => !_affectItemMatchesId(item, id));
    return filtered.join(',');
}

function cleanReferences(deletedId) {
    // ---- 独立按钮 ----
    state.buttons.forEach(btn => {
        if (btn.movingPlatformID === deletedId) btn.movingPlatformID = '';
        ['affectMoving', 'affectBumpers', 'affectButtons'].forEach(field => {
            if (btn[field]) btn[field] = _removeIdFromAffectStr(btn[field], deletedId);
        });
    });

    // ---- 按钮序列 ----
    state.buttonSequences.forEach(seq => {
        ['affectMoving', 'affectBumpers', 'affectButtons'].forEach(field => {
            if (seq[field]) seq[field] = _removeIdFromAffectStr(seq[field], deletedId);
        });
        // 序列内子按钮
        if (seq.buttons) {
            seq.buttons.forEach(btn => {
                if (btn.movingPlatformID === deletedId) btn.movingPlatformID = '';
                ['affectMoving', 'affectBumpers', 'affectButtons'].forEach(field => {
                    if (btn[field]) btn[field] = _removeIdFromAffectStr(btn[field], deletedId);
                });
            });
        }
    });

    // ---- OtherCube / DarkCube 的 movingBlockSync ----
    state.otherCubes.forEach(oc => {
        if (oc.movingBlockSync === deletedId) oc.movingBlockSync = '';
    });
    state.darkCubes.forEach(dc => {
        if (dc.movingBlockSync === deletedId) dc.movingBlockSync = '';
    });

    // ---- 移动平台的 RelatedTo ----
    state.movingPlatforms.forEach(mp => {
        if (mp.relatedTo === deletedId) mp.relatedTo = '';
    });
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function parseCoord(str) {
	if (!str) return null;
	const parts = str.split(',').map(s => parseInt(s.trim()));
	if (parts.length === 3 && !parts.some(isNaN)) return { x: parts[0], y: parts[1], z: parts[2] };
	return null;
}

function formatCoord(p) { return `${p.x},${p.y},${p.z}`; }

function getStaticDefault(z) {
	if (z === 0) return { r: 255, g: 255, b: 128 };
	return { r: 255, g: 255, b: 255 };
}

function generateId(prefix) {
	return prefix + (state.nextIdCounter++);
}

function getMovingPos(m, visited) {
    if (!visited) visited = new Set();
    if (visited.has(m.id)) {
        // 循环引用，返回(0,0,0)防止死循环
        console.warn('循环引用 detected in moving platform', m.id);
        return { x: 0, y: 0, z: 0 };
    }
    visited.add(m.id);

    // 如果有 relatedTo，解析目标位置 + offset
    if (m.relatedTo && m.relatedTo.trim() !== '') {
        // 查找目标移动平台（通过 xmlId 或 id）
        const target = state.movingPlatforms.find(p => 
            (p.xmlId && p.xmlId === m.relatedTo) || (p.id && p.id === m.relatedTo)
        );
        if (target) {
            // 递归获取目标位置
            const targetPos = getMovingPos(target, visited);
            // 解析 offset
            let offset = { x: 0, y: 0, z: 0 };
            if (m.offset && typeof m.offset === 'string') {
                const parts = m.offset.split(',').map(s => parseInt(s.trim(), 10));
                if (parts.length === 3 && !parts.some(isNaN)) {
                    offset = { x: parts[0], y: parts[1], z: parts[2] };
                }
            }
            return {
                x: targetPos.x + offset.x,
                y: targetPos.y + offset.y,
                z: targetPos.z + offset.z
            };
        } else {
            // 目标未找到，回退到自己的第一个路点
            if (!m.waypoints || m.waypoints.length === 0) return { x: 0, y: 0, z: 0 };
            const wp = m.waypoints[0];
            return { x: wp.x, y: wp.y, z: wp.z };
        }
    }

    // 无 relatedTo，返回自己的第一个路点
    if (!m.waypoints || m.waypoints.length === 0) return { x: 0, y: 0, z: 0 };
    const wp = m.waypoints[0];
    return { x: wp.x, y: wp.y, z: wp.z };
}

// 按增量切换层数（复用 changeLayer 的裁剪逻辑）
function changeLayerBy(delta) {
    const current = parseInt(layerInput.value) || 0;
    layerInput.value = current + delta;
    changeLayer(); // changeLayer 内部会根据 minZ/maxZ 做 clamp，并刷新渲染
}

// ===== 撤销 / 重做 =====
const UNDO_MAX = 50;

function _serializeHistory() {
    return JSON.stringify({
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
        autoName: state.autoName
    });
}

function _restoreHistory(str) {
    const data = JSON.parse(str);
    Object.assign(state, data);
    rebuildSpatialIndex();
    updateCanvasRangeFromSize();
    
    // ← 新增：把当前层纳入范围，避免被 updateLayerMax 钳制
    const z = state.currentLayer;
    if (typeof z === 'number' && !isNaN(z)) {
        if (z < state.canvasRange.minZ) state.canvasRange.minZ = z;
        if (z > state.canvasRange.maxZ) state.canvasRange.maxZ = z;
    }

    updateLayerMax();
    //state.selectedElement = null;
    state.highlightedMesh = null;
    if (typeof threeScene !== 'undefined' && threeScene) clear3DScene();
    _validateSelectedElement();
    
    syncLevelUI();
    requestRender();
    updatePanel();
    updateElemList();
    updateStatus();
    // 注意：这里不调 saveCache，避免递归
    try {
        localStorage.setItem(CACHE_KEY, str);
    } catch (e) {}
}

// 由 saveCache 内部自动调用；也可以手动调用
window.pushUndo = function() {
    if (state._suppressUndo) return;
    if (!state._undoStack) state._undoStack = [];
    if (!state._redoStack) state._redoStack = [];
    const snap = state._lastSavedSnapshot;
    if (snap === undefined) return;

    // ---- 画笔 session：整段只记录一次 ----
    if (state._brushSessionActive) {
        if (state._brushSessionRecorded) return;   // 已经记过，跳过
        state._brushSessionRecorded = true;
    }
    // ---- session 结束 ----

    if (state._undoStack.length > 0 &&
        state._undoStack[state._undoStack.length - 1] === snap) return;
    state._undoStack.push(snap);
    if (state._undoStack.length > UNDO_MAX) state._undoStack.shift();
    state._redoStack.length = 0;
};

window.undo = function() {
    if (!state._undoStack || state._undoStack.length === 0) {
        showToast('没有可撤销的操作');
        return;
    }
    state._suppressUndo = true;
    const current = _serializeHistory();
    const prev = state._undoStack.pop();
    state._redoStack.push(current);
    state._lastSavedSnapshot = prev;   // 同步基线，防止后续 saveCache 误判
    _restoreHistory(prev);
    state._suppressUndo = false;
    showToast('已撤销');
};

window.redo = function() {
    if (!state._redoStack || state._redoStack.length === 0) {
        showToast('没有可重做的操作');
        return;
    }
    state._suppressUndo = true;
    const current = _serializeHistory();
    const next = state._redoStack.pop();
    state._undoStack.push(current);
    state._lastSavedSnapshot = next;
    _restoreHistory(next);
    state._suppressUndo = false;
    showToast('已重做');
};

function _validateSelectedElement() {
    const sel = state.selectedElement;
    if (!sel) return;
    if (sel.type === 'static') {
        const c = sel.staticCoord;
        const layer = state.staticBlocks[c.z];
        if (!layer || !layer[c.y] || !layer[c.y][c.x]) {
            state.selectedElement = null;
        }
        return;
    }
    if (sel.type === 'seqbutton') {
        let found = false;
        for (const seq of state.buttonSequences) {
            if (seq.buttons && seq.buttons.some(b => b.id === sel.id)) {
                found = true; break;
            }
        }
        if (!found) state.selectedElement = null;
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
        buttonsequence: state.buttonSequences,
        othercube: state.otherCubes,
        darkcube: state.darkCubes,
        othercube_trigger: state.otherCubes,
        othercube_cube: state.otherCubes,
        darkcube_trigger: state.darkCubes,
        darkcube_cube: state.darkCubes,
    };
    const arr = arrays[sel.type];
    if (!arr || !arr.some(e => e.id === sel.id)) {
        state.selectedElement = null;
    }
}