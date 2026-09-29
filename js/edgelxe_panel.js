// 更新面板（已扩展其他元素）
function updatePanel() {
    if (state._suppressUI) return;
	const savedScrollTop = panelContent.scrollTop;
	// 保存子列表滚动位置（如果存在）
	const seqList = document.getElementById('seqButtonList');
	const savedSeqScrollTop = seqList ? seqList.scrollTop : 0;
	// ===== 新增：保存 wpList 滚动位置 =====
    const wpList = document.getElementById('wpList');
    const savedWpScrollTop = wpList ? wpList.scrollTop : 0;
    // ===== 新增结束 =====
	// 构建移动平台 ID 到坐标的快速映射（用于按钮显示）
	const movingPosMap = {};
	state.movingPlatforms.forEach(m => {
		const pos = getMovingPos(m);
		// 同时支持 id 和 xmlId 作为键
		movingPosMap[m.id] = pos;
		if (m.xmlId) movingPosMap[m.xmlId] = pos;
	});
	try {
		const sel = state.selectedElement;
		if (!sel) {
			panelContent.innerHTML = `<div class="empty-msg">点击画布上的元素查看属性</div>`;
			return;
		}

		if (sel.type === 'static') {
			const { x, y, z } = sel.staticCoord;
			const layer = state.staticBlocks[z];
			if (!layer || !layer[y] || !layer[y][x]) {
				state.selectedElement = null;
				updatePanel();
				return;
			}
			const block = layer[y][x];
			let html = `
				<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
					<span class="color-dot" style="background:rgb(${block.r},${block.g},${block.b});"></span>
					<strong>静态方块</strong>
					<span style="color:#6a8aaa;font-size:12px;">(${x}, ${y}, ${z})</span>
					<button class="remove-btn" onclick="removeStatic(${x},${y},${z})">✕</button>
					<button class="remove-btn" style="background:#2a5a7a;" onclick="resetStaticColor(${x},${y},${z})">恢复默认</button>
				</div>
				<div class="prop-row"><label>R</label>
					<input type="range" min="0" max="255" value="${block.r}" oninput="updateStaticRGB(${x},${y},${z},parseInt(this.value),${block.g},${block.b})">
					<input type="number" min="0" max="255" value="${block.r}" onchange="updateStaticRGB(${x},${y},${z},parseInt(this.value),${block.g},${block.b})" style="flex:0 1 50px;">
				</div>
				<div class="prop-row"><label>G</label>
					<input type="range" min="0" max="255" value="${block.g}" oninput="updateStaticRGB(${x},${y},${z},${block.r},parseInt(this.value),${block.b})">
					<input type="number" min="0" max="255" value="${block.g}" onchange="updateStaticRGB(${x},${y},${z},${block.r},parseInt(this.value),${block.b})" style="flex:0 1 50px;">
				</div>
				<div class="prop-row"><label>B</label>
					<input type="range" min="0" max="255" value="${block.b}" oninput="updateStaticRGB(${x},${y},${z},${block.r},${block.g},parseInt(this.value))">
					<input type="number" min="0" max="255" value="${block.b}" onchange="updateStaticRGB(${x},${y},${z},${block.r},${block.g},parseInt(this.value))" style="flex:0 1 50px;">
				</div>
				<div class="rgb-presets">
					<button onclick="applyStaticPreset(${x},${y},${z},255,255,255)">普通</button>
					<button onclick="applyStaticPreset(${x},${y},${z},240,255,255)">发光移动</button>
					<button onclick="applyStaticPreset(${x},${y},${z},200,255,255)">发光半移动</button>
					<button onclick="applyStaticPreset(${x},${y},${z},180,255,255)">移动</button>
					<button onclick="applyStaticPreset(${x},${y},${z},140,255,255)">半移动</button>
					<button onclick="applyStaticPreset(${x},${y},${z},50,255,255)">无碰撞</button>
					<button onclick="applyStaticPreset(${x},${y},${z},${block.r},${block.g},128)">半格</button>
					<button onclick="applyStaticPreset(${x},${y},${z},${block.r},${block.g},35)">掉落</button>
				</div>
			`;
			panelContent.innerHTML = html;
			return;
		}

		// 查找元素
		let elem = null;
		let typeName = '';
		const finders = {
			moving: { arr: state.movingPlatforms, name: '移动平台' },
			falling: { arr: state.fallingPlatforms, name: '掉落平台' },
			prism: { arr: state.prisms, name: '棱柱' },
			resizer: { arr: state.resizers, name: '尺寸调整器' },
			bumper: { arr: state.bumpers, name: '撞击器' },
			checkpoint: { arr: state.checkpoints, name: '存档点' },
			cameratrigger: { arr: state.cameraTriggers, name: '相机触发' },
			button: { arr: state.buttons, name: '按钮' },
			buttonsequence: { arr: state.buttonSequences, name: '按钮序列' },
			othercube: { arr: state.otherCubes, name: '提示方块' },
			darkcube: { arr: state.darkCubes, name: '黑暗方块' },
		};
		// 处理子类型映射
		let realType = sel.type;
		// 处理序列子按钮
		if (sel.type === 'seqbutton') {
			let parentSeq = null;
			let parentSeqId = null;
			for (let seq of state.buttonSequences) {
				if (seq.buttons && seq.buttons.some(b => b.id === sel.id)) {
					parentSeq = seq;
					parentSeqId = seq.id;
					break;
				}
			}
			if (!parentSeq) {
				panelContent.innerHTML = `<div class="empty-msg">子按钮所属序列未找到</div>`;
				state.selectedElement = null;
				return;
			}
			const btn = parentSeq.buttons.find(b => b.id === sel.id);
			if (!btn) {
				panelContent.innerHTML = `<div class="empty-msg">子按钮不存在</div>`;
				state.selectedElement = null;
				return;
			}
			const idx = parentSeq.buttons.indexOf(btn);
            
            // ---- 计算用于显示的坐标（若绑定移动平台，则显示移动平台位置） ----
            let displayX = '', displayY = '', displayZ = '', displayCoordStr = '';
            if (btn.movingPlatformID) {
                const pos = movingPosMap[btn.movingPlatformID];
                if (pos) {
                    displayX = pos.x;
                    displayY = pos.y;
                    displayZ = pos.z;
                    displayCoordStr = `${pos.x},${pos.y},${pos.z}`;
                } else {
                    displayCoordStr = '未找到移动平台';
                }
            } else {
                displayX = (btn.position.x !== null && btn.position.x !== undefined) ? btn.position.x : '';
                displayY = (btn.position.y !== null && btn.position.y !== undefined) ? btn.position.y : '';
                displayZ = (btn.position.z !== null && btn.position.z !== undefined) ? btn.position.z : '';
                displayCoordStr = `${displayX},${displayY},${displayZ}`;
            }
            
			let html = `
				<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
					<span class="color-dot" style="background:#FFAA44;"></span>
					<strong>序列子按钮 #${btn.id} ID:${btn.xmlId || '-'}</strong>
                    <span style="color:#6a8aaa;font-size:12px;">${btn.movingPlatformID!=='' && btn.movingPlatformID!==undefined?'所属移动平台：'+btn.movingPlatformID:''}</span>
                    <span style="color:#6a8aaa;font-size:12px;">(${displayX},${displayY},${displayZ})</span>
					<span style="color:#6a8aaa;font-size:12px;">所属序列: #${parentSeqId}</span>
                    <button class="remove-btn" onclick="removeButtonSequenceButton('${parentSeqId}', ${idx})">✕</button>
				</div>
				<div class="prop-row"><label>编号</label><input type="text" value="${btn.id}" onchange="updateButtonSequenceButtonProp('${parentSeqId}', ${idx}, 'id', this.value)" style="flex:0 1 80px;"></div>
				<div class="prop-row"><label>ID</label><input type="text" value="${btn.xmlId||''}" onchange="updateButtonSequenceButtonXmlId('${parentSeqId}', ${idx}, this.value)" style="flex:0 1 80px;" placeholder="留空则不输出"></div>
				<div class="prop-row"><button class="add-btn" onclick="syncButtonSequenceButtonXmlId('${parentSeqId}', ${idx})">同步编号到ID</button></div>
				<div class="prop-row"><label>可见</label>
					<select onchange="updateButtonSequenceButtonProp('${parentSeqId}', ${idx}, 'visible', this.value==='null' ? null : (this.value==='true'))">
						<option value="true"  ${btn.visible === true  ? 'selected' : ''}>是</option>
						<option value="false" ${btn.visible === false ? 'selected' : ''}>否</option>
						<option value="null"  ${btn.visible === null  ? 'selected' : ''}>半透明</option>
					</select>
				</div>
				<div class="prop-row"><label>位置 (X,Y,Z)</label>
					<!--<input type="number" value="${btn.position?btn.position.x:0}" onchange="updateButtonSequenceButtonPos('${parentSeqId}', ${idx}, 'x', parseInt(this.value))" style="width:50px;" ${btn.movingPlatformID ? 'disabled' : ''}>
					<input type="number" value="${btn.position?btn.position.y:0}" onchange="updateButtonSequenceButtonPos('${parentSeqId}', ${idx}, 'y', parseInt(this.value))" style="width:50px;" ${btn.movingPlatformID ? 'disabled' : ''}>
					<input type="number" value="${btn.position?btn.position.z:0}" onchange="updateButtonSequenceButtonPos('${parentSeqId}', ${idx}, 'z', parseInt(this.value))" style="width:50px;" ${btn.movingPlatformID ? 'disabled' : ''}>-->
                    <input type="number" value="${displayX}" onchange="updateButtonSequenceButtonPos('${parentSeqId}', ${idx}, 'x', parseInt(this.value))" style="width:50px;" ${btn.movingPlatformID ? 'disabled' : ''}>
					<input type="number" value="${displayY}" onchange="updateButtonSequenceButtonPos('${parentSeqId}', ${idx}, 'y', parseInt(this.value))" style="width:50px;" ${btn.movingPlatformID ? 'disabled' : ''}>
					<input type="number" value="${displayZ}" onchange="updateButtonSequenceButtonPos('${parentSeqId}', ${idx}, 'z', parseInt(this.value))" style="width:50px;" ${btn.movingPlatformID ? 'disabled' : ''}>
				</div>
				<div class="prop-row"><label>移动平台ID (二选一)</label>
					<select onchange="updateButtonSequenceButtonMovingPlatform('${parentSeqId}', ${idx}, this.value)" style="flex:2;">
						<option value="">无</option>
						${state.movingPlatforms.filter(m => m.xmlId).map(m => `<option value="${m.xmlId}" ${btn.movingPlatformID===m.xmlId?'selected':''}>${m.xmlId}</option>`).join('')}
					</select>
				</div>
				<div class="prop-row" style="margin-top:6px;">
					<button class="add-btn" onclick="selectElement('buttonsequence','${parentSeqId}')">跳转到序列</button>
					<button class="add-btn" style="background:#a03030;" onclick="unbindSeqButton('${parentSeqId}','${btn.id}')">解绑为普通按钮</button>
				</div>
			`;
			panelContent.innerHTML = html;
			return;
		}
		if (sel.type === 'othercube_trigger' || sel.type === 'othercube_cube') realType = 'othercube';
		else if (sel.type === 'darkcube_trigger' || sel.type === 'darkcube_cube') realType = 'darkcube';
		const finder = finders[realType];
		if (finder) {
			elem = finder.arr.find(m => m.id === sel.id);
			typeName = finder.name;
		}

		if (!elem) {
			panelContent.innerHTML = `<div class="empty-msg">元素已删除</div>`;
			state.selectedElement = null;
			return;
		}

		let dotColor = '#4488FF';
		switch (realType) {
			case 'moving': dotColor = '#4488FF'; break;
			case 'falling': dotColor = '#FF8800'; break;
			case 'prism': dotColor = '#00FFFF'; break;
			case 'resizer': dotColor = '#88FF88'; break;
			case 'bumper': dotColor = '#FF4444'; break;
			case 'checkpoint': dotColor = '#44FF44'; break;
			case 'cameratrigger': dotColor = '#AA44FF'; break;
			case 'button': dotColor = '#FF44FF'; break;
			case 'othercube': dotColor = '#44CCFF'; break;
			case 'darkcube': dotColor = '#555555'; break;
			case 'buttonsequence': dotColor = '#FFAA44'; break;
			default: dotColor = '#4488FF';
		}

		let html = `
			<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
				<span class="color-dot" style="background:${dotColor};"></span>
				<strong>${typeName} #${elem.id} ID:${elem.xmlId || '-'}</strong>
				<span style="color:#6a8aaa;font-size:12px;">${elem.movingPlatformID!=='' && elem.movingPlatformID!==undefined?'所属移动平台：'+elem.movingPlatformID:''}</span>
                <span style="color:#6a8aaa;font-size:12px;">(${movingPosMap[elem.movingPlatformID]!==undefined?movingPosMap[elem.movingPlatformID].x+','+movingPosMap[elem.movingPlatformID].y+','+movingPosMap[elem.movingPlatformID].z:elem.triggerX!==undefined?elem.triggerX+','+elem.triggerY+','+elem.triggerZ:elem.x!==undefined?elem.x+','+elem.y+','+elem.z:getMovingPos(elem).x+','+getMovingPos(elem).y+','+getMovingPos(elem).z})</span>
				<button class="remove-btn" onclick="deleteElement('${sel.type}', '${elem.id}')">✕</button>
			</div>
			<div class="prop-row"><label>编号</label><input type="text" value="${elem.id}" onchange="updateElementId('${realType}','${elem.id}',this.value)" style="flex:0 1 80px;"></div>
		`;

		// 根据类型生成属性
		switch (realType) {
			case 'moving':
			const pos = getMovingPos(elem);
			html += `
				<!--<span style="color:#6a8aaa;font-size:12px;">位置(${pos.x}, ${pos.y}, ${pos.z})</span>-->
				<div class="prop-row"><label>ID</label><input type="text" value="${elem.xmlId||''}" onchange="updateXmlId('${elem.id}','moving',this.value)" style="flex:0 1 80px;" placeholder="留空则不输出"></div>
				<div class="prop-row"><button class="add-btn" onclick="syncXmlId('${elem.id}','${realType}')">同步编号到ID</button></div>
				<div class="prop-row"><label>位置 (X,Y,Z)</label>
					<input type="number" value="${pos.x}" onchange="updateMovingPos('${elem.id}','x',parseInt(this.value))" style="width:50px;">
					<input type="number" value="${pos.y}" onchange="updateMovingPos('${elem.id}','y',parseInt(this.value))" style="width:50px;">
					<input type="number" value="${pos.z}" onchange="updateMovingPos('${elem.id}','z',parseInt(this.value))" style="width:50px;">
				</div>
				<div class="prop-row"><label>自动启动</label>
					<select onchange="updateMovingProp('${elem.id}','autoStart',this.value==='true')">
						<option value="true" ${elem.autoStart?'selected':''}>是</option>
						<option value="false" ${!elem.autoStart?'selected':''}>否</option>
					</select>
				</div>
				<div class="prop-row"><label>循环索引</label>
					<input type="number" value="${elem.loopStartIndex}" min="0" onchange="updateMovingProp('${elem.id}','loopStartIndex',parseInt(this.value))" max="${elem.waypoints ? elem.waypoints.length : 0}">
				</div>
				<div class="prop-row"><label>完整方块</label>
					<select onchange="updateMovingProp('${elem.id}','fullBlock',this.value==='true')">
						<option value="true" ${elem.fullBlock?'selected':''}>是</option>
						<option value="false" ${!elem.fullBlock?'selected':''}>否</option>
					</select>
				</div>
				<div class="prop-row"><label>RelatedTo</label>
					<select onchange="updateMovingProp('${elem.id}','relatedTo',this.value)" style="flex:2;">
						<option value="">无</option>
						${state.movingPlatforms.filter(m=>m.id!==elem.id && m.xmlId).map(m=>`<option value="${m.xmlId}" ${elem.relatedTo===m.xmlId?'selected':''}>${m.xmlId}</option>`).join('')}
					</select>
					<div class="prop-row" style="margin-top:4px;">
						<label>隐藏路点</label>
						<input type="checkbox" ${elem.hideWaypoints ? 'checked' : ''} 
							   onchange="updateMovingProp('${elem.id}','hideWaypoints',this.checked)">
					</div>
				</div>
				<div class="prop-row" style="${elem.relatedTo?'display:flex':'display:none;'}">
					<label>Offset (X,Y,Z)</label>
					<input type="text" value="${elem.offset || ''}" placeholder="0,0,0" onchange="updateMovingProp('${elem.id}','offset',this.value)" placeholder="0,0,0" style="flex:2;">
				</div>
				<div class="sub-elem-section">
					<div class="sub-title">路点</div>
					<div class="waypoint-list" id="wpList"></div>
					<button class="add-btn" onclick="addWaypoint('${elem.id}')">+ 添加路点</button>
				</div>
			`;
			panelContent.innerHTML = html;
			renderWaypoints(elem);
			break;

			case 'falling':
				html += `
					<div class="prop-row"><label>位置 (X,Y,Z)</label>
						<input type="number" value="${elem.x}" onchange="updateFallingPos('${elem.id}','x',parseInt(this.value))" style="width:50px;">
						<input type="number" value="${elem.y}" onchange="updateFallingPos('${elem.id}','y',parseInt(this.value))" style="width:50px;">
						<input type="number" value="${elem.z}" onchange="updateFallingPos('${elem.id}','z',parseInt(this.value))" style="width:50px;">
					</div>
					<div class="prop-row"><label>掉落延迟(帧)</label>
						<input type="number" value="${elem.floatTime}" min="0" onchange="updateFallingProp('${elem.id}','floatTime',parseInt(this.value))">
					</div>
				`;
				panelContent.innerHTML = html;
				break;

			case 'prism':
				html += `
					<div class="prop-row"><label>位置 (X,Y,Z)</label>
						<input type="number" value="${elem.x}" onchange="updatePrismPos('${elem.id}','x',parseInt(this.value))" style="width:50px;">
						<input type="number" value="${elem.y}" onchange="updatePrismPos('${elem.id}','y',parseInt(this.value))" style="width:50px;">
						<input type="number" value="${elem.z}" onchange="updatePrismPos('${elem.id}','z',parseInt(this.value))" style="width:50px;">
					</div>
					<div class="prop-row"><label>Energy (已过时)</label>
						<input type="number" value="${elem.energy}" min="0" max="255" onchange="updatePrismProp('${elem.id}','energy',parseInt(this.value))">
					</div>
				`;
				panelContent.innerHTML = html;
				break;

			case 'resizer':
				html += `
					<div class="prop-row"><label>位置 (X,Y,Z)</label>
						<input type="number" value="${elem.x}" min="0" max="${state.level.size.w-1}" onchange="updateResizerPos('${elem.id}','x',parseInt(this.value))" style="width:50px;">
						<input type="number" value="${elem.y}" min="0" max="${state.level.size.l-1}" onchange="updateResizerPos('${elem.id}','y',parseInt(this.value))" style="width:50px;">
						<input type="number" value="${elem.z}" min="1" max="${state.level.size.h}" onchange="updateResizerPos('${elem.id}','z',parseInt(this.value))" style="width:50px;">
					</div>
					<div class="prop-row"><label>可见</label>
						<select onchange="updateResizerProp('${elem.id}','visible',this.value==='true')">
							<option value="true" ${elem.visible?'selected':''}>是</option>
							<option value="false" ${!elem.visible?'selected':''}>否</option>
						</select>
					</div>
					<div class="prop-row"><label>半径 (X,Y)</label>
						<input type="number" value="${elem.radiusX}" min="0" onchange="updateResizerProp('${elem.id}','radiusX',parseInt(this.value))" style="width:50px;">
						<input type="number" value="${elem.radiusY}" min="0" onchange="updateResizerProp('${elem.id}','radiusY',parseInt(this.value))" style="width:50px;">
					</div>
				`;
				panelContent.innerHTML = html;
				break;

			case 'bumper':
				html += `
					<div class="prop-row"><label>ID</label><input type="text" value="${elem.xmlId||''}" onchange="updateXmlId('${elem.id}','bumper',this.value)" style="flex:0 1 80px;" placeholder="留空则不输出"></div>
					<div class="prop-row"><button class="add-btn" onclick="syncXmlId('${elem.id}','${realType}')">同步编号到ID</button></div>
					<div class="prop-row"><label>位置 (X,Y,Z)</label>
						<input type="number" value="${elem.x}" onchange="updateBumperPos('${elem.id}','x',parseInt(this.value))" style="width:50px;">
						<input type="number" value="${elem.y}" onchange="updateBumperPos('${elem.id}','y',parseInt(this.value))" style="width:50px;">
						<input type="number" value="${elem.z}" onchange="updateBumperPos('${elem.id}','z',parseInt(this.value))" style="width:50px;">
					</div>
					<div class="prop-row"><label>启用</label>
						<select onchange="updateBumperProp('${elem.id}','enabled',this.value==='true')">
							<option value="true" ${elem.enabled?'selected':''}>是</option>
							<option value="false" ${!elem.enabled?'selected':''}>否</option>
						</select>
					</div>
					<div class="sub-elem-section">
					<div class="sub-title">方向参数 (勾选表示启用，画布中方向为上北下南左西右东)</div>
						${['north','east','south','west'].map(dir => {
							const d = elem[dir] || { enabled: false, startDelay: 0, pulseRate: 0 };
							return `
							<div style="font-size:12px;color:#7a9abb;margin:4px 0;">${dir.toUpperCase()}</div>
							<div class="prop-row">
								<label class="chk-label">启用</label>
								<input type="checkbox" ${d.enabled?'checked':''} onchange="updateBumperDirEnabled('${elem.id}','${dir}',this.checked)">
							</div>
							<div class="prop-row" style="${d.enabled?'display:flex':'display:none;'}" id="bumper_${dir}_params">
								<label>起始延迟</label>
								<input type="number" value="${d.startDelay}" onchange="updateBumperDir('${elem.id}','${dir}','startDelay',parseInt(this.value))" style="width:70px;">
								<label>脉冲间隔</label>
								<input type="number" value="${d.pulseRate}" onchange="updateBumperDir('${elem.id}','${dir}','pulseRate',parseInt(this.value))" style="width:70px;">
							</div>
							`;
						}).join('')}
					</div>
				`;
				panelContent.innerHTML = html;
				break;

			case 'checkpoint':
				html += `
					<div class="prop-row"><label>位置 (X,Y,Z)</label>
						<input type="number" value="${elem.x}" onchange="updateCheckpointPos('${elem.id}','x',parseInt(this.value))" style="width:50px;">
						<input type="number" value="${elem.y}" onchange="updateCheckpointPos('${elem.id}','y',parseInt(this.value))" style="width:50px;">
						<input type="number" value="${elem.z}" onchange="updateCheckpointPos('${elem.id}','z',parseInt(this.value))" style="width:50px;">
					</div>
					<div class="prop-row"><label>重生Z</label>
						<input type="number" value="${elem.respawnZ}" onchange="updateCheckpointProp('${elem.id}','respawnZ',parseInt(this.value))">
					</div>
					<div class="prop-row"><label>半径 (X,Y)</label>
						<input type="number" value="${elem.radiusX}" min="0" onchange="updateCheckpointProp('${elem.id}','radiusX',parseInt(this.value))" style="width:50px;">
						<input type="number" value="${elem.radiusY}" min="0" onchange="updateCheckpointProp('${elem.id}','radiusY',parseInt(this.value))" style="width:50px;">
					</div>
				`;
				panelContent.innerHTML = html;
				break;

			case 'cameratrigger':
				const useAngle = elem.useAngle !== undefined ? elem.useAngle : true;
				html += `
					<div class="prop-row"><label>位置 (X,Y,Z)</label>
						<input type="number" value="${elem.x}" onchange="updateCameraTriggerPos('${elem.id}','x',parseInt(this.value))" style="width:50px;">
						<input type="number" value="${elem.y}" onchange="updateCameraTriggerPos('${elem.id}','y',parseInt(this.value))" style="width:50px;">
						<input type="number" value="${elem.z}" onchange="updateCameraTriggerPos('${elem.id}','z',parseInt(this.value))" style="width:50px;">
					</div>
					<div class="prop-row"><label>半径 (X,Y)</label>
						<input type="number" value="${elem.radiusX}" min="0" onchange="updateCameraTriggerProp('${elem.id}','radiusX',parseInt(this.value))" style="width:50px;">
						<input type="number" value="${elem.radiusY}" min="0" onchange="updateCameraTriggerProp('${elem.id}','radiusY',parseInt(this.value))" style="width:50px;">
					</div>
					<div class="prop-row"><label>缩放</label>
						<input type="number" value="${elem.zoom}" onchange="updateCameraTriggerProp('${elem.id}','zoom',parseInt(this.value))">
					</div>
					<div class="prop-row"><label>使用角度</label>
						<input type="checkbox" ${useAngle?'checked':''} onchange="updateCameraTriggerProp('${elem.id}','useAngle',this.checked)">
						<span class="field-hint">勾选使用Angle，取消使用FOV</span>
					</div>
					<div class="prop-row" style="${useAngle?'display:flex':'display:none;'}">
						<label>角度</label>
						<input type="number" value="${elem.angle !== undefined ? elem.angle : ''}" onchange="updateCameraTriggerProp('${elem.id}','angle',parseInt(this.value))">
					</div>
					<div class="prop-row" style="${!useAngle?'display:flex':'display:none;'}">
						<label>视野</label>
						<input type="number" value="${elem.fov !== undefined ? elem.fov : ''}" onchange="updateCameraTriggerProp('${elem.id}','fov',parseInt(this.value))">
					</div>
					<div class="prop-row"><label>起始延迟</label>
						<input type="number" value="${elem.startDelay}" min="0" onchange="updateCameraTriggerProp('${elem.id}','startDelay',parseInt(this.value))">
					</div>
					<div class="prop-row"><label>持续时间</label>
						<input type="number" value="${elem.duration}" min="0" onchange="updateCameraTriggerProp('${elem.id}','duration',parseInt(this.value))">
					</div>
					<div class="prop-row"><label>单次触发</label>
						<select onchange="updateCameraTriggerProp('${elem.id}','singleUse',this.value==='true')">
							<option value="true" ${elem.singleUse?'selected':''}>是</option>
							<option value="false" ${!elem.singleUse?'selected':''}>否</option>
						</select>
					</div>
				`;
				panelContent.innerHTML = html;
				break;

			case 'button': {
				const movingOpts = state.movingPlatforms.filter(m => m.xmlId).map(m => m.xmlId);
				const bumperOpts = state.bumpers.filter(m => m.xmlId).map(m => m.xmlId);
				
				const allButtonXmlIds = [];
				state.buttons.forEach(b => { if (b.xmlId) allButtonXmlIds.push(b.xmlId); });
				state.buttonSequences.forEach(seq => {
					if (seq.buttons) {
						seq.buttons.forEach(sb => { if (sb.xmlId) allButtonXmlIds.push(sb.xmlId); });
					}
				});
				const buttonOpts = allButtonXmlIds;

				// ---- 计算用于显示的坐标（若绑定移动平台，则显示移动平台位置） ----
				let displayX = '', displayY = '', displayZ = '', displayCoordStr = '';
				if (elem.movingPlatformID) {
					const pos = movingPosMap[elem.movingPlatformID];
					if (pos) {
						displayX = pos.x;
						displayY = pos.y;
						displayZ = pos.z;
						displayCoordStr = `${pos.x},${pos.y},${pos.z}`;
					} else {
						displayCoordStr = '未找到移动平台';
					}
				} else {
					displayX = (elem.x !== null && elem.x !== undefined) ? elem.x : '';
					displayY = (elem.y !== null && elem.y !== undefined) ? elem.y : '';
					displayZ = (elem.z !== null && elem.z !== undefined) ? elem.z : '';
					displayCoordStr = `${displayX},${displayY},${displayZ}`;
				}

				html += `
					<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
						<!--<span style="color:#6a8aaa;font-size:12px;">位置(${displayCoordStr})</span>-->
					</div>
					<div class="prop-row"><label>ID</label><input type="text" value="${elem.xmlId||''}" onchange="updateXmlId('${elem.id}','button',this.value)" style="flex:0 1 80px;" placeholder="留空则不输出"></div>
					<div class="prop-row"><button class="add-btn" onclick="syncXmlId('${elem.id}','${realType}')">同步编号到ID</button></div>
					<div class="prop-row"><label>位置 (X,Y,Z)</label>
						<input type="number" value="${displayX}" onchange="updateButtonPos('${elem.id}','x',parseInt(this.value) || 0)" style="width:50px;" ${elem.movingPlatformID ? 'disabled' : ''}>
						<input type="number" value="${displayY}" onchange="updateButtonPos('${elem.id}','y',parseInt(this.value) || 0)" style="width:50px;" ${elem.movingPlatformID ? 'disabled' : ''}>
						<input type="number" value="${displayZ}" onchange="updateButtonPos('${elem.id}','z',parseInt(this.value) || 0)" style="width:50px;" ${elem.movingPlatformID ? 'disabled' : ''}>
						${elem.movingPlatformID ? '<span style="color:#5a7a9a;font-size:11px;">(由移动平台决定)</span>' : ''}
					</div>
					<div class="prop-row"><label>可见</label>
						<select onchange="updateButtonProp('${elem.id}','visible', this.value==='null' ? null : (this.value==='true'))">
							<option value="true"  ${elem.visible === true  ? 'selected' : ''}>是</option>
							<option value="false" ${elem.visible === false ? 'selected' : ''}>否</option>
							<option value="null"  ${elem.visible === null  ? 'selected' : ''}>半透明</option>
						</select>
					</div>
					<div class="prop-row"><label>禁用次数</label>
						<input type="number" value="${elem.disableCount}" min="0" onchange="updateButtonProp('${elem.id}','disableCount',parseInt(this.value))">
					</div>
					<div class="prop-row"><label>模式</label>
						<select onchange="updateButtonProp('${elem.id}','mode',this.value)">
							<option value="StayDown" ${elem.mode==='StayDown'?'selected':''}>StayDown</option>
							<option value="StayUp" ${elem.mode==='StayUp'?'selected':''}>StayUp</option>
							<option value="Toggle" ${elem.mode==='Toggle'?'selected':''}>Toggle</option>
						</select>
					</div>
					<div class="prop-row"><label>移动平台ID (单选)</label>
						<select onchange="updateButtonProp('${elem.id}','movingPlatformID',this.value)" style="flex:2;">
							<option value="">无</option>
							${movingOpts.map(xmlid => `<option value="${xmlid}" ${elem.movingPlatformID===xmlid?'selected':''}>${xmlid}</option>`).join('')}
						</select>
					</div>
					<div class="prop-row"><span class="chk-title">影响移动平台</span>
						<div class="chk-group">
							${movingOpts.map(xmlid => `
								<label>
									<input type="checkbox" ${isAffectIdPresent(elem.affectMoving, xmlid)?'checked':''} 
										   onchange="updateButtonChecklist('${elem.id}','affectMoving','${xmlid}',this.checked)">
									${xmlid}
									<input type="number" value="${getAffectData(elem.affectMoving, xmlid)}" 
										   onchange="updateButtonAffectData('${elem.id}','affectMoving','${xmlid}',this.value)" 
										   style="width:40px;background:#0f3460;border:1px solid #1a4a7a;color:#eee;border-radius:2px;padding:1px 2px;font-size:11px;">
								</label>
							`).join('')}
						</div>
					</div>
					<div class="prop-row"><span class="chk-title">影响撞击器</span>
						<div class="chk-group">
							${bumperOpts.map(xmlid => `
								<label>
									<input type="checkbox" ${isAffectIdPresent(elem.affectBumpers, xmlid)?'checked':''} 
										   onchange="updateButtonChecklist('${elem.id}','affectBumpers','${xmlid}',this.checked)">
									${xmlid}
									<input type="number" value="${getAffectData(elem.affectBumpers, xmlid)}" 
										   onchange="updateButtonAffectData('${elem.id}','affectBumpers','${xmlid}',this.value)" 
										   style="width:40px;background:#0f3460;border:1px solid #1a4a7a;color:#eee;border-radius:2px;padding:1px 2px;font-size:11px;">
								</label>
							`).join('')}
						</div>
					</div>
					<div class="prop-row"><label>触发成就</label>
						<input type="text" value="${elem.triggerAchievements || ''}" onchange="updateButtonProp('${elem.id}','triggerAchievements',this.value)" placeholder="ID1,ID2">
					</div>
					<div class="prop-row"><span class="chk-title">影响按钮</span>
						<div class="chk-group">
							${buttonOpts.map(xmlid => `
								<label>
									<input type="checkbox" ${isAffectIdPresent(elem.affectButtons, xmlid)?'checked':''} 
										   onchange="updateButtonChecklist('${elem.id}','affectButtons','${xmlid}',this.checked)">
									${xmlid}
									<input type="number" value="${getAffectData(elem.affectButtons, xmlid)}" 
										   onchange="updateButtonAffectData('${elem.id}','affectButtons','${xmlid}',this.value)" 
										   style="width:40px;background:#0f3460;border:1px solid #1a4a7a;color:#eee;border-radius:2px;padding:1px 2px;font-size:11px;">
								</label>
							`).join('')}
						</div>
					</div>
				`;
				panelContent.innerHTML = html;
				break;
			}

			case 'seqbutton': {
				// 查找所属序列
				let parentSeq = null;
				let parentSeqId = null;
				for (let seq of state.buttonSequences) {
					if (seq.buttons && seq.buttons.some(b => b.id === elem.id)) {
						parentSeq = seq;
						parentSeqId = seq.id;
						break;
					}
				}
				if (!parentSeq) {
					panelContent.innerHTML = `<div class="empty-msg">子按钮所属序列未找到</div>`;
					return;
				}
				const btn = elem;
				const idx = parentSeq.buttons.indexOf(btn);
				let html = `
					<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
						<span class="color-dot" style="background:#FFAA44;"></span>
						<strong>序列子按钮 #${btn.id}</strong>
						<span style="color:#6a8aaa;font-size:12px;">所属序列: #${parentSeqId}</span>
						<button class="remove-btn" onclick="removeButtonSequenceButton('${parentSeqId}', ${idx})">✕</button>
					</div>
					<div class="prop-row"><label>编号</label><input type="text" value="${btn.id}" onchange="updateButtonSequenceButtonProp('${parentSeqId}', ${idx}, 'id', this.value)" style="flex:0 1 80px;"></div>
					<div class="prop-row"><label>ID</label><input type="text" value="${btn.xmlId||''}" onchange="updateButtonSequenceButtonXmlId('${parentSeqId}', ${idx}, this.value)" style="flex:0 1 80px;" placeholder="留空则不输出"></div>
					<div class="prop-row"><button class="add-btn" onclick="syncButtonSequenceButtonXmlId('${parentSeqId}', ${idx})">同步编号到ID</button></div>
					<div class="prop-row"><label>可见</label>
						<select onchange="updateButtonSequenceButtonProp('${parentSeqId}', ${idx}, 'visible', this.value==='null' ? null : (this.value==='true'))">
							<option value="true"  ${btn.visible === true  ? 'selected' : ''}>是</option>
							<option value="false" ${btn.visible === false ? 'selected' : ''}>否</option>
							<option value="null"  ${btn.visible === null  ? 'selected' : ''}>半透明</option>
						</select>
					</div>
					<div class="prop-row"><label>位置 (X,Y,Z)</label>
						<input type="number" value="${btn.position ? btn.position.x : ''}" onchange="updateButtonSequenceButtonPos('${parentSeqId}', ${idx}, 'x', parseInt(this.value) || 0)" style="width:50px;" ${btn.movingPlatformID ? 'disabled' : ''}>
						<input type="number" value="${btn.position ? btn.position.y : ''}" onchange="updateButtonSequenceButtonPos('${parentSeqId}', ${idx}, 'y', parseInt(this.value) || 0)" style="width:50px;" ${btn.movingPlatformID ? 'disabled' : ''}>
						<input type="number" value="${btn.position ? btn.position.z : ''}" onchange="updateButtonSequenceButtonPos('${parentSeqId}', ${idx}, 'z', parseInt(this.value) || 0)" style="width:50px;" ${btn.movingPlatformID ? 'disabled' : ''}>
						${btn.movingPlatformID ? '<span style="color:#5a7a9a;font-size:11px;">(由移动平台决定)</span>' : ''}
					</div>
					<div class="prop-row"><label>移动平台ID (二选一)</label>
						<select onchange="updateButtonSequenceButtonMovingPlatform('${parentSeqId}', ${idx}, this.value)" style="flex:2;">
							<option value="">无</option>
							${state.movingPlatforms.filter(m => m.xmlId).map(m => `<option value="${m.xmlId}" ${btn.movingPlatformID===m.xmlId?'selected':''}>${m.xmlId}</option>`).join('')}
						</select>
					</div>
					<div class="prop-row" style="margin-top:6px;">
						<button class="add-btn" onclick="selectElement('buttonsequence','${parentSeqId}')">跳转到序列</button>
						<button class="add-btn" style="background:#a03030;" onclick="unbindSeqButton('${parentSeqId}','${btn.id}')">解绑为普通按钮</button>
					</div>
				`;
				panelContent.innerHTML = html;
				break;
			}

			case 'buttonsequence': {
				const seqMovingOpts = state.movingPlatforms.filter(m => m.xmlId).map(m => m.xmlId);
				const seqBumperOpts = state.bumpers.filter(m => m.xmlId).map(m => m.xmlId);
				
				const allButtonXmlIds = [];
				state.buttons.forEach(b => { if (b.xmlId) allButtonXmlIds.push(b.xmlId); });
				state.buttonSequences.forEach(seq => {
					if (seq.buttons) {
						seq.buttons.forEach(sb => { if (sb.xmlId) allButtonXmlIds.push(sb.xmlId); });
					}
				});
				// 然后使用 allButtonXmlIds 生成下拉选项
				const seqButtonOpts = allButtonXmlIds;
				
				// 子按钮列表
				const subButtons = elem.buttons || [];
				
				// 保存当前滚动位置（如果存在）
				let savedScrollTop = 0;
				const seqListContainer = document.getElementById('seqButtonList');
				if (seqListContainer) {
					savedScrollTop = seqListContainer.scrollTop;
				}

				html += `
					<div class="prop-row"><label>顺序执行</label>
						<select onchange="updateButtonSeqProp('${elem.id}','sequenceInOrder',this.value==='true')">
							<option value="true" ${elem.sequenceInOrder?'selected':''}>是</option>
							<option value="false" ${!elem.sequenceInOrder?'selected':''}>否</option>
						</select>
					</div>
					<div class="prop-row"><span class="chk-title">影响移动平台</span>
						<div class="chk-group">
							${seqMovingOpts.map(xmlid => `
								<label>
									<input type="checkbox" ${isAffectIdPresent(elem.affectMoving, xmlid)?'checked':''} 
										   onchange="updateButtonSeqChecklist('${elem.id}','affectMoving','${xmlid}',this.checked)">
									${xmlid}
									<input type="number" value="${getAffectData(elem.affectMoving, xmlid)}" 
										   onchange="updateButtonSeqAffectData('${elem.id}','affectMoving','${xmlid}',this.value)" 
										   style="width:40px;background:#0f3460;border:1px solid #1a4a7a;color:#eee;border-radius:2px;padding:1px 2px;font-size:11px;">
								</label>
							`).join('')}
						</div>
					</div>
					<div class="prop-row"><span class="chk-title">影响撞击器</span>
						<div class="chk-group">
							${seqBumperOpts.map(xmlid => `
								<label>
									<input type="checkbox" ${isAffectIdPresent(elem.affectBumpers, xmlid)?'checked':''} 
										   onchange="updateButtonSeqChecklist('${elem.id}','affectBumpers','${xmlid}',this.checked)">
									${xmlid}
									<input type="number" value="${getAffectData(elem.affectBumpers, xmlid)}" 
										   onchange="updateButtonSeqAffectData('${elem.id}','affectBumpers','${xmlid}',this.value)" 
										   style="width:40px;background:#0f3460;border:1px solid #1a4a7a;color:#eee;border-radius:2px;padding:1px 2px;font-size:11px;">
								</label>
							`).join('')}
						</div>
					</div>
					<div class="prop-row"><label>触发成就</label>
						<input type="text" value="${elem.triggerAchievements || ''}" onchange="updateButtonSeqProp('${elem.id}','triggerAchievements',this.value)" placeholder="ID1,ID2">
					</div>
					<div class="prop-row"><span class="chk-title">影响按钮</span>
						<div class="chk-group">
							${seqButtonOpts.map(xmlid => `
								<label>
									<input type="checkbox" ${isAffectIdPresent(elem.affectButtons, xmlid)?'checked':''} 
										   onchange="updateButtonSeqChecklist('${elem.id}','affectButtons','${xmlid}',this.checked)">
									${xmlid}
									<input type="number" value="${getAffectData(elem.affectButtons, xmlid)}" 
										   onchange="updateButtonSeqAffectData('${elem.id}','affectButtons','${xmlid}',this.value)" 
										   style="width:40px;background:#0f3460;border:1px solid #1a4a7a;color:#eee;border-radius:2px;padding:1px 2px;font-size:11px;">
								</label>
							`).join('')}
						</div>
					</div>
					<div class="sub-elem-section">
						<div class="sub-title">序列内按钮（顺序决定XML顺序）</div>
						<button class="add-btn" onclick="addButtonSequenceButton('${elem.id}')">+ 添加按钮</button>
						<button class="add-btn seq-tool-btn" data-tool="seqbutton" onclick="activateSeqTool('${elem.id}')">序列子按钮</button>
						<button class="add-btn" onclick="openSequenceEditor('${elem.id}')">📐 调整序列</button>
						<div class="waypoint-list" id="seqButtonList">
							${subButtons.map((btn, idx) => `
								<div class="waypoint-item" style="border-bottom:1px solid #2a3a5a; flex-wrap: wrap;">
									<span class="wp-label">#${idx+1}</span>
									<div class="prop-row"><label>编号</label><input type="text" value="${btn.id}" onchange="updateButtonSequenceButtonProp('${elem.id}',${idx},'id',this.value)" style="flex:0 1 80px;"></div>
									<div class="prop-row"><label>ID</label><input type="text" value="${btn.xmlId||''}" onchange="updateButtonSequenceButtonXmlId('${elem.id}',${idx},this.value)" style="flex:0 1 80px;" placeholder="留空则不输出"></div>
									<div class="prop-row"><button class="add-btn" onclick="syncButtonSequenceButtonXmlId('${elem.id}',${idx})">同步编号到ID</button></div>
									<label>可见</label>
									<select onchange="updateButtonSequenceButtonProp('${elem.id}',${idx},'visible', this.value==='null' ? null : (this.value==='true'))">
										<option value="true"  ${btn.visible === true  ? 'selected' : ''}>是</option>
										<option value="false" ${btn.visible === false ? 'selected' : ''}>否</option>
										<option value="null"  ${btn.visible === null  ? 'selected' : ''}>半透明</option>
									</select>
									<span class="chk-title">位置 (X,Y,Z) 或 MovingPlatformID</span>
									<div style="display:flex;flex-wrap:wrap;gap:4px;width:100%;">
										<input type="number" value="${btn.position?btn.position.x:0}" onchange="updateButtonSequenceButtonPos('${elem.id}',${idx},'x',parseInt(this.value))" style="width:40px;" placeholder="X">
										<input type="number" value="${btn.position?btn.position.y:0}" onchange="updateButtonSequenceButtonPos('${elem.id}',${idx},'y',parseInt(this.value))" style="width:40px;" placeholder="Y">
										<input type="number" value="${btn.position?btn.position.z:0}" onchange="updateButtonSequenceButtonPos('${elem.id}',${idx},'z',parseInt(this.value))" style="width:40px;" placeholder="Z">
										<span style="color:#5a7a9a;">或</span>
										<select onchange="updateButtonSequenceButtonMovingPlatform('${elem.id}',${idx},this.value)" style="flex:2;">
											<option value="">无</option>
											${state.movingPlatforms.filter(m => m.xmlId).map(m => `<option value="${m.xmlId}" ${btn.movingPlatformID===m.xmlId?'selected':''}>${m.xmlId}</option>`).join('')}
										</select>
									</div>
									<div style="display:flex;gap:4px;margin-top:2px;">
										<button style="background:#1a4a7a;border:none;color:#fff;border-radius:3px;cursor:pointer;padding:0 8px;" onclick="moveButtonSequenceButton('${elem.id}',${idx},-1)">↑</button>
										<button style="background:#1a4a7a;border:none;color:#fff;border-radius:3px;cursor:pointer;padding:0 8px;" onclick="moveButtonSequenceButton('${elem.id}',${idx},1)">↓</button>
										<button style="background:#a03030;border:none;color:#fff;border-radius:3px;cursor:pointer;padding:0 8px;" onclick="removeButtonSequenceButton('${elem.id}',${idx})">✕</button>
									</div>
								</div>
							`).join('')}
						</div>
					</div>
				`;
				panelContent.innerHTML = html;
				break;
			}

			case 'othercube': {
				const movingOpts = state.movingPlatforms.filter(m => m.xmlId).map(m => m.xmlId);
				// 获取所有移动平台和按钮用于关联选择
				const allMovingIds = state.movingPlatforms.map(m => m.id);
				const allButtonIds = state.buttons.map(b => b.id);
				// 构建子元素列表
				const subMPs = elem.subMovingPlatforms || [];
				const subBtns = elem.subButtons || [];
				const keyEvents = elem.keyEvents || [];

				html += `
					<div class="prop-row"><label>触发点 (X,Y,Z)</label>
						<input type="number" value="${elem.triggerX}" onchange="updateOtherCubeProp('${elem.id}','triggerX',parseInt(this.value))" style="width:50px;">
						<input type="number" value="${elem.triggerY}" onchange="updateOtherCubeProp('${elem.id}','triggerY',parseInt(this.value))" style="width:50px;">
						<input type="number" value="${elem.triggerZ}" max="${state.level.size.h-1}" onchange="updateOtherCubeProp('${elem.id}','triggerZ',parseInt(this.value))" style="width:50px;">
					</div>
					<div class="prop-row"><label>方块位置 (X,Y,Z)</label>
						<input type="number" value="${elem.cubeX}" onchange="updateOtherCubeProp('${elem.id}','cubeX',parseInt(this.value))" style="width:50px;">
						<input type="number" value="${elem.cubeY}" onchange="updateOtherCubeProp('${elem.id}','cubeY',parseInt(this.value))" style="width:50px;">
						<input type="number" value="${elem.cubeZ}" onchange="updateOtherCubeProp('${elem.id}','cubeZ',parseInt(this.value))" style="width:50px;">
					</div>
					<div class="prop-row"><label>半径 (X,Y)</label>
						<input type="number" value="${elem.radiusX}" min="0" onchange="updateOtherCubeProp('${elem.id}','radiusX',parseInt(this.value))" style="width:50px;">
						<input type="number" value="${elem.radiusY}" min="0" onchange="updateOtherCubeProp('${elem.id}','radiusY',parseInt(this.value))" style="width:50px;">
					</div>
					<div class="prop-row"><label>模式</label>
						<select onchange="updateOtherCubeProp('${elem.id}','mode',this.value)">
							<option value="AutoHide" ${elem.mode==='AutoHide'?'selected':''}>AutoHide</option>
							<option value="MoveAway" ${elem.mode==='MoveAway'?'selected':''}>MoveAway</option>
							<option value="Hole" ${elem.mode==='Hole'?'selected':''}>Hole</option>
						</select>
					</div>
					<div class="prop-row"><label>移动方向 (X,Y,Z)</label>
						<input type="number" value="${elem.moveDirX !== undefined ? elem.moveDirX : 0}" onchange="updateOtherCubeProp('${elem.id}','moveDirX',parseInt(this.value))" style="width:50px;">
						<input type="number" value="${elem.moveDirY !== undefined ? elem.moveDirY : 0}" onchange="updateOtherCubeProp('${elem.id}','moveDirY',parseInt(this.value))" style="width:50px;">
						<input type="number" value="${elem.moveDirZ !== undefined ? elem.moveDirZ : 0}" onchange="updateOtherCubeProp('${elem.id}','moveDirZ',parseInt(this.value))" style="width:50px;">
					</div>
					<div class="prop-row"><label>同步移动平台ID</label>
						<!--/*<input type="text" value="${elem.movingBlockSync}" onchange="updateOtherCubeProp('${elem.id}','movingBlockSync',this.value)" placeholder="MovingPlatform ID">*/-->
						<select onchange="updateOtherCubeProp('${elem.id}','movingBlockSync',this.value)" style="flex:2;">
							<option value="">无</option>
							${movingOpts.map(xmlid => `<option value="${xmlid}" ${elem.movingBlockSync===xmlid?'selected':''}>${xmlid}</option>`).join('')}
						</select>
					</div>
					<div class="sub-elem-section">
						<div class="sub-title">子元素 (仅非AutoHide模式有效)</div>
						<!-- 子 MovingPlatform -->
						<div style="margin:6px 0;">
							<span style="color:#8ab4f8;">子 MovingPlatform</span>
							<button class="add-btn" onclick="addOtherCubeSubMP('${elem.id}')">+ 添加</button>
						</div>
						<div class="waypoint-list" id="otherCubeSubMPList">
							${subMPs.map((mp, idx) => `
								<div class="waypoint-item" style="border-bottom:1px solid #2a3a5a;">
									<span class="wp-label">#${idx+1}</span>
									<input type="text" value="${mp.autoStart}" placeholder="AutoStart" style="width:60px;" onchange="updateOtherCubeSubMPProp('${elem.id}',${idx},'autoStart',this.value==='true')">
									<label>循环索引</label>
									<input type="number" value="${mp.loopStartIndex}" onchange="updateOtherCubeSubMPProp('${elem.id}',${idx},'loopStartIndex',parseInt(this.value))" style="width:50px;">
									<label>完整方块</label>
									<input type="checkbox" ${mp.fullBlock?'checked':''} onchange="updateOtherCubeSubMPProp('${elem.id}',${idx},'fullBlock',this.checked)">
									<button style="background:#a03030;border:none;color:#fff;border-radius:3px;cursor:pointer;padding:0 8px;" onclick="removeOtherCubeSubMP('${elem.id}',${idx})">✕</button>
								</div>
							`).join('')}
						</div>
						<!-- 子 Button -->
						<div style="margin:6px 0;">
							<span style="color:#8ab4f8;">子 Button</span>
							<button class="add-btn" onclick="addOtherCubeSubButton('${elem.id}')">+ 添加</button>
						</div>
						<div class="waypoint-list" id="otherCubeSubButtonList">
							${subBtns.map((btn, idx) => `
								<div class="waypoint-item" style="border-bottom:1px solid #2a3a5a;">
									<span class="wp-label">#${idx+1}</span>
									<label>可见</label>
									<input type="checkbox" ${btn.visible?'checked':''} onchange="updateOtherCubeSubButtonProp('${elem.id}',${idx},'visible',this.checked)">
									<label>禁用次数</label>
									<input type="number" value="${btn.disableCount}" onchange="updateOtherCubeSubButtonProp('${elem.id}',${idx},'disableCount',parseInt(this.value))" style="width:50px;">
									<label>模式</label>
									<select onchange="updateOtherCubeSubButtonProp('${elem.id}',${idx},'mode',this.value)">
										<option value="StayDown" ${btn.mode==='StayDown'?'selected':''}>StayDown</option>
										<option value="StayUp" ${btn.mode==='StayUp'?'selected':''}>StayUp</option>
										<option value="Toggle" ${btn.mode==='Toggle'?'selected':''}>Toggle</option>
									</select>
									<br>
									<span class="chk-title">影响移动平台 (多选)</span>
									<div class="chk-group" style="flex:1;">
										${allMovingIds.map(mid => `<label><input type="checkbox" ${(btn.affectMoving||'').split(',').includes(mid)?'checked':''} onchange="updateOtherCubeSubButtonChecklist('${elem.id}',${idx},'affectMoving','${mid}',this.checked)">${mid}</label>`).join('')}
									</div>
									<div style="width:100%;margin-top:2px;">
										<span class="chk-title">影响撞击器 (多选)</span>
										<div class="chk-group" style="flex:1;">
											${state.bumpers.map(b => `<label><input type="checkbox" ${(btn.affectBumpers||'').split(',').includes(b.id)?'checked':''} onchange="updateOtherCubeSubButtonChecklist('${elem.id}',${idx},'affectBumpers','${b.id}',this.checked)">${b.id}</label>`).join('')}
										</div>
									</div>
									<div style="width:100%;margin-top:2px;">
										<span class="chk-title">影响按钮 (多选)</span>
										<div class="chk-group" style="flex:1;">
											${allButtonIds.map(bid => `<label><input type="checkbox" ${(btn.affectButtons||'').split(',').includes(bid)?'checked':''} onchange="updateOtherCubeSubButtonChecklist('${elem.id}',${idx},'affectButtons','${bid}',this.checked)">${bid}</label>`).join('')}
										</div>
									</div>
									<button style="background:#a03030;border:none;color:#fff;border-radius:3px;cursor:pointer;padding:0 8px;" onclick="removeOtherCubeSubButton('${elem.id}',${idx})">✕</button>
								</div>
							`).join('')}
						</div>
						<!-- KeyEvents -->
						<div style="margin:6px 0;">
							<span style="color:#8ab4f8;">按键事件</span>
							<button class="add-btn" onclick="addOtherCubeKeyEvent('${elem.id}')">+ 添加</button>
							<button class="add-btn" style="background:#a03030;" onclick="clearKeyEvents('${elem.id}','${realType}')">清空</button>
							<div style="margin-top:8px; display:flex; gap:4px; align-items:flex-start;">
								<textarea id="keyEventInput_${elem.id}" rows="3" style="flex:1; background:#0f3460; border:1px solid #1a4a7a; color:#eee; padding:4px; border-radius:4px; font-family:monospace; font-size:12px;" placeholder="每行一个事件，格式如：&#10;WestDown 14&#10;&lt;EastUp TimeOffset=&quot;8&quot; /&gt;"></textarea>
								<button class="add-btn" onclick="addKeyEventsFromText('${elem.id}','${realType}')" style="white-space:nowrap;">导入</button>
							</div>
						</div>
						<div class="waypoint-list" id="otherCubeKeyEventList">
							${keyEvents.map((ke, idx) => `
								<div class="waypoint-item" style="border-bottom:1px solid #2a3a5a;">
									<span class="wp-label">#${idx+1}</span>
									<label>方向</label>
									<select onchange="updateOtherCubeKeyEventProp('${elem.id}',${idx},'dir',this.value)">
										<option value="West" ${ke.dir==='West'?'selected':''}>West</option>
										<option value="East" ${ke.dir==='East'?'selected':''}>East</option>
										<option value="North" ${ke.dir==='North'?'selected':''}>North</option>
										<option value="South" ${ke.dir==='South'?'selected':''}>South</option>
									</select>
									<label>类型</label>
									<select onchange="updateOtherCubeKeyEventProp('${elem.id}',${idx},'type',this.value)">
										<option value="Up" ${ke.type==='Up'?'selected':''}>Up</option>
										<option value="Down" ${ke.type==='Down'?'selected':''}>Down</option>
									</select>
									<label>TimeOffset</label>
									<input type="number" value="${ke.timeOffset}" onchange="updateOtherCubeKeyEventProp('${elem.id}',${idx},'timeOffset',parseInt(this.value))" style="width:60px;">
									<button style="background:#a03030;border:none;color:#fff;border-radius:3px;cursor:pointer;padding:0 8px;" onclick="removeOtherCubeKeyEvent('${elem.id}',${idx})">✕</button>
								</div>
							`).join('')}
						</div>
					</div>
				`;
				panelContent.innerHTML = html;
				break;
			}

			case 'darkcube': {
				const movingOpts = state.movingPlatforms.filter(m => m.xmlId).map(m => m.xmlId);
				const keyEvents = elem.keyEvents || [];
				html += `
					<div class="prop-row"><label>触发点 (X,Y,Z)</label>
						<input type="number" value="${elem.triggerX}" onchange="updateDarkCubeProp('${elem.id}','triggerX',parseInt(this.value))" style="width:50px;">
						<input type="number" value="${elem.triggerY}" onchange="updateDarkCubeProp('${elem.id}','triggerY',parseInt(this.value))" style="width:50px;">
						<input type="number" value="${elem.triggerZ}" max="${state.level.size.h-1}" onchange="updateDarkCubeProp('${elem.id}','triggerZ',parseInt(this.value))" style="width:50px;">
					</div>
					<div class="prop-row"><label>方块位置 (X,Y,Z)</label>
						<input type="number" value="${elem.cubeX}" onchange="updateDarkCubeProp('${elem.id}','cubeX',parseInt(this.value))" style="width:50px;">
						<input type="number" value="${elem.cubeY}" onchange="updateDarkCubeProp('${elem.id}','cubeY',parseInt(this.value))" style="width:50px;">
						<input type="number" value="${elem.cubeZ}" max="${state.level.size.h-1}" onchange="updateDarkCubeProp('${elem.id}','cubeZ',parseInt(this.value))" style="width:50px;">
					</div>
					<div class="prop-row"><label>半径 (X,Y)</label>
						<input type="number" value="${elem.radiusX}" min="0" onchange="updateDarkCubeProp('${elem.id}','radiusX',parseInt(this.value))" style="width:50px;">
						<input type="number" value="${elem.radiusY}" min="0" onchange="updateDarkCubeProp('${elem.id}','radiusY',parseInt(this.value))" style="width:50px;">
					</div>
					<div class="prop-row"><label>同步移动平台ID</label>
						<!--/*<input type="text" value="${elem.movingBlockSync}" onchange="updateDarkCubeProp('${elem.id}','movingBlockSync',this.value)" placeholder="MovingPlatform ID">*/-->
						<select onchange="updateDarkCubeProp('${elem.id}','movingBlockSync',this.value)" style="flex:2;">
							<option value="">无</option>
							${movingOpts.map(xmlid => `<option value="${xmlid}" ${elem.movingBlockSync===xmlid?'selected':''}>${xmlid}</option>`).join('')}
						</select>
					</div>
					<div class="sub-elem-section">
						<div class="sub-title">按键事件</div>
						<button class="add-btn" onclick="addDarkCubeKeyEvent('${elem.id}')">+ 添加</button>
						<button class="add-btn" style="background:#a03030;" onclick="clearKeyEvents('${elem.id}','${realType}')">清空</button>
						<div style="margin-top:8px; display:flex; gap:4px; align-items:flex-start;">
							<textarea id="keyEventInput_${elem.id}" rows="3" style="flex:1; background:#0f3460; border:1px solid #1a4a7a; color:#eee; padding:4px; border-radius:4px; font-family:monospace; font-size:12px;" placeholder="每行一个事件，格式如：&#10;WestDown 14&#10;&lt;EastUp TimeOffset=&quot;8&quot; /&gt;"></textarea>
							<button class="add-btn" onclick="addKeyEventsFromText('${elem.id}','${realType}')" style="white-space:nowrap;">导入</button>
						</div>
						<div class="waypoint-list" id="darkCubeKeyEventList">
							${keyEvents.map((ke, idx) => `
								<div class="waypoint-item" style="border-bottom:1px solid #2a3a5a;">
									<span class="wp-label">#${idx+1}</span>
									<label>方向</label>
									<select onchange="updateDarkCubeKeyEventProp('${elem.id}',${idx},'dir',this.value)">
										<option value="West" ${ke.dir==='West'?'selected':''}>West</option>
										<option value="East" ${ke.dir==='East'?'selected':''}>East</option>
										<option value="North" ${ke.dir==='North'?'selected':''}>North</option>
										<option value="South" ${ke.dir==='South'?'selected':''}>South</option>
									</select>
									<label>类型</label>
									<select onchange="updateDarkCubeKeyEventProp('${elem.id}',${idx},'type',this.value)">
										<option value="Up" ${ke.type==='Up'?'selected':''}>Up</option>
										<option value="Down" ${ke.type==='Down'?'selected':''}>Down</option>
									</select>
									<label>TimeOffset</label>
									<input type="number" value="${ke.timeOffset}" onchange="updateDarkCubeKeyEventProp('${elem.id}',${idx},'timeOffset',parseInt(this.value))" style="width:60px;">
									<button style="background:#a03030;border:none;color:#fff;border-radius:3px;cursor:pointer;padding:0 8px;" onclick="removeDarkCubeKeyEvent('${elem.id}',${idx})">✕</button>
								</div>
							`).join('')}
						</div>
					</div>
				`;
				panelContent.innerHTML = html;
				break;
			}

			default:
				panelContent.innerHTML = `<div class="empty-msg">未知元素类型</div>`;
		}
		
	} finally {
		// 恢复滚动位置（确保在 DOM 更新后执行）
		requestAnimationFrame(() => {
			panelContent.scrollTop = savedScrollTop;
			// 恢复子列表滚动位置
			const seqList2 = document.getElementById('seqButtonList');
			if (seqList2) {
				seqList2.scrollTop = savedSeqScrollTop;
			}
			// ===== 新增：恢复 wpList 滚动位置 =====
            const wpList2 = document.getElementById('wpList');
            if (wpList2) {
                wpList2.scrollTop = savedWpScrollTop;
            }
            // ===== 新增结束 =====

		});
		fixFormFieldAssociations(panelContent);
	}
}
