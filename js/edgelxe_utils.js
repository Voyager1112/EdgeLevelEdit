// ============ 元素列表差异更新 ============
const _elemListCache = new Map();   // key -> { sig, nodes }
let _elemListLastFilter = null;
let _lastUnifiedBaseSig = null;

function _htmlToNodes(html) {
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    return Array.from(wrap.children);
}

// 普通元素（非 buttonsequence）：原 updateElemList 里的 html 拼接逻辑搬过来
function _renderNormalElemItem(item) {
    const active = (state.selectedElement && state.selectedElement.type === item.type &&
                    state.selectedElement.id === item.id) ? 'active' : '';
    let extraButtons = '';

    if (item.type === 'checkpoint') {
        const idx = state.checkpoints.findIndex(c => c.id === item.id);
        if (idx !== -1) {
            extraButtons = `
                <button class="btn-sm" onclick="event.stopPropagation(); moveCheckpoint(${idx}, -1)" style="margin-left:4px;">↑</button>
                <button class="btn-sm" onclick="event.stopPropagation(); moveCheckpoint(${idx}, 1)" style="margin-left:2px;">↓</button>
            `;
        }
    }

    return `<div class="elem-item ${active}" onclick="selectElement('${item.type}', '${item.id}')">
                <span>${item.desc}</span>
                ${extraButtons}
            </div>`;
}

// buttonsequence 复合块：父项 + 展开的子按钮，作为单一更新单元
function _renderButtonSequenceBlock(item, seq, movingPosMap) {
    const active = (state.selectedElement && state.selectedElement.type === 'buttonsequence' &&
                    state.selectedElement.id === item.id) ? 'active' : '';
    const expanded = state.expandedSequences && state.expandedSequences[item.id];
    const hasChildren = seq.buttons && seq.buttons.length > 0;

    let html = `<div class="elem-item ${active}" onclick="selectElement('${item.type}', '${item.id}')">
        <span>${item.desc}</span>
        ${hasChildren ? `<button class="btn-sm" onclick="event.stopPropagation(); toggleSequenceExpand('${item.id}')" 
                                title="${expanded ? '收起' : '展开'}" style="margin-left:4px;">${expanded ? '▼' : '◀'}</button>` : ''}
    </div>`;

    if (hasChildren && expanded) {
        seq.buttons.forEach((btn, idx) => {
            const subActive = (state.selectedElement &&
                               state.selectedElement.type === 'seqbutton' &&
                               state.selectedElement.id === btn.id) ? 'active' : '';
            const dispId = btn.xmlId ? `${btn.id}(${btn.xmlId})` : btn.id;
            let subMpStr = btn.movingPlatformID ? `[${btn.movingPlatformID}]` : '';
            let subCoordStr = '';
            if (btn.movingPlatformID) {
                const pos = movingPosMap[btn.movingPlatformID];
                subCoordStr = pos ? `${pos.x},${pos.y},${pos.z}` : '?';
            } else if (btn.position) {
                subCoordStr = `${btn.position.x},${btn.position.y},${btn.position.z}`;
            } else {
                subCoordStr = '-';
            }
            html += `<div class="elem-item ${subActive}" 
                          style="padding-left:22px;font-size:11px;"
                          onclick="selectElement('seqbutton', '${btn.id}')">
                <span>↳ #${idx+1} ${dispId} ${subMpStr} (${subCoordStr})</span>
                <span style="display:flex;gap:2px;">
                    <button class="btn-sm" onclick="event.stopPropagation(); moveSeqButtonInList('${item.id}', ${idx}, -1)">↑</button>
                    <button class="btn-sm" onclick="event.stopPropagation(); moveSeqButtonInList('${item.id}', ${idx}, 1)">↓</button>
                </span>
            </div>`;
        });
    }
    return html;
}
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

// 选择对话框（改为鼠标旁的下拉悬浮框）
function showSelectDialog(items, callback) {
    const oldMenu = document.getElementById('floatingSelectDialog');
    if (oldMenu) oldMenu.remove();

    const menu = document.createElement('div');
    menu.id = 'floatingSelectDialog';
    // 获取当前鼠标点击的屏幕坐标
    const px = window._lastMouseClickX || 100;
    const py = window._lastMouseClickY || 100;
    
    menu.style.cssText = `
        position: fixed;
        left: ${px}px;
        top: ${py}px;
        background: var(--bg-panel);
        border: 1px solid var(--border-strong);
        box-shadow: var(--shadow-menu);
        z-index: 10000;
        max-height: 250px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        min-width: 120px;
    `;

    items.forEach((item) => {
        const btn = document.createElement('div');
        btn.textContent = item.desc;
        btn.style.cssText = `padding: 6px 12px; font-size: 12px; color: var(--text); cursor: pointer; border-bottom: 1px solid var(--border);`;
        btn.onmouseenter = () => btn.style.background = 'var(--bg-hover)';
        btn.onmouseleave = () => btn.style.background = 'transparent';
        
        btn.onclick = (e) => {
            e.stopPropagation();
            closeSelectDialog();
            callback(item);
        };
        menu.appendChild(btn);
    });

    document.body.appendChild(menu);

    // ★ 核心：防止下拉框超出屏幕右/下边缘
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (px - rect.width) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (py - rect.height) + 'px';

    setTimeout(() => {
        const closeHandler = (e) => {
            if (!menu.contains(e.target)) {
                closeSelectDialog();
                document.removeEventListener('pointerdown', closeHandler);
            }
        };
        document.addEventListener('pointerdown', closeHandler);
    }, 10);
}

function handleOutsideClick(e) {
    const menu = document.getElementById('floatingSelectDialog');
    if (menu && !menu.contains(e.target)) {
        closeSelectDialog();
    }
}

function closeSelectDialog() {
    const menu = document.getElementById('floatingSelectDialog');
    if (menu) menu.remove();
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

// 普通元素（非 buttonsequence）：原 updateElemList 里的 html 拼接逻辑搬过来
function _renderNormalElemItem(item) {
    const active = (state.selectedElement && state.selectedElement.type === item.type &&
                    state.selectedElement.id === item.id) ? 'active' : '';

    let extraButtons = '';

    // checkpoint 排序按钮
    if (item.type === 'checkpoint') {
        const idx = state.checkpoints.findIndex(c => c.id === item.id);
        if (idx !== -1) {
            extraButtons = `
                <button class="btn-sm" onclick="event.stopPropagation(); moveCheckpoint(${idx}, -1)" 
                        style="margin-left:4px;">↑</button>
                <button class="btn-sm" onclick="event.stopPropagation(); moveCheckpoint(${idx}, 1)" 
                        style="margin-left:2px;">↓</button>
            `;
        }
    }

    return `<div class="elem-item ${active}" onclick="selectElement('${item.type}', '${item.id}')">
                <span>${item.desc}</span>
                ${extraButtons}
            </div>`;
}

// buttonsequence 复合块：父项 + 展开的子按钮，整体作为一个更新单元
function _renderButtonSequenceBlock(item, seq, movingPosMap) {
    const active = (state.selectedElement && state.selectedElement.type === 'buttonsequence' &&
                    state.selectedElement.id === item.id) ? 'active' : '';

    const expanded = state.expandedSequences && state.expandedSequences[item.id];
    const hasChildren = seq.buttons && seq.buttons.length > 0;

    let html = `<div class="elem-item ${active}" onclick="selectElement('${item.type}', '${item.id}')">
        <span>${item.desc}</span>
        ${hasChildren ? `<button class="btn-sm" onclick="event.stopPropagation(); toggleSequenceExpand('${item.id}')" 
                                title="${expanded ? '收起' : '展开'}" style="margin-left:4px;">${expanded ? '▼' : '◀'}</button>` : ''}
    </div>`;

    if (hasChildren && expanded) {
        seq.buttons.forEach((btn, idx) => {
            const subActive = (state.selectedElement &&
                               state.selectedElement.type === 'seqbutton' &&
                               state.selectedElement.id === btn.id) ? 'active' : '';
            const dispId = btn.xmlId ? `${btn.id}(${btn.xmlId})` : btn.id;
            let subMpStr = btn.movingPlatformID ? `[${btn.movingPlatformID}]` : '';
            let subCoordStr = '';
            if (btn.movingPlatformID) {
                const pos = movingPosMap[btn.movingPlatformID];
                subCoordStr = pos ? `${pos.x},${pos.y},${pos.z}` : '?';
            } else if (btn.position) {
                subCoordStr = `${btn.position.x},${btn.position.y},${btn.position.z}`;
            } else {
                subCoordStr = '-';
            }
            html += `<div class="elem-item ${subActive}" 
                          style="padding-left:22px;font-size:11px;"
                          onclick="selectElement('seqbutton', '${btn.id}')">
                <span>↳ #${idx+1} ${dispId} ${subMpStr} (${subCoordStr})</span>
                <span style="display:flex;gap:2px;">
                    <button class="btn-sm" onclick="event.stopPropagation(); moveSeqButtonInList('${item.id}', ${idx}, -1)">↑</button>
                    <button class="btn-sm" onclick="event.stopPropagation(); moveSeqButtonInList('${item.id}', ${idx}, 1)">↓</button>
                </span>
            </div>`;
        });
    }
    return html;
}

// 字符串 → DOM 节点数组（只取顶层，多个并列元素用一个 wrapper 解析）
function _htmlToNodes(html) {
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    return Array.from(wrap.children);
}

// 元素列表
function updateElemList() {
    if (state._suppressUI) return;
    const filterType = document.getElementById('elemFilterSelect')?.value || 'all';

    // filter 变了 → 全量重建
    if (filterType !== _elemListLastFilter) {
        _elemListCache.clear();
        elemListContainer.innerHTML = '';
        _elemListLastFilter = filterType;
    }

    // ---- 收集 all（原逻辑不变） ----
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
    state.buttons.forEach(m => {
        const displayId = m.xmlId ? `${m.id}(${m.xmlId})` : m.id;
        let coordStr = '';
        if (m.movingPlatformID) {
            const pos = movingPosMap[m.movingPlatformID];
            coordStr = pos ? `${pos.x},${pos.y},${pos.z}` : '?';
        } else {
            coordStr = `${m.x},${m.y},${m.z}`;
        }
        const mpStr = m.movingPlatformID ? '[' + m.movingPlatformID + ']' : '';
        all.push({ type: 'button', id: m.id, desc: `按钮 ${displayId} ${mpStr} (${coordStr})` });
    });
    state.buttonSequences.forEach(m => {
        const count = (m.buttons || []).length;
        all.push({ type: 'buttonsequence', id: m.id, desc: `按钮序列 #${m.id} (${count}个按钮)` });
    });
    state.otherCubes.forEach(m => all.push({ type: 'othercube', id: m.id, desc: `提示 #${m.id} (触发${m.triggerX},${m.triggerY},${m.triggerZ})` }));
    state.darkCubes.forEach(m => all.push({ type: 'darkcube', id: m.id, desc: `黑暗 #${m.id} (触发${m.triggerX},${m.triggerY},${m.triggerZ})` }));

    let filtered = all;
    if (filterType !== 'all') filtered = all.filter(item => item.type === filterType);

    if (filtered.length === 0) {
        elemListContainer.innerHTML = '<div style="color:#5a7a9a;font-size:12px;padding:4px;">暂无元素</div>';
        _elemListCache.clear();
        return;
    }

    // ---- 构建 blocks + 差异更新 ----
    const blocks = [];
    const seenKeys = new Set();

    for (const item of filtered) {
        if (item.type === 'buttonsequence') {
            const seq = state.buttonSequences.find(s => s.id === item.id);
            if (seq) {
                const key = `block:bs:${item.id}`;
                const html = _renderButtonSequenceBlock(item, seq, movingPosMap);
                blocks.push({ key, sig: html, html });
                seenKeys.add(key);
                continue;
            }
        }
        const key = `${item.type}:${item.id}`;
        const html = _renderNormalElemItem(item);
        blocks.push({ key, sig: html, html });
        seenKeys.add(key);
    }

    // 确保 add 按钮存在（始终作为最后一个 child）
    let addBtnWrap = elemListContainer.querySelector('[data-role="elem-add-btn"]');
    if (!addBtnWrap) {
        addBtnWrap = document.createElement('div');
        addBtnWrap.dataset.role = 'elem-add-btn';
        addBtnWrap.style.padding = '4px 0';
        addBtnWrap.innerHTML = '<button class="add-btn" onclick="addButtonSequence()">+ 创建按钮序列</button>';
        elemListContainer.appendChild(addBtnWrap);
    }

    // 复用缓存 or 重建
    const finalNodes = [];
    for (const block of blocks) {
        const cached = _elemListCache.get(block.key);
        if (!cached || cached.sig !== block.sig) {
            if (cached) cached.nodes.forEach(n => n.remove());
            const nodes = _htmlToNodes(block.html);
            _elemListCache.set(block.key, { sig: block.sig, nodes });
            finalNodes.push(...nodes);
        } else {
            finalNodes.push(...cached.nodes);
        }
    }

    // 删除不再存在的块
    for (const [key, entry] of _elemListCache) {
        if (!seenKeys.has(key)) {
            entry.nodes.forEach(n => n.remove());
            _elemListCache.delete(key);
        }
    }

    // 顺序检查：顺序没变就不碰 DOM
    const currentChildren = Array.from(elemListContainer.children).filter(n => n !== addBtnWrap);
    let needsReorder = currentChildren.length !== finalNodes.length;
    if (!needsReorder) {
        for (let i = 0; i < finalNodes.length; i++) {
            if (currentChildren[i] !== finalNodes[i]) { needsReorder = true; break; }
        }
    }
    if (needsReorder) {
        for (const node of finalNodes) {
            elemListContainer.insertBefore(node, addBtnWrap);
        }
    }

    // add 按钮确保在最后
    if (elemListContainer.lastElementChild !== addBtnWrap) {
        elemListContainer.appendChild(addBtnWrap);
    }

    refreshUnifiedBaseList();
}

function refreshUnifiedBaseList() {
    const parts = [];
    for (const m of state.movingPlatforms) {
        if (!m.xmlId) continue;
        const pos = getMovingPos(m);
        parts.push(`${m.xmlId}@${pos.x},${pos.y},${pos.z}`);
    }
    const sig = parts.join('|');
    if (sig === _lastUnifiedBaseSig) return;
    _lastUnifiedBaseSig = sig;

    const currentVal = unifiedSelect.value;
    unifiedSelect.innerHTML = '<option value="">— 选择基准移动平台 —</option>';
    state.movingPlatforms.forEach(m => {
        if (!m.xmlId) return;
        const pos = getMovingPos(m);
        const label = `${m.xmlId} (${pos.x},${pos.y},${pos.z})`;
        const opt = document.createElement('option');
        opt.value = m.xmlId;
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

function updateStatus() {
    if (state._suppressUI) return;
    let sc = 0;
    const c = state._staticCounts || {};
    for (const z in c) sc += c[z];
    const text = `静态: ${sc} | 移动: ${state.movingPlatforms.length} | 掉落: ${state.fallingPlatforms.length} | 棱柱: ${state.prisms.length} | 放大: ${state.resizers.filter(r=>r.type==='grow').length} | 缩小: ${state.resizers.filter(r=>r.type==='shrink').length} | 撞击: ${state.bumpers.length} | 存档: ${state.checkpoints.length} | 相机: ${state.cameraTriggers.length} | 按钮: ${state.buttons.length} | 提示: ${state.otherCubes.length} | 黑暗: ${state.darkCubes.length} | 按钮序列: ${state.buttonSequences.length}`;
    if (statusRight.textContent !== text) statusRight.textContent = text;
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
  if (!state.staticBlocks[z]) { showToast('该层已是空的'); return; }
  if (!confirm(`清空第 ${z} 层所有静态方块？`)) return;
  const before = _cloneDeep(state.staticBlocks[z]);        // ★
  delete state.staticBlocks[z];
  delete state._staticCounts[z];
  _recordStep({ kind: 'layerClear', z, before, after: null });// ★
  _dropLayerIndex(z);                                      // ★
  _markDirty(`layer_${z}`);                                // ★
  if (state.selectedElement && state.selectedElement.type === 'static' && state.selectedElement.staticCoord.z === z) {
    state.selectedElement = null;
  }
  requestRender(); updatePanel(); updateStatus(); uniInterface(); showToast(`第 ${z} 层已清空`);
}

function changeLayer() {
  let z = parseInt(layerInput.value) || 0;
  const { minZ, maxZ } = getLayerRange();
  if (z < minZ) z = minZ; else if (z > maxZ) z = maxZ;
  const old = state.currentLayer;
  if (z === old) { layerInput.value = z; return; }
  _recordStep({ kind: 'layer', before: old, after: z });   // ★
  state.currentLayer = z; layerInput.value = z; state.selectedElement = null;
  requestRender(); updatePanel(); updateElemList();
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
    // ★ 切换到非多选工具时，清空多选
    if (tool !== 'multiselect' && state.multiSelection && state.multiSelection.length) {
        state.multiSelection = [];
    }
	state.currentTool = tool;
	// 清除所有工具栏按钮的高亮
	document.querySelectorAll('.toolbar button[id^="tool"]:not(#toolSingle):not(#toolBrush)').forEach(b => b.classList.remove('active'));
	// 清除所有面板中的同功能按钮的高亮
	document.querySelectorAll('.seq-tool-btn').forEach(b => b.classList.remove('active'));
	
	const btnMap = {
		static: 'toolStatic',
		moving: 'toolMoving',
        waypoint: 'toolWaypoint',
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
		eraser: 'toolEraser',
        multiselect: 'toolMultiSelect',
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

// 每层单独压缩
function compressLayerForStorage(layer, w, l) {
    const palette = [];
    const colorMap = new Map();
    const entries = [];
    for (let y = 0; y < l; y++) {
        const row = layer[y];
        if (!row) continue;
        for (let x = 0; x < w; x++) {
            const block = row[x];
            if (!block) continue;
            const colorKey = `${block.r},${block.g},${block.b}`;
            let cIdx = colorMap.get(colorKey);
            if (cIdx === undefined) {
                cIdx = palette.length;
                palette.push([block.r, block.g, block.b]);
                colorMap.set(colorKey, cIdx);
            }
            entries.push(x, y, cIdx);   // ★ 只存 x, y, cIdx（z 在外面）
        }
    }
    return { palette, entries };
}

function decompressLayerFromStorage(packed, w, l) {
    const layer = Array.from({ length: l }, () => Array(w).fill(null));
    const palette = packed.palette;
    const entries = packed.entries;
    for (let i = 0; i < entries.length; i += 3) {
        const x = entries[i];
        const y = entries[i + 1];
        const color = palette[entries[i + 2]];
        if (layer[y] && color) layer[y][x] = { r: color[0], g: color[1], b: color[2] };
    }
    return layer;
}


const CACHE_FORMAT_VERSION = 3;

function compressDataForStorage(data) {
    if (!data || !data.staticBlocks || !data.level || !data.level.size) return data;
    
    const palette = []; // 颜色池
    const colorMap = new Map(); // 颜色到索引的映射
    const entries = []; // 拍平的方块数据

    for (const zKey in data.staticBlocks) {
        const layer = data.staticBlocks[zKey];
        if (!layer) continue;
        const z = parseInt(zKey, 10);
        for (let y = 0; y < layer.length; y++) {
            const row = layer[y];
            if (!row) continue;
            for (let x = 0; x < row.length; x++) {
                const block = row[x];
                if (!block) continue;
                
                // 提取颜色特征
                const colorKey = `${block.r},${block.g},${block.b}`;
                let colorIdx = colorMap.get(colorKey);
                
                // 如果是新颜色，加入调色板
                if (colorIdx === undefined) {
                    colorIdx = palette.length;
                    palette.push([block.r, block.g, block.b]); // 用数组节省空间
                    colorMap.set(colorKey, colorIdx);
                }
                
                // ★ 核心：采用平铺一维数组，极大减少 JSON 的括号数量
                entries.push(x, y, z, colorIdx);
            }
        }
    }

    const copy = { ...data };
    delete copy.staticBlocks;
    
    copy.staticBlocksPalette = palette; // 存放所有用到的颜色
    copy.staticBlocksData = entries;    // 存放 [x,y,z,cIdx, x,y,z,cIdx...]
    copy._cacheFormat = CACHE_FORMAT_VERSION;
    return copy;
}

function decompressLegacyBase64(data) {
    const { w, l, h } = data.level.size;
    const binaryString = atob(data.staticBlocksCompressed);
    const len = binaryString.length;
    const buffer = new Uint8Array(len);
    for (let i = 0; i < len; i++) buffer[i] = binaryString.charCodeAt(i);

    const staticBlocks = {};
    let idx = 0;
    for (let z = 0; z < h; z++) {
        let layer = null;
        for (let y = 0; y < l; y++) {
            for (let x = 0; x < w; x++) {
                if (idx + 3 < len && buffer[idx + 3] > 0) {
                    if (!layer) {
                        layer = Array.from({ length: l }, () => Array(w).fill(null));
                        staticBlocks[z] = layer;
                    }
                    layer[y][x] = { r: buffer[idx], g: buffer[idx+1], b: buffer[idx+2] };
                }
                idx += 4;
            }
        }
    }
    const copy = { ...data };
    delete copy.staticBlocksCompressed;
    copy.staticBlocks = staticBlocks;
    return copy;
}

function decompressDataFromStorage(data) {
    if (!data) return data;

    // ① 新调色板格式（放宽：只要有 staticBlocksPalette 就解压）
    if (Array.isArray(data.staticBlocksPalette) && Array.isArray(data.staticBlocksData)) {
        const { w, l } = data.level.size;
        const staticBlocks = {};
        const palette = data.staticBlocksPalette;
        const entries = data.staticBlocksData;

        for (let i = 0; i < entries.length; i += 4) {
            const x = entries[i];
            const y = entries[i + 1];
            const z = entries[i + 2];
            const color = palette[entries[i + 3]];
            if (!color) continue;
            if (!staticBlocks[z]) {
                staticBlocks[z] = Array.from({ length: l }, () => Array(w).fill(null));
            }
            if (staticBlocks[z][y]) staticBlocks[z][y][x] = { r: color[0], g: color[1], b: color[2] };
        }

        const copy = { ...data };
        delete copy.staticBlocksPalette;
        delete copy.staticBlocksData;
        copy._cacheFormat = CACHE_FORMAT_VERSION;
        copy.staticBlocks = staticBlocks;
        return copy;
    }

    // ② 兼容旧的稀疏格式（如果你以前存过的）
    if (Array.isArray(data.staticBlocksSparse)) {
        const { w, l } = (data.level && data.level.size) || { w: 0, l: 0 };
        const staticBlocks = {};
        for (const entry of data.staticBlocksSparse) {
            const [x, y, z, r, g, b] = entry;
            let layer = staticBlocks[z];
            if (!layer) {
                layer = Array.from({ length: l }, () => Array(w).fill(null));
                staticBlocks[z] = layer;
            }
            if (layer[y]) layer[y][x] = { r, g, b };
        }
        const copy = { ...data };
        delete copy.staticBlocksSparse;
        delete copy._cacheFormat;
        copy.staticBlocks = staticBlocks;
        return copy;
    }
    
    // ② 老 base64 格式（兼容之前存过的缓存）
    if (data.staticBlocksCompressed) {
        return decompressLegacyBase64(data);
    }
    
    return data;
}


// ===== 替代原生 prompt（Electron 不支持 window.prompt） =====
window.showCustomPrompt = function(title, defaultValue = '') {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        // 使用半透明黑色遮罩
        overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.3); z-index:99999; display:flex; justify-content:center; align-items:center;';
        
        const dialog = document.createElement('div');
        // 使用 CSS 变量适配深浅色主题
        dialog.style.cssText = 'background:var(--bg); padding:20px; border:1px solid var(--border-strong); color:var(--text); min-width:320px; box-shadow:var(--shadow-modal);';
        
        dialog.innerHTML = `
            <h3 style="margin-top:0; color:var(--text); font-size:14px; font-weight:600; margin-bottom:12px;">${title}</h3>
            <input type="text" id="customPromptInput" value="${defaultValue}" style="width:100%; box-sizing:border-box; padding:4px 8px; margin-bottom:16px; background:var(--bg-input); color:var(--text); border:1px solid var(--border-strong); font-size:13px; outline:none;">
            <div style="text-align:right; display:flex; gap:8px; justify-content:flex-end;">
                <button id="customPromptCancel" class="btn-danger" style="padding:4px 14px;">取消</button>
                <button id="customPromptOk" class="primary" style="padding:4px 14px;">确定</button>
            </div>
        `;
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const input = document.getElementById('customPromptInput');
        input.focus();
        input.select();

        const close = (result) => {
            document.body.removeChild(overlay);
            resolve(result);
        };

        document.getElementById('customPromptOk').onclick = () => close(input.value);
        document.getElementById('customPromptCancel').onclick = () => close(null);
        input.onkeydown = (e) => {
            if (e.key === 'Enter') close(input.value);
            if (e.key === 'Escape') close(null);
        };
    });
};

function _syncToolbarCheckboxes() {
    const keepCb = document.getElementById('keepPrevProps');
    if (keepCb) keepCb.checked = !!state.keepPrevProps;
    const autoCb = document.getElementById('autoNameCheck');
    if (autoCb) autoCb.checked = !!state.autoName;
    const addCb = document.getElementById('canvasAddMode');
    if (addCb) addCb.checked = (state.canvasEditMode === 'add');
}
window._syncToolbarCheckboxes = _syncToolbarCheckboxes;