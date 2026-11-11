// 使用 requestAnimationFrame 节流渲染
function requestRender() {
    if (state._suppressUI) return;
	if (!renderRequested) {
		renderRequested = true;
		requestAnimationFrame(() => {
			renderRequested = false;
			renderGrid();
			// 如果3D可见，刷新3D
			if (threeRenderer && document.getElementById('view3dContainer').classList.contains('active')) {
				render3D();
			}
		});
	}
}
function getCSSVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// 渲染网格
let _minX = 0, _minY = 0;
let _canvasScale = 1; 
let _logicalW = 0;
let _logicalH = 0;

function renderGrid() {
    const z = state.currentLayer;
    const { w, l, h } = state.level.size;
    ctx.imageSmoothingEnabled = false;
    
    // 1. 获取真实全局范围
    let realMinX = state.canvasRange.minX;
    let realMaxX = state.canvasRange.maxX;
    let realMinY = state.canvasRange.minY;
    let realMaxY = state.canvasRange.maxY;
    
    if (realMinX > 0) realMinX = 0;
    if (realMaxX < w - 1) realMaxX = w - 1;
    if (realMinY > 0) realMinY = 0;
    if (realMaxY < l - 1) realMaxY = l - 1;
    if (realMinX === Infinity) { realMinX = 0; realMaxX = w - 1; }
    if (realMinY === Infinity) { realMinY = 0; realMaxY = l - 1; }

    const totalW = realMaxX - realMinX + 1;
    const totalH = realMaxY - realMinY + 1;
    const threshold = state.settings.chunkThreshold || 500;
    const chunkSize = state.settings.chunkSize || 100;

    let minX = realMinX, maxX = realMaxX;
    let minY = realMinY, maxY = realMaxY;

    // ★ 核心：判断是否启用分块
    if (totalW > threshold || totalH > threshold) {
        let cMinX = state.currentChunk.x * chunkSize;
        let cMaxX = cMinX + chunkSize - 1;
        let cMinY = state.currentChunk.y * chunkSize;
        let cMaxY = cMinY + chunkSize - 1;

        // 限制不超出真实范围
        minX = Math.max(realMinX, cMinX);
        maxX = Math.min(realMaxX, cMaxX);
        minY = Math.max(realMinY, cMinY);
        maxY = Math.min(realMaxY, cMaxY);
    }

    // 如果计算后无交集（区块在空处），给个默认值防报错
    if (minX > maxX) { minX = realMinX; maxX = realMinX + chunkSize - 1; }
    if (minY > maxY) { minY = realMinY; maxY = realMinY + chunkSize - 1; }

    const gridW = maxX - minX + 1;
    const gridH = maxY - minY + 1;
    if (gridW < 1 || gridH < 1) return;
    
    _currentGridW = gridW;
    _currentGridH = gridH;
    
    // 自动校正层范围
    let minZ = state.canvasRange.minZ;
    let maxZ = state.canvasRange.maxZ;
    if (z < minZ) { state.currentLayer = minZ; layerInput.value = minZ; return; }
    if (z > maxZ) { state.currentLayer = maxZ; layerInput.value = maxZ; return; }

    _minX = minX;
    _minY = minY;
    currentMinX = minX;
    currentMinY = minY;

    // 2. 计算尺寸
    const pixelSize = PIXEL_SIZE;
    const padding = PADDING;
    const targetWidth = gridW * pixelSize + padding * 2;
    const targetHeight = gridH * pixelSize + padding * 2;
    
    const MAX_CANVAS_DIM = 15000; 
    _canvasScale = 1;
    if (targetWidth > MAX_CANVAS_DIM || targetHeight > MAX_CANVAS_DIM) {
        _canvasScale = Math.min(MAX_CANVAS_DIM / targetWidth, MAX_CANVAS_DIM / targetHeight);
    }
    _logicalW = targetWidth;
    _logicalH = targetHeight;

    canvas.width = Math.floor(targetWidth * _canvasScale);
    canvas.height = Math.floor(targetHeight * _canvasScale);
    canvas.style.width = (targetWidth * state.zoom) + 'px';
    canvas.style.height = (targetHeight * state.zoom) + 'px';

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(_canvasScale, _canvasScale);

    // 4. 绘制背景和网格
    const cssBorder = getCSSVar('--border-strong') || '#bcbcbc';
    ctx.fillStyle = '#0a0a1a'; 
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    
    const cssBgGrid = getCSSVar('--bg-grid') || '#c9c9c9';
    ctx.strokeStyle = cssBgGrid;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= gridW; i++) {
        ctx.beginPath(); ctx.moveTo(padding + i * pixelSize, padding); ctx.lineTo(padding + i * pixelSize, targetHeight - padding); ctx.stroke();
    }
    for (let i = 0; i <= gridH; i++) {
        ctx.beginPath(); ctx.moveTo(padding, padding + i * pixelSize); ctx.lineTo(targetWidth - padding, padding + i * pixelSize); ctx.stroke();
    }

    // 5. 收集半径元素（仅绘制在视野内的）
    const radiusElements = [];
    function addRadiusElement(elem, type, x, y, rx, ry) {
        if (rx > 0 || ry > 0) {
            if (x + rx < minX || x - rx > maxX || y + ry < minY || y - ry > maxY) return; // 剔除视野外
            let color = 'rgba(255,255,255,0.3)';
            if (type === 'checkpoint') color = 'rgba(68,255,68,0.4)';
            else if (type === 'cameratrigger') color = 'rgba(170,68,255,0.4)';
            else if (type === 'resizer') color = elem.type === 'grow' ? 'rgba(136,255,136,0.4)' : 'rgba(136,170,136,0.4)';
            else if (type === 'othercube_trigger' || type === 'darkcube_trigger') color = 'rgba(255,200,100,0.3)';
            radiusElements.push({ x, y, rx, ry, color });
        }
    }
    state.checkpoints.forEach(c => { if (state.visibility.checkpoint && c.z === z) addRadiusElement(c, 'checkpoint', c.x, c.y, c.radiusX, c.radiusY); });
    state.cameraTriggers.forEach(c => { if (state.visibility.cameratrigger && c.z === z) addRadiusElement(c, 'cameratrigger', c.x, c.y, c.radiusX, c.radiusY); });
    state.resizers.forEach(r => { if (state.visibility.resizer && r.z === z) addRadiusElement(r, 'resizer', r.x, r.y, r.radiusX, r.radiusY); });
    state.otherCubes.forEach(oc => { if (state.visibility.othercube && oc.triggerZ === z) addRadiusElement(oc, 'othercube_trigger', oc.triggerX, oc.triggerY, oc.radiusX, oc.radiusY); });
    state.darkCubes.forEach(dc => { if (state.visibility.darkcube && dc.triggerZ === z) addRadiusElement(dc, 'darkcube_trigger', dc.triggerX, dc.triggerY, dc.radiusX, dc.radiusY); });

    // 6. 绘制格子
    for (let gridY = 0; gridY < gridH; gridY++) {
        for (let gridX = 0; gridX < gridW; gridX++) {
            const realX = minX + gridX;
            const realY = minY + gridY;
            const px = padding + gridX * pixelSize;
            const py = padding + gridY * pixelSize;
            drawPixel(ctx, realX, realY, z, px, py, pixelSize);
        }
    }

    // 7. 绘制网格线
	ctx.save();
	ctx.strokeStyle = cssBgGrid;
	ctx.lineWidth = 0.8;
	for (let i = 0; i <= gridW; i++) {
		ctx.beginPath(); ctx.moveTo(padding + i * pixelSize, padding); ctx.lineTo(padding + i * pixelSize, targetHeight - padding); ctx.stroke();
	}
	for (let i = 0; i <= gridH; i++) {
		ctx.beginPath(); ctx.moveTo(padding, padding + i * pixelSize); ctx.lineTo(targetWidth - padding, padding + i * pixelSize); ctx.stroke();
	}
	ctx.strokeStyle = cssBorder;
	ctx.lineWidth = 1.5;
	ctx.strokeRect(padding, padding, gridW * pixelSize, gridH * pixelSize);
	ctx.restore();
    
    // 绘制半径虚线
    if (radiusElements.length > 0) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 2;
        radiusElements.forEach(e => {
            const cx = padding + (e.x - minX) * pixelSize + pixelSize / 2;
            const cy = padding + (e.y - minY) * pixelSize + pixelSize / 2;
            const rx = (e.rx * 2 + 1) * pixelSize / 2;
            const ry = (e.ry * 2 + 1) * pixelSize / 2;
            ctx.strokeStyle = e.color;
            ctx.strokeRect(cx - rx, cy - ry, rx * 2, ry * 2);
        });
        ctx.restore();
    }

    document.getElementById('gridInfo').textContent = `Z=${z} | 范围 X: ${minX}~${maxX}, Y: ${minY}~${maxY}`;
	
    // ===== 选框 =====
    if (typeof _selBox !== 'undefined' && _selBox) {
        const x0 = Math.max(minX, Math.min(_selBox.x0, _selBox.x1));
        const x1 = Math.min(maxX, Math.max(_selBox.x0, _selBox.x1));
        const y0 = Math.max(minY, Math.min(_selBox.y0, _selBox.y1));
        const y1 = Math.min(maxY, Math.max(_selBox.y0, _selBox.y1));
        if (x0 <= x1 && y0 <= y1) {
            ctx.save();
            ctx.strokeStyle = '#4fc3f7';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            const rx = padding + (x0 - minX) * pixelSize;
            const ry = padding + (y0 - minY) * pixelSize;
            const rw = (x1 - x0 + 1) * pixelSize;
            const rh = (y1 - y0 + 1) * pixelSize;
            ctx.fillStyle = 'rgba(79,195,247,0.15)';
            ctx.fillRect(rx, ry, rw, rh);
            ctx.strokeRect(rx, ry, rw, rh);
            ctx.restore();
        }
    }
    
    // ===== 多选包围框 =====
    if (typeof getSelectionBounds === 'function' && state.multiSelection && state.multiSelection.length > 0) {
        const b = getSelectionBounds();
        if (b && b.minZ === b.maxZ && b.minZ === z) {
            const rx = padding + (b.minX - minX) * pixelSize;
            const ry = padding + (b.minY - minY) * pixelSize;
            const rw = (b.maxX - b.minX + 1) * pixelSize;
            const rh = (b.maxY - b.minY + 1) * pixelSize;
            ctx.save();
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 4]);
            ctx.strokeRect(rx, ry, rw, rh);
            ctx.restore();
        }
    }

    // ===== 多选高亮 =====
    if (state.multiSelection && state.multiSelection.length) {
        state.multiSelection.forEach(it => {
            let sx, sy, sz;
            if (it.type === 'static') {
                sx = it.coord.x; sy = it.coord.y; sz = it.coord.z;
            } else if (typeof getElementCoord === 'function') {
                const p = getElementCoord(it.type, it.id);
                if (!p) return;
                sx = p.x; sy = p.y; sz = p.z;
            } else return;
            if (sz !== z) return;
            if (sx < minX || sx > maxX || sy < minY || sy > maxY) return;
            const px = padding + (sx - minX) * pixelSize;
            const py = padding + (sy - minY) * pixelSize;
            ctx.save();
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 2;
            ctx.strokeRect(px + 1, py + 1, pixelSize - 2, pixelSize - 2);
            ctx.restore();
        });
    }
    
    ctx.restore();
    updateStatus();
    if (typeof renderMiniMap === 'function') renderMiniMap(); // 调用小地图
}

// ==================== 新增：小地图渲染 ====================
function renderMiniMap() {
    const cvs = document.getElementById('miniMapCanvas');
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    const W = cvs.width, H = cvs.height;
    ctx.clearRect(0, 0, W, H);
    
    const range = state.canvasRange;
    const globalW = Math.max(1, range.maxX - range.minX + 1);
    const globalH = Math.max(1, range.maxY - range.minY + 1);
    
    // ★ 获取缩放和平移参数
    const zoom = state.settings.miniMapZoom || 1;
    const panX = state.settings.miniMapPanX || 0;
    const panY = state.settings.miniMapPanY || 0;
    
    // ★ 计算缩放并加上平移偏移
    const scale = Math.min(W / globalW, H / globalH) * zoom;
    const offsetX = (W - globalW * scale) / 2 + panX;
    const offsetY = (H - globalH * scale) / 2 + panY;

    // 绘制所有方块缩略图 (白色)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    for (let z in state.staticBlocks) {
        const layer = state.staticBlocks[z];
        if (!layer) continue;
        for (let y = 0; y < layer.length; y++) {
            for (let x = 0; x < layer[y].length; x++) {
                if (layer[y][x]) {
                    const px = offsetX + (x - range.minX) * scale;
                    const py = offsetY + (y - range.minY) * scale;
                    ctx.fillRect(px, py, Math.max(1, scale), Math.max(1, scale));
                }
            }
        }
    }

    // 绘制所有元素缩略图 (橙色)
    ctx.fillStyle = '#ffaa44';
    state.spatialIndex.forEach((entries, key) => {
        if (entries.some(e => e.type !== 'waypoint')) {
            const [x, y] = key.split(',').map(Number);
            const px = offsetX + (x - range.minX) * scale;
            const py = offsetY + (y - range.minY) * scale;
            ctx.fillRect(px, py, Math.max(2, scale), Math.max(2, scale));
        }
    });

    // 绘制当前区块红框
    const totalW = range.maxX - range.minX + 1;
    const totalH = range.maxY - range.minY + 1;
    const threshold = state.settings.chunkThreshold || 500;
    
    if (totalW > threshold || totalH > threshold) {
        const chunkSize = state.settings.chunkSize || 100;
        const cMinX = state.currentChunk.x * chunkSize;
        const cMinY = state.currentChunk.y * chunkSize;

        let drawMinX = Math.max(range.minX, cMinX);
        let drawMaxX = Math.min(range.maxX, cMinX + chunkSize - 1);
        let drawMinY = Math.max(range.minY, cMinY);
        let drawMaxY = Math.min(range.maxY, cMinY + chunkSize - 1);

        if (drawMinX <= drawMaxX && drawMinY <= drawMaxY) {
            const cx = offsetX + (drawMinX - range.minX) * scale;
            const cy = offsetY + (drawMinY - range.minY) * scale;
            const cw = (drawMaxX - drawMinX + 1) * scale;
            const ch = (drawMaxY - drawMinY + 1) * scale;

            // 稍微加一点半透明红色填充
            ctx.fillStyle = 'rgba(255, 77, 79, 0.3)';
            ctx.fillRect(cx, cy, cw, ch);

            ctx.strokeStyle = '#ff4d4f';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(cx, cy, cw, ch);
        }
    }
}

// ==================== 绘制单个格子 ====================
function drawPixel(ctx, x, y, z, px, py, size) {
    const { w, l, h } = state.level.size;

    // --- 静态方块 ---
    let staticBlock = null;
    if (x >= 0 && x < w && y >= 0 && y < l) {
        const layer = state.staticBlocks[z];
        if (layer && layer[y] && layer[y][x]) staticBlock = layer[y][x];
    }
    
    if (staticBlock && state.visibility.static) {
        const color = `rgb(${staticBlock.r},${staticBlock.g},${staticBlock.b})`;
        ctx.fillStyle = color;
        ctx.fillRect(px, py, size, size);
        let modeText = '';
        if (staticBlock.r === 255) modeText = 'B';
        else if (staticBlock.r >= 224) modeText = 'GM';
        else if (staticBlock.r >= 192) modeText = 'GH';
        else if (staticBlock.r >= 160) modeText = 'M';
        else if (staticBlock.r >= 128) modeText = 'H';
        else modeText = 'N';
        ctx.fillStyle = '#000';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(modeText, px + size/2, py + size/2);
    } else {
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(px, py, size, size);
    }

	// --- 出生/终点 ---
	const spawn = state.level.spawn;
	const exit = state.level.exit;
	if (spawn && spawn.z === z && spawn.x === x && spawn.y === y && state.visibility.spawn) {
		ctx.fillStyle = '#44dd88';
		ctx.font = 'bold 12px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('S', px + size/2, py + size/2);
		ctx.save(); ctx.strokeStyle = '#44dd88'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.strokeRect(px + 2, py + 2, size - 4, size - 4); ctx.restore();
	}
	if (exit && exit.z === z && exit.x === x && exit.y === y && state.visibility.exit) {
		ctx.fillStyle = '#dd4444';
		ctx.font = 'bold 12px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('E', px + size/2, py + size/2);
		ctx.save(); ctx.strokeStyle = '#dd4444'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.strokeRect(px + 2, py + 2, size - 4, size - 4); ctx.restore();
	}

    // --- 其他元素 ---
    const entries = getEntriesAt(x, y, z);
    let elemIds = [];
    let hasElem = false;
    let isWp = false;
    let wpInfo = null;

    entries.forEach(e => {
        if (e.type === 'waypoint') {
            if (!state.visibility.waypoint) return;
            if (!e.data || e.data.z !== z) return;
            isWp = true; wpInfo = e.data;
        } else {
            let visible = true;
            switch (e.type) {
                case 'moving': visible = state.visibility.moving; break;
                case 'falling': visible = state.visibility.falling; break;
                case 'prism': visible = state.visibility.prism; break;
                case 'resizer': visible = state.visibility.resizer; break;
                case 'bumper': visible = state.visibility.bumper; break;
                case 'checkpoint': visible = state.visibility.checkpoint; break;
                case 'cameratrigger': visible = state.visibility.cameratrigger; break;
                case 'button': visible = state.visibility.button; break;
                case 'othercube_trigger': case 'othercube_cube': visible = state.visibility.othercube; break;
                case 'darkcube_trigger': case 'darkcube_cube': visible = state.visibility.darkcube; break;
                case 'seqbutton': visible = state.visibility.buttonsequence; break;
                default: visible = true;
            }
            if (!visible) return;
            hasElem = true;
            elemIds.push({ type: e.type, id: e.id });
        }
    });

    if (hasElem) {
        let color = '#888';
        let lines = [];
        if (elemIds.length > 1) { color = '#aaaaaa'; lines = [elemIds.length + '个'];
        } else {
            const e = elemIds[0];
            switch (e.type) {
                case 'moving': {
                    color = '#4488FF';
                    const display = getDisplayId(e.id, 'moving');
                    const parts = display.match(/^(.*?)\((.*?)\)$/);
                    lines = parts ? [parts[1], parts[2]] : [display];
                    break;
                }
                case 'falling': color = '#FF8800'; lines = ['F#' + e.id]; break;
                case 'prism': color = '#00FFFF'; lines = ['P#' + e.id]; break;
                case 'resizer': {
                    const r = state.resizers.find(r => r.id === e.id);
                    color = (r && r.type === 'grow') ? '#88FF88' : '#88AA88';
                    lines = ['R#' + e.id];
                    break;
                }
                case 'bumper': {
                    color = '#FF4444';
                    const display = getDisplayId(e.id, 'bumper');
                    const parts = display.match(/^(.*?)\((.*?)\)$/);
                    lines = parts ? [parts[1], parts[2]] : [display];
                    break;
                }
                case 'checkpoint': color = '#44FF44'; lines = ['C#' + e.id]; break;
                case 'cameratrigger': color = '#AA44FF'; lines = ['T#' + e.id]; break;
                case 'button': {
                    color = '#FF44FF';
                    const display = getDisplayId(e.id, 'button');
                    const parts = display.match(/^(.*?)\((.*?)\)$/);
                    lines = parts ? [parts[1], parts[2]] : [display];
                    break;
                }
                case 'seqbutton': {
                    color = '#FFAA44';
                    const display = getDisplayId(e.id, 'seqbutton');
                    const parts = display.match(/^(.*?)\((.*?)\)$/);
                    lines = parts ? [parts[1], parts[2]] : [display];
                    break;
                }
                case 'othercube_trigger': color = '#44CCFF'; lines = ['OT#' + e.id]; break;
                case 'othercube_cube': color = '#66DDFF'; lines = ['OC#' + e.id]; break;
                case 'darkcube_trigger': color = '#555555'; lines = ['DT#' + e.id]; break;
                case 'darkcube_cube': color = '#777777'; lines = ['DC#' + e.id]; break;
                default: lines = [e.type + '#' + e.id];
            }
        }

        ctx.fillStyle = color;
        ctx.fillRect(px, py, size, size);

		ctx.save();
		ctx.shadowColor = 'rgba(0, 0, 0, 0.9)'; ctx.shadowBlur = 3; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 1;
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const fontSize = Math.max(9, size * 0.25);
        ctx.font = `bold ${fontSize}px sans-serif`;
        if (lines.length === 1) {
            ctx.fillText(lines[0], px + size/2, py + size/2);
        } else {
            const lineHeight = fontSize * 1.2;
            const totalHeight = lines.length * lineHeight;
            const startY = py + (size - totalHeight) / 10 + lineHeight/2;
            lines.forEach((line, i) => { ctx.fillText(line, px + size/2, startY + i * lineHeight); });
        }
		ctx.restore();
    }

    // --- 路点 ---
	if (isWp) {
		ctx.save();
		ctx.strokeStyle = '#FFAA00'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
		ctx.strokeRect(px + 2, py + 2, size - 4, size - 4);
		ctx.shadowColor = 'rgba(0, 0, 0, 0.9)'; ctx.shadowBlur = 3; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 1;
		ctx.fillStyle = '#FFAA00'; ctx.font = '11px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
		ctx.fillText(`${wpInfo.parentId}W${wpInfo.idx+1}`, px + size - 4, py + size/1.5);
		ctx.restore();
	}

    // --- 选中高亮 ---
    const selected = state.selectedElement;
    if (selected) {
        let isSelected = false;
        if (selected.type === 'static' && selected.staticCoord) {
            const sc = selected.staticCoord;
            if (sc.x === x && sc.y === y && sc.z === z) isSelected = true;
        } else if (selected.type !== 'static') {
            if (elemIds.some(e => e.type === selected.type && e.id === selected.id)) isSelected = true;
        }
        if (isSelected) {
            ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2;
            ctx.strokeRect(px + 1, py + 1, size - 2, size - 2);
        }
    }
}

function updatePixelAt(x, y, z) {
    // 快速边界检查，如果像素不在当前渲染范围内（分块外），则忽略
    if (x < _minX || x >= _minX + _currentGridW || y < _minY || y >= _minY + _currentGridH) return;

    const pixelSize = PIXEL_SIZE;
    const padding = PADDING;
    const gridX = x - _minX;
    const gridY = y - _minY;
    const px = padding + gridX * pixelSize;
    const py = padding + gridY * pixelSize;
    
    ctx.save();
    ctx.scale(_canvasScale, _canvasScale);
    ctx.clearRect(px, py, pixelSize, pixelSize);
    drawPixel(ctx, x, y, z, px, py, pixelSize);
    ctx.strokeStyle = 'rgba(60, 80, 120, 0.6)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(px, py, pixelSize, pixelSize);
    ctx.restore();
}

// ==================== 路点渲染 ====================
function renderWaypoints(m) {
	const container = document.getElementById('wpList');
	if (!container) return;
	const wps = m.waypoints || [];
	if (wps.length === 0) {
		container.innerHTML = '<div style="color:var(--text-faint);font-size:11px;padding:4px;">暂无路点</div>';
		return;
	}
	let html = '';
	wps.forEach((wp, idx) => {
		const isFirst = idx === 0;
		html += `
			<div class="waypoint-item">
				<span class="wp-label">${isFirst ? '#1(起点)' : '#'+ (idx+1)}</span>
				<input type="number" value="${wp.x}" onchange="updateWaypoint('${m.id}',${idx},'x',parseInt(this.value))" style="width:40px;">
				<input type="number" value="${wp.y}" onchange="updateWaypoint('${m.id}',${idx},'y',parseInt(this.value))" style="width:40px;">
				<input type="number" value="${wp.z}" onchange="updateWaypoint('${m.id}',${idx},'z',parseInt(this.value))" style="width:40px;">
				<span class="wp-field-label">移动</span>
				<input type="number" value="${wp.travelTime||0}" min="0" onchange="updateWaypoint('${m.id}',${idx},'travelTime',parseInt(this.value))" style="width:44px;">
				<span class="wp-field-label">停留</span>
				<input type="number" value="${wp.pauseTime||0}" min="0" onchange="updateWaypoint('${m.id}',${idx},'pauseTime',parseInt(this.value))" style="width:44px;">
                ${isFirst ? '' : `<button class="btn-sm" onclick="splitWaypoint('${m.id}', ${idx})">拆分</button>`}
                ${isFirst ? '' : `<button class="btn-sm" onclick="moveWaypoint('${m.id}',${idx},-1)">↑</button><button class="btn-sm" onclick="moveWaypoint('${m.id}',${idx},1)">↓</button>`}
				${isFirst ? '' : `<button class="btn-sm btn-danger" onclick="removeWaypoint('${m.id}',${idx})">✕</button>`}
			</div>
		`;
	});
	container.innerHTML = html;
}