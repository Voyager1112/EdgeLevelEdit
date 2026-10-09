// 导出PNG
function exportPNG() {
	const { w, l, h } = state.level.size;
	const baseName = state.level.name || 'level';
	let exported = 0;
	for (let z = 0; z < h; z++) {
		const layer = state.staticBlocks[z];
		// 检查该层是否有任何静态方块
		let hasBlock = false;
		if (layer) {
			for (let y = 0; y < l; y++) {
				for (let x = 0; x < w; x++) {
					if (layer[y] && layer[y][x]) { hasBlock = true; break; }
				}
				if (hasBlock) break;
			}
		}
		if (!hasBlock) continue; // 跳过无方块层
		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = l;
		const ctx = canvas.getContext('2d');
		const imageData = ctx.createImageData(w, l);
		const data = imageData.data;
		for (let y = 0; y < l; y++) {
			for (let x = 0; x < w; x++) {
				const idx = (y * w + x) * 4;
				const block = layer && layer[y] && layer[y][x];
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
		canvas.toBlob(function(blob) {
			downloadFile(blob, `${baseName}.${z}.png`);
		}, 'image/png');
		exported++;
	}
	showToast(`已导出 ${exported} 个PNG文件 (${baseName}.z.png)`);
}

// 导出XML（含OtherCube, DarkCube）
function generateXMLString() {
	const lv = state.level;
	// ★ 只转义"裸 &"，保留 &#10; 这类实体引用原样输出
	const safeName = String(lv.name || '')
		.replace(/&(?!(#[0-9]+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);)/g, '&amp;')
		.replace(/"/g, '&quot;');
	let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
	let levelAttrs = ` ID="${lv.id}" Name="${safeName}" TimeThresholds="${lv.timeThresholds.join(',')}"\n`;
	levelAttrs += `       Size="${lv.size.w}x${lv.size.l}x${lv.size.h}" SpawnPoint="${formatCoord(lv.spawn)}" ExitPoint="${formatCoord(lv.exit)}"\n`;
	levelAttrs += `       Theme="${lv.theme}" MusicJava="${lv.musicJava}" Music="${lv.music}" Zoom="${lv.zoom}"`;

	// 根据 state.levelUseAngle 输出
	if (state.levelUseAngle) {
		if (lv.angle !== undefined && lv.angle !== null && !isNaN(lv.angle)) {
			levelAttrs += ` Angle="${lv.angle}"`;
		}
	} else {
		if (lv.fov !== undefined && lv.fov !== null && !isNaN(lv.fov)) {
			levelAttrs += ` FieldOfView="${lv.fov}"`;
		}
	}
	if ('modelTheme' in lv) levelAttrs += ` ModelTheme="${lv.modelTheme}"`;

	xml += `<Level${levelAttrs}>\n`;

	// ===== 移动平台 =====
	state.movingPlatforms.forEach(m => {
		let attrs = '';
		if (m.xmlId) attrs += ` ID="${m.xmlId}"`;
		if ('autoStart' in m) attrs += ` AutoStart="${m.autoStart}"`;
		if ('loopStartIndex' in m) attrs += ` LoopStartIndex="${m.loopStartIndex}"`;
		if ('fullBlock' in m) attrs += ` FullBlock="${m.fullBlock}"`;
		if (m.relatedTo) attrs += ` RelatedTo="${m.relatedTo}"`;
		if (m.offset) attrs += ` Offset="${m.offset}"`;
		xml += `  <MovingPlatform${attrs}>\n`;
		if (m.waypoints && (!m.relatedTo || (m.relatedTo && !m.hideWaypoints))) {
			m.waypoints.forEach(wp => {
				const exportZ = wp.z + 1;
				let wpAttrs = ` Position="${wp.x},${wp.y},${exportZ}"`;
				if ('travelTime' in wp) wpAttrs += ` TravelTime="${wp.travelTime}"`;
				if ('pauseTime' in wp) wpAttrs += ` PauseTime="${wp.pauseTime}"`;
				xml += `    <Waypoint${wpAttrs} />\n`;
			});
		} 
		xml += `  </MovingPlatform>\n`;
	});

	// ===== 掉落平台 =====
	state.fallingPlatforms.forEach(m => {
		let attrs = ` Position="${m.x},${m.y},${m.z+1}"`;
		if ('floatTime' in m) attrs += ` FloatTime="${m.floatTime}"`;
		if (m.xmlId) attrs += ` ID="${m.xmlId}"`;
		xml += `  <FallingPlatform${attrs} />\n`;
	});

	// ===== 棱柱 =====
	state.prisms.forEach(m => {
		let attrs = ` Position="${m.x},${m.y},${m.z}"`;
		if ('energy' in m) attrs += ` Energy="${m.energy}"`;
		if (m.xmlId) attrs += ` ID="${m.xmlId}"`;
		xml += `  <Prism${attrs} />\n`;
	});

	// ===== 尺寸调整器 =====
	state.resizers.forEach(m => {
		const tag = m.type === 'grow' ? 'ResizerGrow' : 'ResizerShrink';
		let attrs = ` Position="${m.x},${m.y},${m.z}"`;
		if ('visible' in m) attrs += ` Visible="${m.visible}"`;
		if ('radiusX' in m || 'radiusY' in m) {
			const rx = m.radiusX || 0;
			const ry = m.radiusY || 0;
			attrs += ` Radius="${rx},${ry}"`;
		}
		if (m.xmlId) attrs += ` ID="${m.xmlId}"`;
		xml += `  <${tag}${attrs} />\n`;
	});

	// ===== 撞击器 =====
	state.bumpers.forEach(m => {
		let attrs = ` Position="${m.x},${m.y},${m.z}"`;
		if ('enabled' in m) attrs += ` Enabled="${m.enabled}"`;
		if (m.xmlId) attrs += ` ID="${m.xmlId}"`;
		xml += `  <Bumper${attrs}>\n`;
		['north','east','south','west'].forEach(dir => {
			const d = m[dir];
			if (d && d.enabled) {
				const tag = dir.charAt(0).toUpperCase() + dir.slice(1);
				let dirAttrs = '';
				if ('startDelay' in d) dirAttrs += ` StartDelay="${d.startDelay}"`;
				if ('pulseRate' in d) dirAttrs += ` PulseRate="${d.pulseRate}"`;
				xml += `    <${tag}${dirAttrs} />\n`;
			}
		});
		xml += `  </Bumper>\n`;
	});

	// ===== 存档点 =====
	state.checkpoints.forEach(m => {
		let attrs = ` Position="${m.x},${m.y},${m.z}"`;
		if ('respawnZ' in m) attrs += ` RespawnZ="${m.respawnZ}"`;
		if ('radiusX' in m || 'radiusY' in m) {
			const rx = m.radiusX || 0;
			const ry = m.radiusY || 0;
			attrs += ` Radius="${rx},${ry}"`;
		}
		if (m.xmlId) attrs += ` ID="${m.xmlId}"`;
		xml += `  <Checkpoint${attrs} />\n`;
	});

	// ===== 相机触发 =====
	state.cameraTriggers.forEach(m => {
		let attrs = ` Position="${m.x},${m.y},${m.z}"`;
		if ('radiusX' in m || 'radiusY' in m) {
			const rx = m.radiusX || 0;
			const ry = m.radiusY || 0;
			attrs += ` Radius="${rx},${ry}"`;
		}
		if ('zoom' in m) attrs += ` Zoom="${m.zoom}"`;
		if ('useAngle' in m) {
			if (m.useAngle) {
				if ('angle' in m) attrs += ` Angle="${m.angle}"`;
			} else {
				if ('fov' in m) attrs += ` FieldOfView="${m.fov}"`;
			}
		} else {
			// 默认使用Angle
			if ('angle' in m) attrs += ` Angle="${m.angle}"`;
		}
		if ('startDelay' in m) attrs += ` StartDelay="${m.startDelay}"`;
		if ('duration' in m) attrs += ` Duration="${m.duration}"`;
		if ('singleUse' in m) attrs += ` SingleUse="${m.singleUse}"`;
		if (m.xmlId) attrs += ` ID="${m.xmlId}"`;
		xml += `  <CameraTrigger${attrs} />\n`;
	});

	// ===== 按钮 =====
	state.buttons.forEach(m => {
		let attrs = '';
		if (m.xmlId) attrs += ` ID="${m.xmlId}"`;
		if ('visible' in m) {
			if (m.visible === null) attrs += ' Visible="null"';
			else attrs += ` Visible="${m.visible}"`;
		}
		if ('disableCount' in m) attrs += ` DisableCount="${m.disableCount}"`;
		if ('mode' in m) attrs += ` Mode="${m.mode}"`;
        if (m.movingPlatformID) {
            attrs += ` MovingPlatformID="${m.movingPlatformID}"`;
        } else {
            const px = (m.x === null || m.x === undefined) ? 0 : m.x;
            const py = (m.y === null || m.y === undefined) ? 0 : m.y;
            const pz = (m.z === null || m.z === undefined) ? 0 : m.z;
            attrs += ` Position="${px},${py},${pz}"`;
        }
		if (m.affectMoving) attrs += ` AffectMovingPlatforms="${m.affectMoving}"`;
		if (m.affectBumpers) attrs += ` AffectBumpers="${m.affectBumpers}"`;
		if (m.triggerAchievements) attrs += ` TriggerAchievements="${m.triggerAchievements}"`;
		if (m.affectButtons) attrs += ` AffectButtons="${m.affectButtons}"`;
		xml += `  <Button${attrs} />\n`;
	});

	// ===== 按钮序列 =====
	state.buttonSequences.forEach(m => {
		let attrs = '';
		if (m.xmlId) attrs += ` ID="${m.xmlId}"`;
		if ('sequenceInOrder' in m) attrs += ` SequenceInOrder="${m.sequenceInOrder}"`;
		if (m.affectMoving) attrs += ` AffectMovingPlatforms="${m.affectMoving}"`;
		if (m.affectBumpers) attrs += ` AffectBumpers="${m.affectBumpers}"`;
		if (m.triggerAchievements) attrs += ` TriggerAchievements="${m.triggerAchievements}"`;
		if (m.affectButtons) attrs += ` AffectButtons="${m.affectButtons}"`;
		xml += `  <ButtonSequence${attrs}>\n`;
		if (m.buttons && m.buttons.length) {
			m.buttons.forEach(btn => {
				let btnAttrs = '';
				if (btn.xmlId) btnAttrs += ` ID="${btn.xmlId}"`;
				if ('visible' in btn) {
					if (btn.visible === null) btnAttrs += ' Visible="null"';
					else btnAttrs += ` Visible="${btn.visible}"`;
				}
                if (btn.movingPlatformID) {
                    btnAttrs += ` MovingPlatformID="${btn.movingPlatformID}"`;
                } else if (btn.position) {
                    const px = (btn.position.x === null || btn.position.x === undefined) ? 0 : btn.position.x;
                    const py = (btn.position.y === null || btn.position.y === undefined) ? 0 : btn.position.y;
                    const pz = (btn.position.z === null || btn.position.z === undefined) ? 0 : btn.position.z;
                    btnAttrs += ` Position="${px},${py},${pz}"`;
                }
				xml += `    <Button${btnAttrs} />\n`;
			});
		}
		xml += `  </ButtonSequence>\n`;
	});

	// ===== OtherCube =====
	state.otherCubes.forEach(m => {
		let attrs = ` PositionTrigger="${m.triggerX},${m.triggerY},${m.triggerZ}" PositionCube="${m.cubeX},${m.cubeY},${m.cubeZ}"`;
		if (m.xmlId) attrs += ` ID="${m.xmlId}"`;
		const rx = m.radiusX || 0;
		const ry = m.radiusY || 0;
		if (rx > 0 || ry > 0) {
			attrs += ` Radius="${rx},${ry}"`;
		}
		if ('mode' in m && m.mode !== 'AutoHide') attrs += ` Mode="${m.mode}"`;
		if ('moveDirX' in m || 'moveDirY' in m || 'moveDirZ' in m) {
			const dx = m.moveDirX || 0;
			const dy = m.moveDirY || -1;
			const dz = m.moveDirZ || 0;
			if (dx !== 0 || dy !== -1 || dz !== 0) attrs += ` MoveDirection="${dx},${dy},${dz}"`;
		}
		if (m.movingBlockSync) attrs += ` MovingBlockSync="${m.movingBlockSync}"`;
		xml += `  <OtherCube${attrs}>\n`;
		if (m.subMovingPlatforms && m.subMovingPlatforms.length) {
			m.subMovingPlatforms.forEach(sp => {
				let spAttrs = '';
				if ('autoStart' in sp) spAttrs += ` AutoStart="${sp.autoStart}"`;
				if ('loopStartIndex' in sp) spAttrs += ` LoopStartIndex="${sp.loopStartIndex}"`;
				if ('fullBlock' in sp) spAttrs += ` FullBlock="${sp.fullBlock}"`;
				xml += `    <MovingPlatform${spAttrs}>\n    </MovingPlatform>\n`;
			});
		}
		if (m.subButtons && m.subButtons.length) {
			m.subButtons.forEach(sb => {
				let btnAttrs = '';
				if ('visible' in sb) btnAttrs += ` Visible="${sb.visible}"`;
				if ('disableCount' in sb) btnAttrs += ` DisableCount="${sb.disableCount}"`;
				if ('mode' in sb) btnAttrs += ` Mode="${sb.mode}"`;
				if (sb.affectMoving) btnAttrs += ` AffectMovingPlatforms="${sb.affectMoving}"`;
				if (sb.affectBumpers) btnAttrs += ` AffectBumpers="${sb.affectBumpers}"`;
				if (sb.triggerAchievements) btnAttrs += ` TriggerAchievements="${sb.triggerAchievements}"`;
				if (sb.affectButtons) btnAttrs += ` AffectButtons="${sb.affectButtons}"`;
				xml += `    <Button${btnAttrs} />\n`;
			});
		}
		if (m.keyEvents && m.keyEvents.length) {
			m.keyEvents.forEach(ke => {
				let keAttrs = '';
				if ('timeOffset' in ke) keAttrs += ` TimeOffset="${ke.timeOffset}"`;
				xml += `    <${ke.dir}${ke.type}${keAttrs} />\n`;
			});
		}
		xml += `  </OtherCube>\n`;
	});

	// ===== DarkCube =====
	state.darkCubes.forEach(m => {
		let attrs = ` PositionTrigger="${m.triggerX},${m.triggerY},${m.triggerZ}" PositionCube="${m.cubeX},${m.cubeY},${m.cubeZ}"`;
		if (m.xmlId) attrs += ` ID="${m.xmlId}"`;
		const rx = m.radiusX || 0;
		const ry = m.radiusY || 0;
		if (rx > 0 || ry > 0) {
			attrs += ` Radius="${rx},${ry}"`;
		}
		if (m.movingBlockSync) attrs += ` MovingBlockSync="${m.movingBlockSync}"`;
		xml += `  <DarkCube${attrs}>\n`;
		if (m.keyEvents && m.keyEvents.length) {
			m.keyEvents.forEach(ke => {
				let keAttrs = '';
				if ('timeOffset' in ke) keAttrs += ` TimeOffset="${ke.timeOffset}"`;
				xml += `    <${ke.dir}${ke.type}${keAttrs} />\n`;
			});
		}
		xml += `  </DarkCube>\n`;
	});

	state.unknownElements.forEach(unk => {
		xml += `  ${unk}\n`;
	});

	xml += `</Level>`;
	return xml;
}

function exportXML() {
	const xml = generateXMLString();
	const blob = new Blob([xml], { type: 'text/xml' });
	downloadFile(blob, `${state.level.name}.xml`);
	showToast(`XML 导出成功: ${state.level.name}.xml`);
}

// 加载XML+PNG（支持新元素）
function loadXMLAndPNG(files) {
    // 兼容 FileList / 数组，快照为真数组，避免后续被清空
    files = Array.from(files);

    // ★ 导入全过程只记一次 undo
    const importBeforeSnap = _serializeHistory();
    const importPrevSuppressUndo = state._suppressUndo;
    state._suppressUndo = true;
    // 结束导入并记一次 undo 的辅助函数
    function _finishImport() {
        state._suppressUndo = importPrevSuppressUndo;
        const afterSnap = _serializeHistory();
        if (importBeforeSnap !== afterSnap) {
            state._undoStack = state._undoStack || [];
            state._redoStack = state._redoStack || [];
            state._undoStack.push(importBeforeSnap);
            while (state._undoStack.length > 50) state._undoStack.shift();
            state._redoStack.length = 0;
        }
        state._lastSavedSnapshot = afterSnap;
    }

    if (!state._idCounters) state._idCounters = {};
    state.nextIdCounter = 1;
    state._idCounters = {};

    let xmlFile = null;
    const pngFiles = [];
    for (const f of files) {
        const lower = f.name.toLowerCase();
        if (lower.endsWith('.xml')) {
            if (!xmlFile) xmlFile = f;
        } else if (lower.endsWith('.png')) {
            pngFiles.push(f);
        }
    }
    if (!xmlFile) {
        showToast('未找到XML文件');
        return;
    }
    
    // ★ 导入模式处理
    if (state.settings && state.settings.importNewProject) {
        if (window.PM && window.PM.sync) window.PM.sync();
        if (typeof createProject === 'function' && typeof setCurrentProjectId === 'function') {
            const baseName = xmlFile.name.replace(/\.xml$/i, '');
            const projName = prompt('新项目名：', baseName) || baseName;
            const pid = createProject(projName);
            setCurrentProjectId(pid);
            // 清空当前编辑状态，避免旧元素混入
            if (typeof newProject === 'function') {
                // 临时关掉保存，防止 newProject 里触发 saveCache 又把数据写回
                const prev = state._suppressUI;
                state._suppressUI = true;
                newProject();
                state._suppressUI = prev;
            }
            showToast(`已创建项目：${projName}`);
        }
    }

	const xmlBaseName = xmlFile.name.replace(/\.xml$/i, '');

	// 辅助：忽略大小写获取属性值
	function getAttrCaseInsensitive(el, attrName) {
		const attrs = el.attributes;
		for (let i = 0; i < attrs.length; i++) {
			if (attrs[i].name.toLowerCase() === attrName.toLowerCase()) {
				return attrs[i].value;
			}
		}
		return null;
	}
	// 辅助：获取所有子元素中标签名忽略大小写匹配的元素数组
	function getChildrenByTagNameIgnoreCase(parent, tagName) {
		return Array.from(parent.children).filter(el => el.tagName.toLowerCase() === tagName.toLowerCase());
	}
	// 辅助：获取第一个子元素中标签名忽略大小写匹配的元素
	function getChildByTagNameIgnoreCase(parent, tagName) {
		return Array.from(parent.children).find(el => el.tagName.toLowerCase() === tagName.toLowerCase());
	}

	const reader = new FileReader();
	reader.onload = function(e) {
		try {
			const text = e.target.result;
			const parser = new DOMParser();
			const doc = parser.parseFromString(text, 'text/xml');
			// 忽略大小写查找 Level 元素
			let levelNode = null;
			for (let el of doc.children) {
				if (el.tagName && el.tagName.toLowerCase() === 'level') {
					levelNode = el;
					break;
				}
			}
			if (!levelNode) { showToast('未找到Level元素'); return; }

			// 替换原来的 getAttr
			function getAttrIgnoreCase(name, def) {
				const val = getAttrCaseInsensitive(levelNode, name);
				return val !== null ? val : def;
			}
			// 然后所有 getAttr(...) 替换为 getAttrIgnoreCase(...)
			const id = getAttrIgnoreCase('ID', '10001');
			const name = getAttrIgnoreCase('Name', 'MyLevel');
			const timeStr = getAttrIgnoreCase('TimeThresholds', '9,25,55,85,145');
			const times = timeStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
			if (times.length !== 5) { showToast('时间阈值格式错误'); return; }
			const sizeStr = getAttrIgnoreCase('Size', '10x10x3');
			const sizeParts = sizeStr.split('x').map(s => parseInt(s.trim()));
			if (sizeParts.length !== 3) { showToast('Size格式错误'); return; }
			const [w, l, h] = sizeParts;
			const spawnStr = getAttrIgnoreCase('SpawnPoint', '3,5,1');
			const spawn = parseCoord(spawnStr);
			if (!spawn) { showToast('SpawnPoint格式错误'); return; }
			const exitStr = getAttrIgnoreCase('ExitPoint', '7,5,1');
			const exit = parseCoord(exitStr);
			if (!exit) { showToast('ExitPoint格式错误'); return; }
            const themeV = parseInt(getAttrIgnoreCase('Theme', '0'));
            const theme = isNaN(themeV) ? 0 : clamp(themeV, 0, 3);

            const musicJavaV = parseInt(getAttrIgnoreCase('MusicJava', '0'));
            const musicJava = isNaN(musicJavaV) ? 0 : clamp(musicJavaV, 0, 11);

            const musicV = parseInt(getAttrIgnoreCase('Music', '6'));
            const music = isNaN(musicV) ? 6 : clamp(musicV, 0, 24);

            const zoomV = parseInt(getAttrIgnoreCase('Zoom', '-1'));
            const zoom = isNaN(zoomV) ? -1 : zoomV;
			// 读取 Angle 和 FieldOfView，不赋默认值
			let useAngle = false;
			let angleVal = undefined, fovVal = undefined;

			const angleAttr = getAttrCaseInsensitive(levelNode, 'Angle');
			const fovAttr = getAttrCaseInsensitive(levelNode, 'FieldOfView');

			if (angleAttr !== null) {
				useAngle = true;
				let v = parseInt(angleAttr);
				if (!isNaN(v)) angleVal = clamp(v, -184, 184);
			}
			if (fovAttr !== null) {
				let v = parseInt(fovAttr);
				if (!isNaN(v)) fovVal = clamp(v, 0, 184);
			}

			state.levelUseAngle = useAngle;
			if (angleVal !== undefined) state.level.angle = angleVal;
			else delete state.level.angle;
			if (fovVal !== undefined) state.level.fov = fovVal;
			else delete state.level.fov;
			let modelTheme = parseInt(getAttrIgnoreCase('ModelTheme', '' + theme));
			if (isNaN(modelTheme) || modelTheme < 0) modelTheme = theme;

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
			state.level.modelTheme = modelTheme;

			updateCanvasRangeFromSize();

			const newStatic = {};
			for (let z = 0; z < h; z++) {
				newStatic[z] = Array.from({ length: l }, () => Array(w).fill(null));
			}
			state.staticBlocks = newStatic;

			// 重置所有元素
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

			const children = levelNode.children;
			// ===== 替换 for (let child of children) 内部的全部代码 =====
			for (let child of children) {
				const tag = child.tagName.toLowerCase();
				try {
					if (tag === 'movingplatform') {
						const m = { id: generateInternalId('M'), waypoints: [] };
						const idVal = getAttrCaseInsensitive(child, 'ID');
						if (idVal !== null) m.xmlId = idVal;
						const autoStartVal = getAttrCaseInsensitive(child, 'AutoStart');
						if (autoStartVal !== null) m.autoStart = autoStartVal.toLowerCase() !== 'false';
						const loopVal = getAttrCaseInsensitive(child, 'LoopStartIndex');
						if (loopVal !== null) {
							let v = parseInt(loopVal);
							if (!isNaN(v)) m.loopStartIndex = v;
						}
						const fullVal = getAttrCaseInsensitive(child, 'FullBlock');
						if (fullVal !== null) m.fullBlock = fullVal.toLowerCase() !== 'false';
						const relatedVal = getAttrCaseInsensitive(child, 'RelatedTo');
						if (relatedVal !== null) m.relatedTo = relatedVal;
						const offsetVal = getAttrCaseInsensitive(child, 'Offset');
						if (offsetVal !== null) m.offset = offsetVal;

						const wpNodes = getChildrenByTagNameIgnoreCase(child, 'Waypoint');
						wpNodes.forEach(wp => {
							const pStr = getAttrCaseInsensitive(wp, 'Position');
							if (!pStr) return;
							const p = parseCoord(pStr);
							if (!p) return;
							const waypoint = { x: p.x, y: p.y, z: p.z - 1 };
							const travelVal = getAttrCaseInsensitive(wp, 'TravelTime');
							if (travelVal !== null) waypoint.travelTime = parseInt(travelVal);
							const pauseVal = getAttrCaseInsensitive(wp, 'PauseTime');
							if (pauseVal !== null) waypoint.pauseTime = parseInt(pauseVal);
							m.waypoints.push(waypoint);
						});
						if (m.waypoints.length === 0) {
							m.waypoints.push({ x: 0, y: 0, z: 0, travelTime: 0, pauseTime: 0 });
						}
						const pos = getMovingPos(m);
						if (pos && typeof pos.x === 'number' && typeof pos.y === 'number' && typeof pos.z === 'number' && !isNaN(pos.x) && !isNaN(pos.y) && !isNaN(pos.z)) {
							state.movingPlatforms.push(m);
						}
					}
					else if (tag === 'fallingplatform') {
						const posStr = getAttrCaseInsensitive(child, 'Position');
						if (posStr) {
							const pos = parseCoord(posStr);
							if (pos) {
								const m = { id: generateInternalId('F') };
								const idVal = getAttrCaseInsensitive(child, 'ID');
								if (idVal !== null) m.xmlId = idVal;
								const floatVal = getAttrCaseInsensitive(child, 'FloatTime');
								if (floatVal !== null) m.floatTime = parseInt(floatVal);
								m.x = pos.x; m.y = pos.y; m.z = pos.z - 1;
								if (typeof m.x === 'number' && typeof m.y === 'number' && typeof m.z === 'number' && !isNaN(m.x) && !isNaN(m.y) && !isNaN(m.z)) {
									state.fallingPlatforms.push(m);
								}
							}
						}
					}
					else if (tag === 'prism') {
						const posStr = getAttrCaseInsensitive(child, 'Position');
						if (posStr) {
							const pos = parseCoord(posStr);
							if (pos) {
								const m = { id: generateInternalId('P'), x: pos.x, y: pos.y, z: pos.z };
								const idVal = getAttrCaseInsensitive(child, 'ID');
								if (idVal !== null) m.xmlId = idVal;
								const energyVal = getAttrCaseInsensitive(child, 'Energy');
								if (energyVal !== null) m.energy = parseInt(energyVal);
								if (typeof m.x === 'number' && typeof m.y === 'number' && typeof m.z === 'number' && !isNaN(m.x) && !isNaN(m.y) && !isNaN(m.z)) {
									state.prisms.push(m);
								}
							}
						}
					}
					else if (tag === 'resizergrow' || tag === 'resizershrink') {
						const posStr = getAttrCaseInsensitive(child, 'Position');
						if (posStr) {
							const pos = parseCoord(posStr);
							if (pos) {
								const type = tag === 'resizergrow' ? 'grow' : 'shrink';
								const m = { id: generateInternalId('R'), x: pos.x, y: pos.y, z: pos.z, type };
								const idVal = getAttrCaseInsensitive(child, 'ID');
								if (idVal !== null) m.xmlId = idVal;
								const visibleVal = getAttrCaseInsensitive(child, 'Visible');
								if (visibleVal !== null) m.visible = visibleVal.toLowerCase() !== 'false';
								const radiusVal = getAttrCaseInsensitive(child, 'Radius');
								if (radiusVal !== null) {
									const parts = radiusVal.split(',').map(s => parseInt(s.trim()));
									if (parts.length >= 2) {
										if (!isNaN(parts[0])) m.radiusX = parts[0];
										if (!isNaN(parts[1])) m.radiusY = parts[1];
									}
								}
								if (typeof m.x === 'number' && typeof m.y === 'number' && typeof m.z === 'number' && !isNaN(m.x) && !isNaN(m.y) && !isNaN(m.z)) {
									state.resizers.push(m);
								}
							}
						}
					}
					else if (tag === 'bumper') {
						const posStr = getAttrCaseInsensitive(child, 'Position');
						if (posStr) {
							const pos = parseCoord(posStr);
							if (pos) {
								const m = { id: generateInternalId('B'), x: pos.x, y: pos.y, z: pos.z };
								const idVal = getAttrCaseInsensitive(child, 'ID');
								if (idVal !== null) m.xmlId = idVal;
								const enabledVal = getAttrCaseInsensitive(child, 'Enabled');
								if (enabledVal !== null) m.enabled = enabledVal.toLowerCase() !== 'false';
								['north','east','south','west'].forEach(d => {
									const sub = getChildByTagNameIgnoreCase(child, d);
									if (sub) {
										const dirObj = { enabled: true };
										const startVal = getAttrCaseInsensitive(sub, 'StartDelay');
										if (startVal !== null) dirObj.startDelay = parseInt(startVal);
										const pulseVal = getAttrCaseInsensitive(sub, 'PulseRate');
										if (pulseVal !== null) dirObj.pulseRate = parseInt(pulseVal);
										m[d] = dirObj;
									}
								});
								if (typeof m.x === 'number' && typeof m.y === 'number' && typeof m.z === 'number' && !isNaN(m.x) && !isNaN(m.y) && !isNaN(m.z)) {
									state.bumpers.push(m);
								}
							}
						}
					}
					else if (tag === 'checkpoint') {
						const posStr = getAttrCaseInsensitive(child, 'Position');
						if (posStr) {
							const pos = parseCoord(posStr);
							if (pos) {
								const m = { id: generateInternalId('CP'), x: pos.x, y: pos.y, z: pos.z };
								const idVal = getAttrCaseInsensitive(child, 'ID');
								if (idVal !== null) m.xmlId = idVal;
								const respawnVal = getAttrCaseInsensitive(child, 'RespawnZ');
								if (respawnVal !== null) {
									let v = parseInt(respawnVal);
									if (!isNaN(v)) m.respawnZ = v;
								}
								const radiusVal = getAttrCaseInsensitive(child, 'Radius');
								if (radiusVal !== null) {
									const parts = radiusVal.split(',').map(s => parseInt(s.trim()));
									if (parts.length >= 2) {
										if (!isNaN(parts[0])) m.radiusX = parts[0];
										if (!isNaN(parts[1])) m.radiusY = parts[1];
									}
								}
								if (typeof m.x === 'number' && typeof m.y === 'number' && typeof m.z === 'number' && !isNaN(m.x) && !isNaN(m.y) && !isNaN(m.z)) {
									state.checkpoints.push(m);
								}
							}
						}
					}
					else if (tag === 'cameratrigger') {
						const posStr = getAttrCaseInsensitive(child, 'Position');
						if (posStr) {
							const pos = parseCoord(posStr);
							if (pos) {
								const m = { id: generateInternalId('CT'), x: pos.x, y: pos.y, z: pos.z };
								const idVal = getAttrCaseInsensitive(child, 'ID');
								if (idVal !== null) m.xmlId = idVal;
								const radiusVal = getAttrCaseInsensitive(child, 'Radius');
								if (radiusVal !== null) {
									const parts = radiusVal.split(',').map(s => parseInt(s.trim()));
									if (parts.length >= 2) {
										if (!isNaN(parts[0])) m.radiusX = parts[0];
										if (!isNaN(parts[1])) m.radiusY = parts[1];
									}
								}
								const zoomVal = getAttrCaseInsensitive(child, 'Zoom');
								if (zoomVal !== null) m.zoom = parseInt(zoomVal);
								const angleVal = getAttrCaseInsensitive(child, 'Angle');
								const fovVal = getAttrCaseInsensitive(child, 'FieldOfView');
								if (angleVal !== null) {
									m.angle = parseInt(angleVal);
									m.useAngle = true;
								} else if (fovVal !== null) {
									m.fov = parseInt(fovVal);
									m.useAngle = false;
								}
								const startVal = getAttrCaseInsensitive(child, 'StartDelay');
								if (startVal !== null) m.startDelay = parseInt(startVal);
								const durVal = getAttrCaseInsensitive(child, 'Duration');
								if (durVal !== null) m.duration = parseInt(durVal);
								const singleVal = getAttrCaseInsensitive(child, 'SingleUse');
								if (singleVal !== null) m.singleUse = singleVal.toLowerCase() === 'true';
								if (typeof m.x === 'number' && typeof m.y === 'number' && typeof m.z === 'number' && !isNaN(m.x) && !isNaN(m.y) && !isNaN(m.z)) {
									state.cameraTriggers.push(m);
								}
							}
						}
					}
					else if (tag === 'button') {
						const m = { id: generateInternalId('Btn') };
						const idVal = getAttrCaseInsensitive(child, 'ID');
						if (idVal !== null) m.xmlId = idVal;
						const visibleVal = getAttrCaseInsensitive(child, 'Visible');
						if (visibleVal !== null) {
							const v = visibleVal.toLowerCase();
							if (v === 'null') m.visible = null;
							else m.visible = v !== 'false';
						}
						const disableVal = getAttrCaseInsensitive(child, 'DisableCount');
						if (disableVal !== null) m.disableCount = parseInt(disableVal);
						const modeVal = getAttrCaseInsensitive(child, 'Mode');
						if (modeVal !== null) {
							const modeLower = modeVal.toLowerCase();
							if (modeLower === 'toggle') m.mode = 'Toggle';
							else if (modeLower === 'stayup') m.mode = 'StayUp';
							else m.mode = 'StayDown';  // 默认
						}
						const mpIDVal = getAttrCaseInsensitive(child, 'MovingPlatformID');
						if (mpIDVal !== null) m.movingPlatformID = mpIDVal;
						m.affectMoving = getAttrCaseInsensitive(child, 'AffectMovingPlatforms') || '';
						m.affectBumpers = getAttrCaseInsensitive(child, 'AffectBumpers') || '';
						m.triggerAchievements = getAttrCaseInsensitive(child, 'TriggerAchievements') || '';
						m.affectButtons = getAttrCaseInsensitive(child, 'AffectButtons') || '';

						let pos = null;
						const posStr = getAttrCaseInsensitive(child, 'Position');
						if (posStr) {
							pos = parseCoord(posStr);
						}
						if (pos) {
							m.x = pos.x;
							m.y = pos.y;
							m.z = pos.z;
						} else {
							if (m.movingPlatformID) {
								// 有 MovingPlatformID，坐标用 null 表示无效，渲染时会优先使用 mpID
								m.x = null;
								m.y = null;
								m.z = null;
							} else {
								// 无 mpID，必须有坐标，设为默认 0
								m.x = 0;
								m.y = 0;
								m.z = 0;
							}
						}
						state.buttons.push(m);
					}
					else if (tag === 'buttonsequence') {
						const seq = {
							id: generateInternalId('BS'),
							buttons: []
						};
						const idVal = getAttrCaseInsensitive(child, 'ID');
						if (idVal !== null) seq.xmlId = idVal;
						const orderVal = getAttrCaseInsensitive(child, 'SequenceInOrder');
						if (orderVal !== null) seq.sequenceInOrder = orderVal.toLowerCase() === 'true';
						seq.affectMoving = getAttrCaseInsensitive(child, 'AffectMovingPlatforms') || '';
						seq.affectBumpers = getAttrCaseInsensitive(child, 'AffectBumpers') || '';
						seq.triggerAchievements = getAttrCaseInsensitive(child, 'TriggerAchievements') || '';
						seq.affectButtons = getAttrCaseInsensitive(child, 'AffectButtons') || '';

						const btnNodes = getChildrenByTagNameIgnoreCase(child, 'Button');
						btnNodes.forEach(btnNode => {
							const b = { id: generateInternalId('SB') };
							const idVal2 = getAttrCaseInsensitive(btnNode, 'ID');
							if (idVal2 !== null) b.xmlId = idVal2;
							const visibleVal2 = getAttrCaseInsensitive(btnNode, 'Visible');
							if (visibleVal2 !== null) {
								const v = visibleVal2.toLowerCase();
								if (v === 'null') b.visible = null;
								else b.visible = v !== 'false';
							}
							const posStr2 = getAttrCaseInsensitive(btnNode, 'Position');
							if (posStr2) {
								const p = parseCoord(posStr2);
								if (p) b.position = { x: p.x, y: p.y, z: p.z };
							}
							const mpIDVal2 = getAttrCaseInsensitive(btnNode, 'MovingPlatformID');
							if (mpIDVal2 !== null) b.movingPlatformID = mpIDVal2;
							seq.buttons.push(b);
						});
						state.buttonSequences.push(seq);
					}
					else if (tag === 'othercube') {
						const triggerStr = getAttrCaseInsensitive(child, 'PositionTrigger');
						const cubeStr = getAttrCaseInsensitive(child, 'PositionCube');
						if (triggerStr && cubeStr) {
							const trigger = parseCoord(triggerStr);
							const cube = parseCoord(cubeStr);
							if (trigger && cube) {
								const m = {
									id: generateInternalId('OC'),
									triggerX: trigger.x, triggerY: trigger.y, triggerZ: trigger.z,
									cubeX: cube.x, cubeY: cube.y, cubeZ: cube.z,
									subMovingPlatforms: [],
									subButtons: [],
									keyEvents: []
								};
								const idVal = getAttrCaseInsensitive(child, 'ID');
								if (idVal !== null) m.xmlId = idVal;
								const radiusVal = getAttrCaseInsensitive(child, 'Radius');
								if (radiusVal !== null) {
									const parts = radiusVal.split(',').map(s => parseInt(s.trim()));
									if (parts.length >= 2) {
										if (!isNaN(parts[0])) m.radiusX = parts[0];
										if (!isNaN(parts[1])) m.radiusY = parts[1];
									}
								}
								const modeVal = getAttrCaseInsensitive(child, 'Mode');
								if (modeVal !== null) {
									const modeLower = modeVal.toLowerCase();
									if (modeLower === 'autohide') m.mode = 'AutoHide';
									else if (modeLower === 'moveaway') m.mode = 'MoveAway';
									else if (modeLower === 'hole') m.mode = 'Hole';
									else m.mode = 'AutoHide';   // 默认
								}
								const moveVal = getAttrCaseInsensitive(child, 'MoveDirection');
								if (moveVal !== null) {
									const parts = moveVal.split(',').map(s => parseInt(s.trim()));
									if (parts.length >= 3) {
										if (!isNaN(parts[0])) m.moveDirX = parts[0];
										if (!isNaN(parts[1])) m.moveDirY = parts[1];
										if (!isNaN(parts[2])) m.moveDirZ = parts[2];
									}
								}
								const syncVal = getAttrCaseInsensitive(child, 'MovingBlockSync');
								if (syncVal !== null) m.movingBlockSync = syncVal;

								// 子 MovingPlatform
								const subMPNodes = getChildrenByTagNameIgnoreCase(child, 'MovingPlatform');
								subMPNodes.forEach(mpNode => {
									const sp = {};
									const autoStartVal = getAttrCaseInsensitive(mpNode, 'AutoStart');
									if (autoStartVal !== null) sp.autoStart = autoStartVal.toLowerCase() !== 'false';
									const loopVal = getAttrCaseInsensitive(mpNode, 'LoopStartIndex');
									if (loopVal !== null) sp.loopStartIndex = parseInt(loopVal);
									const fullVal = getAttrCaseInsensitive(mpNode, 'FullBlock');
									if (fullVal !== null) sp.fullBlock = fullVal.toLowerCase() !== 'false';
									m.subMovingPlatforms.push(sp);
								});
								// 子 Button
								const subBtnNodes = getChildrenByTagNameIgnoreCase(child, 'Button');
								subBtnNodes.forEach(btnNode => {
									const sb = {};
									const visibleVal = getAttrCaseInsensitive(btnNode, 'Visible');
									if (visibleVal !== null) sb.visible = visibleVal.toLowerCase() !== 'false';
									const disableVal = getAttrCaseInsensitive(btnNode, 'DisableCount');
									if (disableVal !== null) sb.disableCount = parseInt(disableVal);
									const modeVal = getAttrCaseInsensitive(btnNode, 'Mode');
									if (modeVal !== null) sb.mode = modeVal;
									sb.affectMoving = getAttrCaseInsensitive(btnNode, 'AffectMovingPlatforms') || '';
									sb.affectBumpers = getAttrCaseInsensitive(btnNode, 'AffectBumpers') || '';
									sb.triggerAchievements = getAttrCaseInsensitive(btnNode, 'TriggerAchievements') || '';
									sb.affectButtons = getAttrCaseInsensitive(btnNode, 'AffectButtons') || '';
									m.subButtons.push(sb);
								});
								// KeyEvents
								for (let node of child.childNodes) {
									if (node.nodeType === 1) {
										const tagName = node.tagName;
										const match = tagName.match(/^(West|East|North|South)(Up|Down)$/i);
										if (match) {
											const dir = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
											const type = match[2].charAt(0).toUpperCase() + match[2].slice(1).toLowerCase();
											const ke = { dir, type };
											const timeVal = getAttrCaseInsensitive(node, 'TimeOffset');
											if (timeVal !== null) ke.timeOffset = parseInt(timeVal);
											m.keyEvents.push(ke);
										}
									}
								}
								if (typeof m.triggerX === 'number' && typeof m.triggerY === 'number' && typeof m.triggerZ === 'number' &&
									typeof m.cubeX === 'number' && typeof m.cubeY === 'number' && typeof m.cubeZ === 'number' &&
									!isNaN(m.triggerX) && !isNaN(m.triggerY) && !isNaN(m.triggerZ) &&
									!isNaN(m.cubeX) && !isNaN(m.cubeY) && !isNaN(m.cubeZ)) {
									state.otherCubes.push(m);
								}
							}
						}
					}
					else if (tag === 'darkcube') {
						const triggerStr = getAttrCaseInsensitive(child, 'PositionTrigger');
						const cubeStr = getAttrCaseInsensitive(child, 'PositionCube');
						if (triggerStr && cubeStr) {
							const trigger = parseCoord(triggerStr);
							const cube = parseCoord(cubeStr);
							if (trigger && cube) {
								const m = {
									id: generateInternalId('DC'),
									triggerX: trigger.x, triggerY: trigger.y, triggerZ: trigger.z,
									cubeX: cube.x, cubeY: cube.y, cubeZ: cube.z,
									keyEvents: []
								};
								const idVal = getAttrCaseInsensitive(child, 'ID');
								if (idVal !== null) m.xmlId = idVal;
								const radiusVal = getAttrCaseInsensitive(child, 'Radius');
								if (radiusVal !== null) {
									const parts = radiusVal.split(',').map(s => parseInt(s.trim()));
									if (parts.length >= 2) {
										if (!isNaN(parts[0])) m.radiusX = parts[0];
										if (!isNaN(parts[1])) m.radiusY = parts[1];
									}
								}
								const syncVal = getAttrCaseInsensitive(child, 'MovingBlockSync');
								if (syncVal !== null) m.movingBlockSync = syncVal;

								for (let node of child.childNodes) {
									if (node.nodeType === 1) {
										const tagName = node.tagName;
										const match = tagName.match(/^(West|East|North|South)(Up|Down)$/i);
										if (match) {
											const dir = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
											const type = match[2].charAt(0).toUpperCase() + match[2].slice(1).toLowerCase();
											const ke = { dir, type };
											const timeVal = getAttrCaseInsensitive(node, 'TimeOffset');
											if (timeVal !== null) ke.timeOffset = parseInt(timeVal);
											m.keyEvents.push(ke);
										}
									}
								}
								if (typeof m.triggerX === 'number' && typeof m.triggerY === 'number' && typeof m.triggerZ === 'number' &&
									typeof m.cubeX === 'number' && typeof m.cubeY === 'number' && typeof m.cubeZ === 'number' &&
									!isNaN(m.triggerX) && !isNaN(m.triggerY) && !isNaN(m.triggerZ) &&
									!isNaN(m.cubeX) && !isNaN(m.cubeY) && !isNaN(m.cubeZ)) {
									state.darkCubes.push(m);
								}	
							}
						}
					}
					else {
						state.unknownElements.push(child.outerHTML);
					}
				} catch (err) {
					state.unknownElements.push(child.outerHTML);
				}
			}

			syncLevelUI();
			if (state.currentLayer > h) state.currentLayer = h;
			layerInput.value = state.currentLayer;
			
			// 在 syncLevelUI(); 之后，requestRender() 之前
			if (threeScene) {
				clear3DScene();  // 清理旧3D场景并重新渲染
			}

			requestRender();
			updatePanel();
			updateElemList();
			updateStatus();
			uniInterface();
			showToast(`XML加载成功`);

			// PNG 加载逻辑（同之前）
			if (pngFiles.length === 0) {
                _finishImport();
				showToast('未找到PNG文件，可手动导入');
				return;
			}

			const pngMap = {};
			pngFiles.forEach(f => {
				const regex = new RegExp(`^${xmlBaseName}\\.(\\d+)\\.png$`, 'i');
				const match = f.name.match(regex);
				let layerNum = -1;
				if (match) {
					layerNum = parseInt(match[1]);
				} else {
					const layerStr = prompt(`无法识别 "${f.name}" 的层数，请输入层数 (0~${h-1})：`, '0');
					if (layerStr !== null) {
						const ln = parseInt(layerStr);
						if (!isNaN(ln) && ln >= 0 && ln < h) layerNum = ln;
					}
				}
				if (layerNum >= 0 && layerNum < h) {
					if (!pngMap[layerNum]) pngMap[layerNum] = [];
					pngMap[layerNum].push(f);
				}
			});

			let loadedCount = 0;
			const totalLayers = Object.keys(pngMap).length;
			if (totalLayers === 0) {
                _finishImport();
				showToast('没有可导入的PNG');
				return;
			}
			for (const layerNum in pngMap) {
				const pngFile = pngMap[layerNum][0];
				const readerPng = new FileReader();
				readerPng.onload = function(ev) {
					const img = new Image();
					img.onload = function() {
						const canvas = document.createElement('canvas');
						canvas.width = img.width;
						canvas.height = img.height;
						const ctx = canvas.getContext('2d');
						ctx.drawImage(img, 0, 0);
						const imageData = ctx.getImageData(0, 0, img.width, img.height);
						const data = imageData.data;
						const layer = state.staticBlocks[layerNum] || Array.from({ length: l },
							() => Array(w).fill(null));
						for (let y = 0; y < Math.min(l, img.height); y++) {
							for (let x = 0; x < Math.min(w, img.width); x++) {
								const idx = (y * img.width + x) * 4;
								const r = data[idx];
								const g = data[idx + 1];
								const b = data[idx + 2];
								if (r > 10 || g > 10 || b > 10) {
									layer[y][x] = { r, g, b };
								} else {
									layer[y][x] = null;
								}
							}
						}
						state.staticBlocks[layerNum] = layer;
						loadedCount++;
						if (loadedCount === totalLayers) {
							requestRender();
							updateStatus();
							uniInterface();
                            _finishImport();
							showToast(`已导入 ${totalLayers} 层PNG (匹配基准: ${xmlBaseName})`);
						}
					};
					img.src = ev.target.result;
				};
				readerPng.readAsDataURL(pngFile);
			}

		} catch (err) {
            _finishImport();
			showToast('加载失败: ' + err.message);
		}
		updateLayerMax();
	};
	reader.readAsText(xmlFile);
}

function downloadFile(blob, filename) {
	const useShare = !!(state.settings && state.settings.useShareDownload);
	if (useShare && navigator.share && navigator.canShare) {
		try {
			const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
			if (navigator.canShare({ files: [file] })) {
				navigator.share({ files: [file] }).catch(e => {});
				return;
			}
		} catch(e) {}
	}
	// 传统下载
	const link = document.createElement('a');
	link.href = URL.createObjectURL(blob);
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	setTimeout(() => URL.revokeObjectURL(link.href), 10000);
}

function exportZip() {
	const lv = state.level;
	const baseName = lv.name || 'level';
	const { w, l, h } = lv.size;
	const promises = [];

	// XML
	const xmlString = generateXMLString();
	const xmlBlob = new Blob([xmlString], { type: 'text/xml' });
	promises.push(Promise.resolve({ name: `${baseName}.xml`, blob: xmlBlob }));

	// PNG 各层
	for (let z = 0; z < h; z++) {
		const layer = state.staticBlocks[z] || Array.from({ length: l }, () => Array(w).fill(null));
		// 在 for (let z = 0; z < h; z++) 循环内，创建 canvas 前添加检查
		let hasBlock = false;
		for (let y = 0; y < l; y++) {
			for (let x = 0; x < w; x++) {
				if (layer[y] && layer[y][x]) { hasBlock = true; break; }
			}
			if (hasBlock) break;
		}
		if (!hasBlock) continue; // 跳过无方块层
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
		const promise = new Promise((resolve) => {
			canvas.toBlob(function(blob) {
				resolve({ name: `${baseName}.${z}.png`, blob: blob });
			}, 'image/png');
		});
		promises.push(promise);
	}

	Promise.all(promises).then((results) => {
		if (typeof JSZip === 'undefined') {
			showToast('JSZip库未加载，请检查网络');
			return;
		}
		const zip = new JSZip();
		results.forEach(item => {
			zip.file(item.name, item.blob);
		});
		zip.generateAsync({ type: 'blob' }).then(function(content) {
			downloadFile(content, `${baseName}.zip`);
		});
	}).catch(err => {
		showToast('导出ZIP失败: ' + err.message);
	});
}

async function loadFromZip(zipFile) {
    if (typeof JSZip === 'undefined') {
        showToast('JSZip 未加载，无法解析 ZIP');
        return;
    }
    try {
        const zip = await JSZip.loadAsync(zipFile);
        const entries = Object.keys(zip.files).filter(name => !zip.files[name].dir);

        // 找 XML
        const xmlEntry = entries.find(n => n.toLowerCase().endsWith('.xml'));
        if (!xmlEntry) {
            showToast('ZIP 中未找到 XML 文件');
            return;
        }
        const xmlText = await zip.files[xmlEntry].async('string');
        const xmlName = xmlEntry.split('/').pop();
        const xmlFile = new File([xmlText], xmlName, { type: 'text/xml' });

        // 找 PNG
        const pngEntries = entries.filter(n => n.toLowerCase().endsWith('.png'));
        const pngFiles = [];
        for (const name of pngEntries) {
            const blob = await zip.files[name].async('blob');
            const shortName = name.split('/').pop();
            pngFiles.push(new File([blob], shortName, { type: 'image/png' }));
        }

        const files = [xmlFile, ...pngFiles];
        loadXMLAndPNG(files);
    } catch (err) {
        showToast('ZIP 解析失败: ' + err.message);
        console.error(err);
    }
}

window.loadFromZip = loadFromZip;