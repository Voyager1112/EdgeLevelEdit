// 全局变量
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

    state.multiSelection = [];
    const seen = new Set();
    const layer = state.staticBlocks[z];

    const includeEmpty = !!(document.getElementById('msIncludeEmpty')?.checked);

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
    showToast(`已选中 ${state.multiSelection.length} 个元素`);
}

// ---------- 批量编辑面板 ----------
function showSelectionPanel() {
    const pc = document.getElementById('panelContent');
    if (!pc) return;
    const n = state.multiSelection.length;
    if (n === 0) {
        pc.innerHTML = '<div class="empty-msg">未选中任何元素</div>';
        return;
    }

    const types = new Set(state.multiSelection.map(it => it.type));
    const uniform = types.size === 1 ? [...types][0] : null;

    const counts = {};
    state.multiSelection.forEach(it => { counts[it.type] = (counts[it.type] || 0) + 1; });
    const summary = Object.entries(counts).map(([t, c]) => `${t}:${c}`).join(' · ');

    let html = `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
            <span class="color-dot" style="background:#ffd700;"></span>
            <strong>多选：${n} 个</strong>
        </div>
        <div style="font-size:11px; color:#8aaccc; margin-bottom:8px;">${summary}</div>

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
    html += `
        <div class="sub-elem-section">
            <div class="sub-title">复制 / 粘贴</div>
            <div class="prop-row">
                <button class="add-btn" onclick="batchCopyToClipboard()">📄 复制选区</button>
            </div>
            <div class="prop-row">
                <label>粘贴到</label>
                <input type="number" id="batchPasteX" placeholder="X" style="width:50px;">
                <input type="number" id="batchPasteY" placeholder="Y" style="width:50px;">
                <input type="number" id="batchPasteZ" placeholder="Z" style="width:50px;">
                <button class="add-btn" onclick="batchPasteAtInput()">📥 粘贴</button>
            </div>
            <div style="font-size:11px;color:#8aaccc;" id="batchClipInfo">剪贴板：空</div>
        </div>
    `;

    html += `
        <div class="prop-row" style="margin-top:10px;">
            <button class="add-btn" style="background:#a03030;" onclick="batchDeleteSelection()">删除选中</button>
            <button class="add-btn" onclick="clearMultiSelection()">取消选择</button>
        </div>
    `;

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
        html += `<div class="prop-row"><label>${p.label}</label>`;
        if (p.type === 'bool') {
            html += `<select onchange="if(this.value!=='') batchSetProp('${type}','${p.key}',this.value==='true')">
                <option value="">不变</option>
                <option value="true">是</option>
                <option value="false">否</option>
            </select>`;
        } else if (p.type === 'int') {
            html += `<input type="number" placeholder="留空不变"
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
    const n = state.multiSelection.length;
    if (!n) return;
    if (!confirm(`确定删除 ${n} 个元素？`)) return;

    state.multiSelection.forEach(it => {
        if (it.type === 'static') {
            const c = it.coord;
            const l = state.staticBlocks[c.z];
            if (l && l[c.y]) l[c.y][c.x] = null;
        } else {
            deleteElement(it.type, it.id);
        }
    });
    state.multiSelection = [];
    rebuildSpatialIndex();
    requestRender();
    updatePanel();
    updateElemList();
    updateStatus();
    saveCache();
    showToast(`已删除 ${n} 个元素`);
};

window.batchShiftSelection = function (dx, dy, dz) {
    if (!state.multiSelection.length) return;
    const { w, l, h } = state.level.size;
    const newSel = [];

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

    state.multiSelection = newSel;
    rebuildSpatialIndex();
    updateCanvasRangeFromSize();
    requestRender();
    updatePanel();
    updateElemList();
    saveCache();
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
    saveCache();
    showToast(`已修改 ${n} 个静态方块颜色`);
};

window.clearMultiSelection = function () {
    state.multiSelection = [];
    requestRender();
    updatePanel();
};