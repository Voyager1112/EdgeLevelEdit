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

// 渲染网格（含性能优化：使用DocumentFragment）
// 全局变量：用于 updatePixelAt 计算偏移
let _minX = 0, _minY = 0;

function renderGrid() {
    const z = state.currentLayer;
    const { w, l, h } = state.level.size;
    // 禁用图像平滑，使绘制更清晰
	ctx.imageSmoothingEnabled = false;
    // 1. 计算坐标范围（基于所有元素和关卡尺寸）
    let minX = state.canvasRange.minX;
    let maxX = state.canvasRange.maxX;
    let minY = state.canvasRange.minY;
    let maxY = state.canvasRange.maxY;
    let minZ = state.canvasRange.minZ;
    let maxZ = state.canvasRange.maxZ;
    if (minX > 0) minX = 0;
    if (maxX < w - 1) maxX = w - 1;
    if (minY > 0) minY = 0;
    if (maxY < l - 1) maxY = l - 1;
    if (minZ > 0) minZ = 0;
    if (maxZ < h - 1) maxZ = h - 1;
    if (minX === Infinity) { minX = 0; maxX = w - 1; }
    if (minY === Infinity) { minY = 0; maxY = l - 1; }
    if (minZ === Infinity) { minZ = 0; maxZ = h - 1; }

    const gridW = maxX - minX + 1;
    const gridH = maxY - minY + 1;
    if (gridW < 1 || gridH < 1) return;
	_currentGridW = gridW;
	_currentGridH = gridH;
    // 如果当前层超出范围，自动调整
    if (z < minZ) { state.currentLayer = minZ; layerInput.value = minZ; return; }
    if (z > maxZ) { state.currentLayer = maxZ; layerInput.value = maxZ; return; }

    // 保存偏移量供 updatePixelAt 使用
    _minX = minX;
    _minY = minY;
	currentMinX = minX;
	currentMinY = minY;
    // 2. 设置 Canvas 尺寸
    const pixelSize = PIXEL_SIZE;
    const padding = PADDING;
    const canvasWidth = gridW * pixelSize + padding * 2;
    const canvasHeight = gridH * pixelSize + padding * 2;
	// 替换为：
	canvas.width = canvasWidth;
	canvas.height = canvasHeight;
	// CSS 尺寸 = 像素尺寸 × 缩放，配合 transform-origin: 0 0 使左上角固定
	canvas.style.width = (canvasWidth * state.zoom) + 'px';
	canvas.style.height = (canvasHeight * state.zoom) + 'px';
	// 确保没有 transform 干扰（缩放已通过 CSS 尺寸实现）
	canvas.style.transform = 'none';

    // 3. 清空并绘制背景 + 网格线
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.strokeStyle = '#2a3a5a';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= gridW; i++) {
        ctx.beginPath();
        ctx.moveTo(padding + i * pixelSize, padding);
        ctx.lineTo(padding + i * pixelSize, canvasHeight - padding);
        ctx.stroke();
    }
    for (let i = 0; i <= gridH; i++) {
        ctx.beginPath();
        ctx.moveTo(padding, padding + i * pixelSize);
        ctx.lineTo(canvasWidth - padding, padding + i * pixelSize);
        ctx.stroke();
    }

    // 4. 收集半径元素（用于绘制虚线矩形）
    const radiusElements = [];

    // 辅助添加半径元素
    function addRadiusElement(elem, type, x, y, rx, ry) {
        if (rx > 0 || ry > 0) {
            let color = 'rgba(255,255,255,0.3)';
            if (type === 'checkpoint') color = 'rgba(68,255,68,0.4)';
            else if (type === 'cameratrigger') color = 'rgba(170,68,255,0.4)';
            else if (type === 'resizer') color = elem.type === 'grow' ? 'rgba(136,255,136,0.4)' : 'rgba(136,170,136,0.4)';
            else if (type === 'othercube_trigger' || type === 'darkcube_trigger') color = 'rgba(255,200,100,0.3)';
            radiusElements.push({ x, y, rx, ry, color });
        }
    }

    // 遍历所有带半径的元素
    state.checkpoints.forEach(c => {
        if (state.visibility.checkpoint && c.z === z) addRadiusElement(c, 'checkpoint', c.x, c.y, c.radiusX, c.radiusY);
    });
    state.cameraTriggers.forEach(c => {
        if (state.visibility.cameratrigger && c.z === z) addRadiusElement(c, 'cameratrigger', c.x, c.y, c.radiusX, c.radiusY);
    });
    state.resizers.forEach(r => {
        if (state.visibility.resizer && r.z === z) addRadiusElement(r, 'resizer', r.x, r.y, r.radiusX, r.radiusY);
    });
    state.otherCubes.forEach(oc => {
        if (state.visibility.othercube && oc.triggerZ === z) addRadiusElement(oc, 'othercube_trigger', oc.triggerX, oc.triggerY, oc.radiusX, oc.radiusY);
    });
    state.darkCubes.forEach(dc => {
        if (state.visibility.darkcube && dc.triggerZ === z) addRadiusElement(dc, 'darkcube_trigger', dc.triggerX, dc.triggerY, dc.radiusX, dc.radiusY);
    });

    // 5. 绘制每个格子
    for (let gridY = 0; gridY < gridH; gridY++) {
        for (let gridX = 0; gridX < gridW; gridX++) {
            const realX = minX + gridX;
            const realY = minY + gridY;
            const px = padding + gridX * pixelSize;
            const py = padding + gridY * pixelSize;
            drawPixel(ctx, realX, realY, z, px, py, pixelSize);
        }
    }
	// 在 renderGrid 函数中，找到绘制格子的双重循环（for gridY / for gridX）
	// 在这个循环之后，添加以下代码（替换原来的网格绘制）：

	// ===== 绘制网格线（在格子上方，半透明，确保可见） =====
	ctx.save();
	ctx.strokeStyle = 'rgba(60, 80, 120, 0.6)';
	ctx.lineWidth = 0.8;
	for (let i = 0; i <= gridW; i++) {
		ctx.beginPath();
		ctx.moveTo(padding + i * pixelSize, padding);
		ctx.lineTo(padding + i * pixelSize, canvasHeight - padding);
		ctx.stroke();
	}
	for (let i = 0; i <= gridH; i++) {
		ctx.beginPath();
		ctx.moveTo(padding, padding + i * pixelSize);
		ctx.lineTo(canvasWidth - padding, padding + i * pixelSize);
		ctx.stroke();
	}
	// 加粗外边框
	ctx.strokeStyle = 'rgba(80, 120, 180, 0.8)';
	ctx.lineWidth = 1.5;
	ctx.strokeRect(padding, padding, gridW * pixelSize, gridH * pixelSize);
	ctx.restore();
    // 6. 绘制半径虚线（叠加在格子上方）
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

    // 7. 更新网格信息
    document.getElementById('gridInfo').textContent = `Z=${z} | 范围 X: ${minX}~${maxX}, Y: ${minY}~${maxY}`;
	
	// 在 renderGrid 函数开头，添加静态变量跟踪尺寸
	// 注意：由于 JavaScript 没有静态局部变量，使用全局变量或闭包

	// 在 renderGrid 函数中，计算 canvasWidth 和 canvasHeight 后：
	if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
		canvas.width = canvasWidth;
		canvas.height = canvasHeight;
		canvas.style.width = (canvasWidth * state.zoom) + 'px';
		canvas.style.height = (canvasHeight * state.zoom) + 'px';
	}
	// 如果尺寸没变，只重绘内容，不重新设置 canvas 尺寸
	
    // ===== 拖拽中的选框 =====
    if (typeof _selBox !== 'undefined' && _selBox) {
        const x0 = Math.min(_selBox.x0, _selBox.x1);
        const x1 = Math.max(_selBox.x0, _selBox.x1);
        const y0 = Math.min(_selBox.y0, _selBox.y1);
        const y1 = Math.max(_selBox.y0, _selBox.y1);
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
    
    // ===== 多选包围框（持久保留） =====
    if (typeof getSelectionBounds === 'function'
        && state.multiSelection && state.multiSelection.length > 0) {
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
            const px = padding + (sx - minX) * pixelSize;
            const py = padding + (sy - minY) * pixelSize;
            ctx.save();
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 2;
            ctx.strokeRect(px + 1, py + 1, pixelSize - 2, pixelSize - 2);
            ctx.restore();
        });
    }
    
    updateStatus();
}
// 缓存 canvas 尺寸，避免重复设置
let lastCanvasWidth = 0;
let lastCanvasHeight = 0;

function drawPixel(ctx, x, y, z, px, py, size) {
    const { w, l, h } = state.level.size;

    // --- 静态方块 ---
    let staticBlock = null;
    if (x >= 0 && x < w && y >= 0 && y < l) {
        const layer = state.staticBlocks[z];
        if (layer && layer[y] && layer[y][x]) {
            staticBlock = layer[y][x];
        }
    }
    if (staticBlock && state.visibility.static) {
        const color = `rgb(${staticBlock.r},${staticBlock.g},${staticBlock.b})`;
        ctx.fillStyle = color;
        ctx.fillRect(px, py, size, size);
        // 绘制模式标签（如 B, GM 等）
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
		// 绘制虚线框
		ctx.save();
		ctx.strokeStyle = '#44dd88';
		ctx.lineWidth = 1.5;
		ctx.setLineDash([4, 4]);
		ctx.strokeRect(px + 2, py + 2, size - 4, size - 4);
		ctx.restore();
	}
	if (exit && exit.z === z && exit.x === x && exit.y === y && state.visibility.exit) {
		ctx.fillStyle = '#dd4444';
		ctx.font = 'bold 12px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('E', px + size/2, py + size/2);
		ctx.save();
		ctx.strokeStyle = '#dd4444';
		ctx.lineWidth = 1.5;
		ctx.setLineDash([4, 4]);
		ctx.strokeRect(px + 2, py + 2, size - 4, size - 4);
		ctx.restore();
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
            if (!e.data || e.data.z !== z) return;  // 确保 data 存在
            isWp = true;
            wpInfo = e.data;
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
                case 'othercube_trigger':
                case 'othercube_cube': visible = state.visibility.othercube; break;
                case 'darkcube_trigger':
                case 'darkcube_cube': visible = state.visibility.darkcube; break;
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
        let lines = [];   // 多行文本
        if (elemIds.length > 1) {
            color = '#aaaaaa';
            lines = [elemIds.length + '个'];
        } else {
            const e = elemIds[0];
            // 根据类型设置颜色和文本（支持多行）
            switch (e.type) {
                case 'moving': {
                    color = '#4488FF';
                    const display = getDisplayId(e.id, 'moving');
                    const parts = display.match(/^(.*?)\((.*?)\)$/);
                    if (parts) {
                        lines = [parts[1], parts[2]]; // 第一行编号，第二行ID
                    } else {
                        lines = [display];
                    }
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
                    if (parts) {
                        lines = [parts[1], parts[2]];
                    } else {
                        lines = [display];
                    }
                    break;
                }
                case 'checkpoint': color = '#44FF44'; lines = ['C#' + e.id]; break;
                case 'cameratrigger': color = '#AA44FF'; lines = ['T#' + e.id]; break;
                case 'button': {
                    color = '#FF44FF';
                    const display = getDisplayId(e.id, 'button');
                    const parts = display.match(/^(.*?)\((.*?)\)$/);
                    if (parts) {
                        lines = [parts[1], parts[2]];
                    } else {
                        lines = [display];
                    }
                    break;
                }
                case 'seqbutton': {
                    color = '#FFAA44';
                    const display = getDisplayId(e.id, 'seqbutton');
                    const parts = display.match(/^(.*?)\((.*?)\)$/);
                    if (parts) {
                        lines = [parts[1], parts[2]];
                    } else {
                        lines = [display];
                    }
                    break;
                }
                case 'othercube_trigger': color = '#44CCFF'; lines = ['OT#' + e.id]; break;
                case 'othercube_cube': color = '#66DDFF'; lines = ['OC#' + e.id]; break;
                case 'darkcube_trigger': color = '#555555'; lines = ['DT#' + e.id]; break;
                case 'darkcube_cube': color = '#777777'; lines = ['DC#' + e.id]; break;
                default: lines = [e.type + '#' + e.id];
            }
        }

        // 绘制背景色
        ctx.fillStyle = color;
        ctx.fillRect(px, py, size, size);

        // 绘制文字（多行）
		ctx.save();
		ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
		ctx.shadowBlur = 3;
		ctx.shadowOffsetX = 0;
		ctx.shadowOffsetY = 1;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const fontSize = Math.max(9, size * 0.25); // 清晰大字体
        ctx.font = `bold ${fontSize}px sans-serif`;
        if (lines.length === 1) {
            ctx.fillText(lines[0], px + size/2, py + size/2);
        } else {
            const lineHeight = fontSize * 1.2;
            const totalHeight = lines.length * lineHeight;
            const startY = py + (size - totalHeight) / 10 + lineHeight/2;
            lines.forEach((line, i) => {
                const y = startY + i * lineHeight;
                ctx.fillText(line, px + size/2, y);
            });
        }
		ctx.restore(); // 恢复阴影设置
    }

    // --- 路点（如果单独显示） ---
	if (isWp) {
		// 绘制虚线框（覆盖整个格子，内边距2像素）
		ctx.save();
		ctx.strokeStyle = '#FFAA00';
		ctx.lineWidth = 1.5;
		ctx.setLineDash([4, 4]);
		ctx.strokeRect(px + 2, py + 2, size - 4, size - 4);
		//ctx.restore();

		// 仍显示路点序号（右下角小字）
		ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
		ctx.shadowBlur = 3;
		ctx.shadowOffsetX = 0;
		ctx.shadowOffsetY = 1;
		ctx.fillStyle = '#FFAA00';
		ctx.font = '11px sans-serif';
		ctx.textAlign = 'right';
		ctx.textBaseline = 'top';
		const parentInfo = wpInfo.parentId ? `M${wpInfo.parentId}` : '?';
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
            const found = elemIds.some(e => e.type === selected.type && e.id === selected.id);
            if (found) isSelected = true;
        }
        if (isSelected) {
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 2;
            ctx.strokeRect(px + 1, py + 1, size - 2, size - 2);
        }
    }
}

function updatePixelAt(x, y, z) {
    const pixelSize = PIXEL_SIZE;
    const padding = PADDING;
    const gridX = x - _minX;
    const gridY = y - _minY;
    const px = padding + gridX * pixelSize;
    const py = padding + gridY * pixelSize;
    // 清除该区域
    ctx.clearRect(px, py, pixelSize, pixelSize);
    // 重新绘制该像素
    drawPixel(ctx, x, y, z, px, py, pixelSize);
	// 重新绘制该像素的网格线（因为 clearRect 会清除网格）
    ctx.save();
    ctx.strokeStyle = 'rgba(60, 80, 120, 0.6)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(px, py, pixelSize, pixelSize);
    ctx.restore();
}

// 路点渲染（与之前相同）
function renderWaypoints(m) {
	const container = document.getElementById('wpList');
	if (!container) return;
	const wps = m.waypoints || [];
	if (wps.length === 0) {
		container.innerHTML = '<div style="color:#5a7a9a;font-size:11px;padding:4px;">暂无路点</div>';
		return;
	}
	let html = '';
	wps.forEach((wp, idx) => {
		const isFirst = idx === 0;
		html += `
			<div class="waypoint-item">
				<span class="wp-label">${isFirst ? '#1(起点)' : '#'+
				(idx+1)}</span>
				<input type="number" value="${wp.x}" onchange="updateWaypoint('${m.id}',${idx},'x',parseInt(this.value))" style="width:40px;">
				<input type="number" value="${wp.y}" onchange="updateWaypoint('${m.id}',${idx},'y',parseInt(this.value))" style="width:40px;">
				<input type="number" value="${wp.z}" onchange="updateWaypoint('${m.id}',${idx},'z',parseInt(this.value))" style="width:40px;">
				<span class="wp-field-label">移动</span>
				<input type="number" value="${wp.travelTime||0}" min="0" onchange="updateWaypoint('${m.id}',${idx},'travelTime',parseInt(this.value))" style="width:44px;">
				<span class="wp-field-label">停留</span>
				<input type="number" value="${wp.pauseTime||0}" min="0" onchange="updateWaypoint('${m.id}',${idx},'pauseTime',parseInt(this.value))" style="width:44px;">
				${isFirst ? '' : `<button style="background:#1a4a7a;border:none;color:#fff;border-radius:3px;cursor:pointer;padding:0 8px;" onclick="splitWaypoint('${m.id}', ${idx})">拆分</button>`}
                ${isFirst ? '' : `
                    <button style="background:#1a4a7a;..." onclick="moveWaypoint('${m.id}',${idx},-1)">↑</button>
                    <button style="background:#1a4a7a;..." onclick="moveWaypoint('${m.id}',${idx},1)">↓</button>
                `}
				${isFirst ? '' : `<button style="background:#a03030;border:none;color:#fff;border-radius:3px;cursor:pointer;padding:0 8px;" onclick="removeWaypoint('${m.id}',${idx})">✕</button>`}
			</div>
		`;
	});
	container.innerHTML = html;
}
