// 全局变量..
var _selBox = null;   // 拖拽中的选框 {x0,y0,x1,y1}
// state.multiSelection 已在 edgelxe_elem.js 的 state 里定义

function initMultiSelect() {
    if (!canvas) return;

    // ---------- 鼠标 ----------
    canvas.addEventListener('mousedown', e => {
        if (state.currentTool !== 'multiselect') return;
        e.stopPropagation(); e.preventDefault();
        const p = screenToGrid(e);
        _selBox = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
        requestRender();
    }, true);

    canvas.addEventListener('mousemove', e => {
        if (!_selBox) return;
        const p = screenToGrid(e);
        _selBox.x1 = p.x; _selBox.y1 = p.y;
        requestRender();
    }, true);

    window.addEventListener('mouseup', e => {
        if (!_selBox) return;
        applySelectionFromBox();
        _selBox = null;
        requestRender();
        showSelectionPanel();
    }, true);

    // ---------- 触摸 ----------
    canvas.addEventListener('touchstart', e => {
        if (state.currentTool !== 'multiselect') return;
        e.preventDefault();
        const t = e.touches[0];
        const p = screenToGrid({ clientX: t.clientX, clientY: t.clientY });
        _selBox = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
        requestRender();
    }, { passive: false, capture: true });

    canvas.addEventListener('touchmove', e => {
        if (!_selBox) return;
        e.preventDefault();
        const t = e.touches[0];
        const p = screenToGrid({ clientX: t.clientX, clientY: t.clientY });
        _selBox.x1 = p.x; _selBox.y1 = p.y;
        requestRender();
    }, { passive: false, capture: true });

    canvas.addEventListener('touchend', e => {
        if (!_selBox) return;
        e.preventDefault();
        applySelectionFromBox();
        _selBox = null;
        requestRender();
        showSelectionPanel();
    }, { capture: true });
}

function screenToGrid(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * sx;
    const my = (e.clientY - rect.top) * sy;
    const gx = Math.floor((mx - PADDING) / PIXEL_SIZE);
    const gy = Math.floor((my - PADDING) / PIXEL_SIZE);
    return { x: currentMinX + gx, y: currentMinY + gy, z: state.currentLayer };
}

function applySelectionFromBox() {
    if (!_selBox) return;
    const x0 = Math.min(_selBox.x0, _selBox.x1);
    const x1 = Math.max(_selBox.x0, _selBox.x1);
    const y0 = Math.min(_selBox.y0, _selBox.y1);
    const y1 = Math.max(_selBox.y0, _selBox.y1);
    const z = state.currentLayer;

    // ★ 无论框里有没有东西，都记下这次框选矩形
    state._lastSelectionBox = {
        minX: x0, minY: y0, minZ: z,
        maxX: x1, maxY: y1, maxZ: z
    };
    // ★ 同步到粘贴输入框，用户能看到当前目标位置
    requestAnimationFrame(() => {
        const ix = document.getElementById('batchPasteX');
        const iy = document.getElementById('batchPasteY');
        const iz = document.getElementById('batchPasteZ');
        if (ix) ix.value = x0;
        if (iy) iy.value = y0;
        if (iz) iz.value = z;
    });
    state.multiSelection = [];
    const seen = new Set();
    const layer = state.staticBlocks[z];

    const includeEmpty = !!(state.settings && state.settings.msIncludeEmpty);

    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
            let hasSomething = false;

            if (layer && layer[y] && layer[y][x]) {
                const key = `static:${x},${y},${z}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    state.multiSelection.push({ type: 'static', coord: { x, y, z } });
                }
                hasSomething = true;
            }
            const entries = getEntriesAt(x, y, z);
            entries.forEach(e => {
                if (e.type === 'waypoint') return;
                const key = `${e.type}:${e.id}`;
                if (seen.has(key)) return;
                seen.add(key);
                state.multiSelection.push({ type: e.type, id: e.id });
                hasSomething = true;
            });

            // ★ 空格子
            if (includeEmpty && !hasSomething) {
                const key = `empty:${x},${y},${z}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    state.multiSelection.push({ type: 'empty', coord: { x, y, z } });
                }
            }
        }
    }
    const realCount = state.multiSelection.filter(it => it.type !== 'empty').length;
    const emptyCount = state.multiSelection.length - realCount;
    if (realCount === 0 && emptyCount === 0) {
        showToast('未选中任何内容');
    } else if (realCount === 0) {
        showToast(`已选中 ${emptyCount} 个空格`);
    } else if (emptyCount > 0) {
        showToast(`已选中 ${realCount} 个元素 + ${emptyCount} 个空格`);
    } else {
        showToast(`已选中 ${realCount} 个元素`);
    }
}

// ---------- 批量编辑面板 ----------
function showSelectionPanel() {
    const pc = document.getElementById('panelContent');
    if (!pc) return;
    // ★ 只统计实际元素（empty 不算）
    const elementSel = state.multiSelection.filter(it => it.type !== 'empty');
    const n = elementSel.length;
    const emptyN = state.multiSelection.length - n;

    if (n === 0 && emptyN === 0) {
        pc.innerHTML = '<div class="empty-msg">未选中任何元素</div>';
        return;
    }

    // 判断 uniform 时也只用实际元素
    const realTypes = new Set(elementSel.map(it => it.type));
    const uniform = realTypes.size === 1 ? [...realTypes][0] : null;

    const counts = {};
    elementSel.forEach(it => { counts[it.type] = (counts[it.type] || 0) + 1; });
    const summary = Object.entries(counts).map(([t, c]) => `${t}:${c}`).join(' · ');

    let html = `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
            <span class="color-dot" style="background:#ffd700;"></span>
            <strong>多选：${n} 个</strong>
            ${emptyN > 0 ? `<span style="font-size:11px;color:#5a7a9a;">(含 ${emptyN} 空格)</span>` : ''}
        </div>
        <div style="font-size:11px; color:#8aaccc; margin-bottom:8px;">${summary || (emptyN > 0 ? '（仅空格）' : '')}</div>

        <div class="prop-row">
            <button class="add-btn" onclick="batchShiftSelection(1,0,0)">X+1</button>
            <button class="add-btn" onclick="batchShiftSelection(-1,0,0)">X-1</button>
            <button class="add-btn" onclick="batchShiftSelection(0,1,0)">Y+1</button>
            <button class="add-btn" onclick="batchShiftSelection(0,-1,0)">Y-1</button>
        </div>
        <div class="prop-row">
            <button class="add-btn" onclick="batchShiftSelection(0,0,1)">Z+1</button>
            <button class="add-btn" onclick="batchShiftSelection(0,0,-1)">Z-1</button>
        </div>
        <div class="prop-row">
            <label for="selOriginX">原点（左上角）</label>
            <input type="number" id="selOriginX" placeholder="X" style="width:50px;">
            <input type="number" id="selOriginY" placeholder="Y" style="width:50px;">
            <input type="number" id="selOriginZ" placeholder="Z" style="width:50px;">
            <button class="add-btn" onclick="batchMoveSelectionOrigin()">移动</button>
        </div>
    `;

    if (uniform === 'static') {
        html += `
            <div class="prop-row">
                <button class="add-btn" onclick="batchSetStaticRGB(255,255,255)">静态→白</button>
                <button class="add-btn" onclick="batchSetStaticRGB(255,255,128)">静态→底</button>
            </div>
            <div class="prop-row">
                <button class="add-btn" onclick="batchSetStaticRGB(240,255,255)">→发光移动</button>
                <button class="add-btn" onclick="batchSetStaticRGB(180,255,255)">→移动</button>
                <button class="add-btn" onclick="batchSetStaticRGB(50,255,255)">→无碰撞</button>
            </div>
        `;
    } else if (uniform) {
        html += renderBatchPropsForType(uniform);
    }

    // ---- 复制粘贴（与 QuickFill 结合） ----
    const clipInfo = (window.QuickFill && window.QuickFill.getClipboardInfo)
        ? window.QuickFill.getClipboardInfo()
        : null;
    const clipText = clipInfo
        ? `${clipInfo.blocks} 方块 + ${clipInfo.elements} 元素`
        : '空';
    const ow = (window.QuickFill && window.QuickFill.getOverwrite)
        ? window.QuickFill.getOverwrite()
        : false;

    html += `
        <div class="sub-elem-section">
            <div class="sub-title">复制 / 粘贴</div>
            <div class="prop-row">
                <!-- 统一换成 btn-sm，去掉 add-btn -->
                <button class="btn-sm" onclick="batchCopyToClipboard()">📄 复制选区</button>
            </div>
            <div class="prop-row">
                <label for="batchPasteX">粘贴到</label>
                <input type="number" id="batchPasteX" placeholder="X" style="width:50px;">
                <input type="number" id="batchPasteY" placeholder="Y" style="width:50px;">
                <input type="number" id="batchPasteZ" placeholder="Z" style="width:50px;">
                <button class="btn-sm" onclick="batchPasteAtInput()">📥 粘贴</button>
            </div>
            <!-- 颜色改为 var(--text-dim) 适配深浅主题 -->
            <label style="display:block;margin:8px 0 4px 0;color:var(--text-dim);font-size:12px;">
                <input type="checkbox" id="batchPasteOverwrite"
                    onchange="window.QuickFill && window.QuickFill.setOverwrite && window.QuickFill.setOverwrite(this.checked)"
                    ${ow ? 'checked' : ''}>
                覆盖目标位置原有元素（勾选=替换，不勾=直接添加）
            </label>
            <div style="font-size:11px;color:var(--text-dim);margin-top:4px;" id="batchClipInfo">剪贴板：${clipText}</div>
        </div>
    `;

    html += `
        <div class="prop-row" style="margin-top:12px; gap:8px;">
            <!-- 换成标准的危险按钮类 btn-danger，会自动变成红字红边框，悬停变红底白字 -->
            <button class="btn-sm btn-danger" onclick="batchDeleteSelection()">删除选中</button>
            <button class="btn-sm" onclick="clearMultiSelection()">取消选择</button>
        </div>
    `;
    
    // 初始化"原点"输入框为当前选区左上角
    (function initOriginInputs(html) {
        // 这里用 setTimeout 是因为要等 pc.innerHTML 生效后才能 getElementById
        setTimeout(() => {
            const b = getSelectionBounds();
            if (!b) return;
            const ix = document.getElementById('selOriginX');
            const iy = document.getElementById('selOriginY');
            const iz = document.getElementById('selOriginZ');
            if (ix) ix.value = b.minX;
            if (iy) iy.value = b.minY;
            if (iz) iz.value = b.minZ;
        }, 0);
    })();

    pc.innerHTML = html;
    // 更新剪贴板状态
    const info = document.getElementById('batchClipInfo');
    if (info && window.QuickFill && window.QuickFill.getClipboardInfo) {
        const c = window.QuickFill.getClipboardInfo();
        info.textContent = c ? `剪贴板：${c.blocks} 方块 + ${c.elements} 元素` : '剪贴板：空';
    }
}

function renderBatchPropsForType(type) {
    const defs = {
        moving: [
            { key: 'autoStart', label: '自动启动', type: 'bool' },
            { key: 'loopStartIndex', label: '循环索引', type: 'int' },
            { key: 'fullBlock', label: '完整方块', type: 'bool' },
        ],
        falling: [
            { key: 'floatTime', label: '掉落延迟', type: 'int' },
        ],
        prism: [
            { key: 'energy', label: 'Energy', type: 'int' },
        ],
        resizer: [
            { key: 'visible', label: '可见', type: 'bool' },
            { key: 'radiusX', label: '半径X', type: 'int' },
            { key: 'radiusY', label: '半径Y', type: 'int' },
        ],
        bumper: [
            { key: 'enabled', label: '启用', type: 'bool' },
        ],
        checkpoint: [
            { key: 'respawnZ', label: '重生Z', type: 'int' },
            { key: 'radiusX', label: '半径X', type: 'int' },
            { key: 'radiusY', label: '半径Y', type: 'int' },
        ],
        cameratrigger: [
            { key: 'zoom', label: '缩放', type: 'int' },
            { key: 'startDelay', label: '起始延迟', type: 'int' },
            { key: 'duration', label: '持续', type: 'int' },
            { key: 'singleUse', label: '单次', type: 'bool' },
        ],
        button: [
            { key: 'visible', label: '可见', type: 'tri' },
            { key: 'disableCount', label: '禁用次数', type: 'int' },
            { key: 'mode', label: '模式', type: 'select', options: ['StayDown', 'StayUp', 'Toggle'] },
        ],
        othercube: [
            { key: 'mode', label: '模式', type: 'select', options: ['AutoHide', 'MoveAway', 'Hole'] },
            { key: 'radiusX', label: '半径X', type: 'int' },
            { key: 'radiusY', label: '半径Y', type: 'int' },
        ],
        darkcube: [
            { key: 'radiusX', label: '半径X', type: 'int' },
            { key: 'radiusY', label: '半径Y', type: 'int' },
        ],
    };
    const props = defs[type];
    if (!props || !props.length) return '';

    let html = `<div class="sub-elem-section"><div class="sub-title">批量修改属性（${type}）</div>`;
    props.forEach(p => {
        html += `<div class="prop-row"><label for="">${p.label}</label>`;
        if (p.type === 'bool') {
            html += `<select name="select" onchange="if(this.value!=='') batchSetProp('${type}','${p.key}',this.value==='true')">
                <option value="">不变</option>
                <option value="true">是</option>
                <option value="false">否</option>
            </select>`;
        } else if (p.type === 'int') {
            html += `<input name="input" type="number" placeholder="留空不变"
                onchange="if(this.value!=='') batchSetProp('${type}','${p.key}',parseInt(this.value))">`;
        } else if (p.type === 'tri') {
            html += `<select onchange="if(this.value!=='') batchSetProp('${type}','${p.key}', this.value==='__nul' ? null : (this.value==='true'))">
                <option value="">不变</option>
                <option value="__nul">半透明</option>
                <option value="true">是</option>
                <option value="false">否</option>
            </select>`;
        } else if (p.type === 'select') {
            html += `<select onchange="if(this.value!=='') batchSetProp('${type}','${p.key}',this.value)">
                <option value="">不变</option>
                ${p.options.map(o => `<option value="${o}">${o}</option>`).join('')}
            </select>`;
        }
        html += `</div>`;
    });
    html += '</div>';
    return html;
}

window.batchSetProp = function (type, key, value) {
    let n = 0;
    state.multiSelection.forEach(it => {
        if (it.type !== type) return;
        const elem = findElementByTypeAndId(type, it.id);
        if (!elem) return;
        elem[key] = value;
        n++;
    });
    uniInterface();
    requestRender();
    updatePanel();
    updateElemList();
    showToast(`已修改 ${n} 个元素的 ${key}`);
};

function findElementByTypeAndId(type, id) {
    const map = {
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
    };
    return (map[type] || []).find(e => e.id === id);
}

// ---------- 批量操作 API ----------
window.batchDeleteSelection = function () {
    const realCount = state.multiSelection.filter(it => it.type !== 'empty').length;
    if (!realCount) { showToast('没有可删除的元素（选区内只有空格）'); return; }
    if (!confirm(`确定删除 ${realCount} 个元素？`)) return;

    // ★ 关键：整个批量操作只记一次 undo
    const beforeSnap = _serializeHistory();
    const prevSuppressUI = state._suppressUI;
    const prevSuppressUndo = state._suppressUndo;
    state._suppressUI = true;
    state._suppressUndo = true;

    try {
        const list = state.multiSelection.slice();
        list.forEach(it => {
            if (it.type === 'static') {
                const c = it.coord;
                const l = state.staticBlocks[c.z];
                if (l && l[c.y]) l[c.y][c.x] = null;
            } else if (it.type === 'empty') {
                // 空坐标无需删除
            } else {
                deleteElement(it.type, it.id);   // 内部多次 saveCache/uniInterface，都被 suppress 拦下
            }
        });
    } finally {
        state._suppressUI = prevSuppressUI;
        state._suppressUndo = prevSuppressUndo;
    }

    // 手动一次性 push undo
    const afterSnap = _serializeHistory();
    if (beforeSnap !== afterSnap) {
        state._undoStack = state._undoStack || [];
        state._redoStack = state._redoStack || [];
        state._undoStack.push(beforeSnap);
        while (state._undoStack.length > 50) state._undoStack.shift();
        state._redoStack.length = 0;
    }
    state._lastSavedSnapshot = _serializeHistory();

    state.multiSelection = [];
    rebuildSpatialIndex();
    requestRender();
    updatePanel();
    updateElemList();
    updateStatus();
    uniInterface();
    showToast(`已删除 ${realCount} 个元素`);
};

window.batchShiftSelection = function (dx, dy, dz) {
    if (!state.multiSelection.length) return;

    const beforeSnap = _serializeHistory();
    const prevSuppressUI = state._suppressUI;
    const prevSuppressUndo = state._suppressUndo;
    state._suppressUI = true;
    state._suppressUndo = true;

    const { w, l, h } = state.level.size;
    let newSel = [];
    try {
        state.multiSelection.forEach(it => {
            if (it.type === 'static') {
                const c = it.coord;
                const nz = c.z + dz, ny = c.y + dy, nx = c.x + dx;
                if (nx < 0 || nx >= w || ny < 0 || ny >= l || nz < 0 || nz >= h) {
                    newSel.push(it);   // 越界保持原样
                    return;
                }
                const srcLayer = state.staticBlocks[c.z];
                const block = srcLayer && srcLayer[c.y] && srcLayer[c.y][c.x];
                if (!block) { newSel.push(it); return; }
                srcLayer[c.y][c.x] = null;
                const dstLayer = state.staticBlocks[nz];
                if (dstLayer && dstLayer[ny]) dstLayer[ny][nx] = block;
                newSel.push({ type: 'static', coord: { x: nx, y: ny, z: nz } });
            } else {
                // 各类元素的坐标平移
                const p = getElementCoord(it.type, it.id);
                if (!p) { newSel.push(it); return; }
                const nx = p.x + dx, ny = p.y + dy, nz = p.z + dz;
                switch (it.type) {
                    case 'moving': {
                        const m = state.movingPlatforms.find(x => x.id === it.id);
                        if (m && m.waypoints) {
                            m.waypoints.forEach(wp => { wp.x += dx; wp.y += dy; wp.z += dz; });
                        }
                        break;
                    }
                    case 'falling': case 'prism': case 'bumper':
                    case 'checkpoint': case 'cameratrigger': case 'button': {
                        const arr = ({
                            falling: state.fallingPlatforms, prism: state.prisms,
                            bumper: state.bumpers, checkpoint: state.checkpoints,
                            cameratrigger: state.cameraTriggers, button: state.buttons
                        })[it.type];
                        const el = arr && arr.find(x => x.id === it.id);
                        if (el) { el.x = nx; el.y = ny; el.z = nz; }
                        break;
                    }
                    case 'resizer': {
                        const el = state.resizers.find(x => x.id === it.id);
                        if (el) { el.x = nx; el.y = ny; el.z = nz; }
                        break;
                    }
                    case 'othercube': {
                        const el = state.otherCubes.find(x => x.id === it.id);
                        if (el) { el.triggerX += dx; el.triggerY += dy; el.triggerZ += dz; }
                        break;
                    }
                    case 'darkcube': {
                        const el = state.darkCubes.find(x => x.id === it.id);
                        if (el) { el.triggerX += dx; el.triggerY += dy; el.triggerZ += dz; }
                        break;
                    }
                }
                newSel.push(it);
            }
        });
    } finally {
        state._suppressUI = prevSuppressUI;
        state._suppressUndo = prevSuppressUndo;
    }

    const afterSnap = _serializeHistory();
    if (beforeSnap !== afterSnap) {
        state._undoStack = state._undoStack || [];
        state._redoStack = state._redoStack || [];
        state._undoStack.push(beforeSnap);
        while (state._undoStack.length > 50) state._undoStack.shift();
        state._redoStack.length = 0;
    }
    state._lastSavedSnapshot = _serializeHistory();

    state.multiSelection = newSel;
    rebuildSpatialIndex();
    updateCanvasRangeFromSize();
    requestRender();
    showSelectionPanel();
    updateElemList();
    uniInterface();
};

window.batchMoveSelectionOrigin = function () {
    const b = getSelectionBounds();
    if (!b) { showToast('请先选中至少一个元素'); return; }

    const ix = document.getElementById('selOriginX');
    const iy = document.getElementById('selOriginY');
    const iz = document.getElementById('selOriginZ');
    const tx = parseInt(ix.value);
    const ty = parseInt(iy.value);
    const tz = parseInt(iz.value);
    if (isNaN(tx) || isNaN(ty) || isNaN(tz)) {
        showToast('请填写完整的 X/Y/Z');
        return;
    }

    const dx = tx - b.minX;
    const dy = ty - b.minY;
    const dz = tz - b.minZ;
    if (dx === 0 && dy === 0 && dz === 0) {
        showToast('原点已在目标位置');
        return;
    }

    // 走一次 batchShiftSelection，它会重算 newSel 并刷新 showSelectionPanel
    // 但问题是：多选面板会被 showSelectionPanel 重建，输入框会重设为新的左上角。
    // 所以这里偏移后，输入框自动变成目标值，用户可继续操作。
    window.batchShiftSelection(dx, dy, dz);
};

window.batchSetStaticRGB = function (r, g, b) {
    let n = 0;
    state.multiSelection.forEach(it => {
        if (it.type !== 'static') return;
        const c = it.coord;
        const l = state.staticBlocks[c.z];
        if (l && l[c.y] && l[c.y][c.x]) {
            l[c.y][c.x] = { r, g, b };
            n++;
        }
    });
    requestRender();
    updateStatus();
    uniInterface();
    showToast(`已修改 ${n} 个静态方块颜色`);
};

window.clearMultiSelection = function () {
    state.multiSelection = [];
    state._lastSelectionBox = null;
    requestRender();
    updatePanel();
};

// ---------- 复制 / 粘贴入口 ----------

// 计算多选选区的边界
function getSelectionBounds() {
    // ★ 优先用"最近一次框选的矩形"
    if (state._lastSelectionBox) return state._lastSelectionBox;

    // 保底：从 multiSelection 算
    if (!state.multiSelection.length) return null;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    state.multiSelection.forEach(it => {
        let p = null;
        if (it.coord) p = it.coord;
        else if (typeof getElementCoord === 'function') p = getElementCoord(it.type, it.id);
        if (!p) return;
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    });
    if (!isFinite(minX)) return null;
    return { minX, minY, minZ, maxX, maxY, maxZ };
}

// ★ 用选区左上角作为粘贴目标
window.batchSetPasteTargetFromSelection = function () {
    const b = getSelectionBounds();
    if (!b) { showToast('请先选中至少一个元素'); return; }
    if (!window.QuickFill || !window.QuickFill.setPasteCoord) {
        showToast('QuickFill 未加载'); return;
    }
    window.QuickFill.setPasteCoord(b.minX, b.minY, b.minZ);
    // 顺便把坐标回填到面板输入框，便于用户微调
    const ix = document.getElementById('batchPasteX');
    const iy = document.getElementById('batchPasteY');
    const iz = document.getElementById('batchPasteZ');
    if (ix) ix.value = b.minX;
    if (iy) iy.value = b.minY;
    if (iz) iz.value = b.minZ;
    showToast(`粘贴目标已设为 (${b.minX},${b.minY},${b.minZ})`);
};

// 复制选区到剪贴板
window.batchCopyToClipboard = function () {
    if (!state.multiSelection.length) { showToast('未选中任何元素'); return; }
    if (!window.QuickFill || !window.QuickFill.setCopyBox || !window.QuickFill.doCopy) {
        showToast('QuickFill 未加载'); return;
    }
    const b = getSelectionBounds();
    if (!b) { showToast('无法计算包围盒'); return; }

    window.QuickFill.setCopyBox(b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ);
    window.QuickFill.doCopy();

    /*//复制后清空框选与输入框，防止误粘回原位
    state._lastSelectionBox = null;
    state.multiSelection = [];*/

    const ix = document.getElementById('batchPasteX');
    const iy = document.getElementById('batchPasteY');
    const iz = document.getElementById('batchPasteZ');
    if (ix) ix.value = '';
    if (iy) iy.value = '';
    if (iz) iz.value = '';

    // 清掉 quickfill 里的 pasteCoord，防止用旧值
    if (window.QuickFill.setPasteCoord) {
        window.QuickFill.setPasteCoord(0, 0, 0);   // 会被下一步覆盖
    }

    requestRender();
    showSelectionPanel();
    showToast('已复制。请框选目标区域后点「📥 粘贴」');
};

// 从输入框读目标坐标并粘贴
window.batchPasteAtInput = function () {
    if (!window.QuickFill || !window.QuickFill.setPasteCoord || !window.QuickFill.doPaste) {
        showToast('QuickFill 未加载'); return;
    }

    const xEl = document.getElementById('batchPasteX');
    const yEl = document.getElementById('batchPasteY');
    const zEl = document.getElementById('batchPasteZ');

    // ★ 优先输入框（applySelectionFromBox 会同步进去）
    let x = parseInt(xEl?.value);
    let y = parseInt(yEl?.value);
    let z = parseInt(zEl?.value);
    let source = '输入框';

    if (isNaN(x) || isNaN(y) || isNaN(z)) {
        // 回退到最近框选（且必须与当前层一致）
        const b = state._lastSelectionBox;
        if (b && b.minZ === state.currentLayer) {
            x = b.minX; y = b.minY; z = b.minZ;
            source = '框选';
            if (xEl) xEl.value = x;
            if (yEl) yEl.value = y;
            if (zEl) zEl.value = z;
        } else {
            showToast('请先在当前层框选目标区域，或手动填写 X/Y/Z');
            return;
        }
    }

    window.QuickFill.setPasteCoord(x, y, z);
    showToast(`粘贴目标 (${x},${y},${z}) [${source}]`);
    window.QuickFill.doPaste();
    showSelectionPanel();
};