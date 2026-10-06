// 初始化
function init() {
	// 用于画笔模式节流
	let _lastBrushPos = null;
	// 在 init 开头检查是否已添加
	if (!gridEl.contains(canvas)) {
		gridEl.innerHTML = '';
		gridEl.appendChild(canvas);
	}
	ensureScriptLoaded();
	const hasCache = loadCache();
	if (state.staticColor) {
		const colorPicker = document.getElementById('staticColorPicker');
		const hex = '#' + [state.staticColor.r, state.staticColor.g, state.staticColor.b].map(c => c.toString(16).padStart(2, '0')).join('');
		colorPicker.value = hex;
	}
	if (hasCache) {
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
		const filterPos = (arr, getPos) => arr.filter(item => {
			const p = getPos(item);
			return p && typeof p.x === 'number' && typeof p.y === 'number' && typeof p.z === 'number' && !isNaN(p.x) && !isNaN(p.y) && !isNaN(p.z);
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
		syncLevelUI();
		//if (state.currentLayer > h) state.currentLayer = h;
		layerInput.value = state.currentLayer;
		rebuildSpatialIndex();
		showToast('已恢复缓存数据');
	} else {
		initStaticBlocks();
		const demo = [
			{ id: 'F1', x: 5, y: 5, z: 0, floatTime: 20 },
			{ id: 'P1', x: 8, y: 5, z: 0, energy: 1 },
			{ id: 'R1', x: 11, y: 5, z: 0, type: 'grow', visible: true, radiusX: 0, radiusY: 0 },
			{ id: 'R2', x: 14, y: 5, z: 0, type: 'shrink', visible: true, radiusX: 0, radiusY: 0 },
			{ id: 'B1', x: 3, y: 12, z: 0, enabled: true, north: { enabled: false, startDelay: 0,
					pulseRate: 0 }, east: { enabled: false, startDelay: 0, pulseRate: 0 },
				south: { enabled: false, startDelay: 0, pulseRate: 0 }, west: { enabled: false,
					startDelay: 0, pulseRate: 0 } },
			{ id: 'CP1', x: 6, y: 15, z: 0, respawnZ: 0, radiusX: 0, radiusY: 0 },
			{ id: 'CT1', x: 10, y: 15, z: 0, radiusX: 0, radiusY: 0, zoom: -1, angle: 22, fov: 22,
				startDelay: 0, duration: 0, singleUse: false, useAngle: true },
			{ id: 'Btn1', x: 15, y: 15, z: 0, visible: true, disableCount: 0, mode: 'StayDown',
				movingPlatformID: '', affectMoving: '', affectBumpers: '', triggerAchievements: '',
				affectButtons: '' },
		];
		state.fallingPlatforms.push(demo[0]);
		state.prisms.push(demo[1]);
		state.resizers.push(demo[2]);
		state.resizers.push(demo[3]);
		state.bumpers.push(demo[4]);
		state.checkpoints.push(demo[5]);
		state.cameraTriggers.push(demo[6]);
		state.buttons.push(demo[7]);
		state.nextIdCounter = 10;
		const layer0 = state.staticBlocks[0];
		if (layer0) {
			for (let y = 2; y < 6; y++) {
				for (let x = 2; x < 8; x++) {
					layer0[y][x] = { r: 255, g: 255, b: 128 };
				}
			}
		}
		syncLevelUI();
		updateCanvasRangeFromSize();
		updateLayerMax();
		showToast('已加载示例数据');
	}

	syncVisibilityUI();
    requestRender();
	updatePanel();
	updateElemList();
	updateStatus();

	document.getElementById('toolStatic').addEventListener('click', () => setTool('static'));
	document.getElementById('toolMoving').addEventListener('click', () => setTool('moving'));
	document.getElementById('toolFalling').addEventListener('click', () => setTool('falling'));
	document.getElementById('toolPrism').addEventListener('click', () => setTool('prism'));
	document.getElementById('toolResizerGrow').addEventListener('click', () => setTool('resizerGrow'));
	document.getElementById('toolResizerShrink').addEventListener('click', () => setTool('resizerShrink'));
	document.getElementById('toolBumper').addEventListener('click', () => setTool('bumper'));
	document.getElementById('toolCheckpoint').addEventListener('click', () => setTool('checkpoint'));
	document.getElementById('toolCameraTrigger').addEventListener('click', () => setTool('cameratrigger'));
	document.getElementById('toolButton').addEventListener('click', () => setTool('button'));
    document.getElementById('toolSeqButton').addEventListener('click', function() {
        // 优先以"当前选中的按钮序列"作为目标，即使之前已设置过 seqEditingId
        if (state.selectedElement && state.selectedElement.type === 'buttonsequence') {
            state.seqEditingId = state.selectedElement.id;
        } else if (!state.seqEditingId) {
            showToast('请先选中一个按钮序列，再点击"序列子按钮"');
            return;
        }
        setTool('seqbutton');
        showToast(`序列子按钮模式：目标序列 #${state.seqEditingId}`);
    });
	document.getElementById('toolOtherCube').addEventListener('click', () => setTool('othercube'));
	document.getElementById('toolDarkCube').addEventListener('click', () => setTool('darkcube'));
	document.getElementById('toolEraser').addEventListener('click', () => setTool('eraser'));
	layerInput.addEventListener('change', changeLayer);
	// 层数加减按钮
	document.getElementById('layerDecreaseBtn').addEventListener('click', function() {
		changeLayerBy(-1);
	});
	document.getElementById('layerIncreaseBtn').addEventListener('click', function() {
		changeLayerBy(1);
	});
	document.getElementById('exportPngBtn').addEventListener('click', exportPNG);
	document.getElementById('exportXmlBtn').addEventListener('click', exportXML);
	document.getElementById('clearLayerBtn').addEventListener('click', clearLayer);

	document.getElementById('loadXmlBtn').addEventListener('click', () => {
		fileXmlInput.click();
	});

    fileXmlInput.addEventListener('change', async (e) => {
        if (e.target.files.length === 0) return;
        const files = Array.from(e.target.files);
        e.target.value = '';

        // 如果是单个 zip 文件 → 走 zip 导入
        if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
            // 1. 确认导入
            if (!confirm('检测到 ZIP 文件，是否确认导入？\n\n点击【确定】→ 继续导入\n点击【取消】→ 取消导入')) {
                return;
            }
            // 2. 可选：先导出当前项目
            if (hasProjectData()) {
                const exportFirst = confirm(
                    '是否先导出当前项目为 ZIP？\n\n' +
                    '点击【确定】→ 先导出，再导入\n' +
                    '点击【取消】→ 不导出，直接导入'
                );
                if (exportFirst) {
                    exportZip();
                    await new Promise(r => setTimeout(r, 200));
                }
            }
            await loadFromZip(files[0]);
            return;
        }

        // 原有的 XML + PNG 导入流程
        if (hasProjectData()) {
            const exportFirst = confirm(
                '导入会覆盖当前项目。\n\n' +
                '点击【确定】→ 先导出当前项目为 ZIP，再导入\n' +
                '点击【取消】→ 不导出，直接导入（丢弃当前数据）'
            );
            if (exportFirst) {
                exportZip();
                setTimeout(() => loadXMLAndPNG(files), 150);
                return;
            }
        }
        loadXMLAndPNG(files);
    });

	zoomSlider.addEventListener('input', function() {
		setZoom(parseInt(this.value));
	});
	zoomNumber.addEventListener('change', function() {
		let val = parseInt(this.value) || 65;
		if (val < 10) val = 10;
		if (val > 500) val = 500;
		setZoom(val);
	});
	setZoom(65);

	window.addEventListener('resize', () => {
		requestRender();
	});

	setInterval(saveCache, 30000);
	
	// ===== 帮助侧栏 =====
	const helpSidebar = document.getElementById('helpSidebar');
	const helpOverlay = document.getElementById('helpOverlay');
	const helpBody = document.getElementById('helpBody');
	const helpCloseBtn = document.getElementById('helpCloseBtn');

	// 帮助文档内容（支持多行文本）
	const rawDoc = `
Level 元素
ID	32位整数(上限2147483647)	必填。关卡的标识符。若相同ID的关卡同时安装在游戏中，则只会显示前一个。为了避免冲突，请至少使用五位数作为关卡 ID，并使用一个随机生成的前缀。

Name	文本	可选，默认为空。关卡名。虽然不推荐使用换行符，但一定要使用的话请使用 &#xA; 换行。

TimeThresholds	16位自然数列表	可选，默认为 1,2,3,4,5。由 5 个数字组成，分别表示达到 S+、S、A、B、C 所需的秒数，请注意这里手机版比较特殊，PC 版是以秒为单位，移动版是以厘秒 (0.01s) 为单位（除 iOS/安卓版 EDGE 的 bonus levels 外）。因此建议将时间设置在 655 秒内。达到 S+、S、A、B、C 所需的时间必须严格递增，否则将无法获得部分评级。

Size	三维大小	必填。填写关卡大小。

SpawnPoint	三维向量	必填。方块起始坐标。

ExitPoint	三维向量	必填。终点坐标。如果 X 坐标 ∉ [0,宽度) 或 Y 坐标 ∉ [0,长度) 或 Z 坐标 ∉ (0,高度] 会导致游戏崩溃。

Theme	8位自然数	可选，默认为0。指定关卡内部方块的外观主题。如果大于3则会在游戏中变成0。0为白色主题，1为浅灰色主题，2为深灰色主题，3为黑色主题。只有白色主题的背景会有一闪一闪的星星。（可以通过 models 添加不会闪烁的星星）请注意设置主题并不影响那些在 models 中的静态方块的外观。如果想要修改请查看 关卡地图。

MusicJava	8位自然数	可选，默认为0。在Java版上播放音乐的索引。如果大于11则会在游戏中变为0。音乐列表（前面的数字为代号）：00_menus, 01_braintonik, 02_cube_dance, 03_essai_2, 04_essai_01, 05_test, 06_mysterycube, 07_03_EDGE, 08_jungle, 09_RetardTonic, 10_oldschool_simon, 11_planant

Music	8位自然数	可选，默认为6。在其他版本上播放音乐的索引。如果大于24则会在游戏中变为6。音乐列表（前面的数字为代号）：00_Title, 01_Eternity, 02_Quiet, 03_Pad, 04_Jingle, 05_Tec, 06_Kakkoi, 07_Dark, 08_Squadron, 09_8bits, 10_Pixel, 11_Jupiter, 12_Shame, 13_Debrief, 14_Space, 15_Voyage_geometrique, 16_Mzone, 17_R2, 18_Mystery_cube, 19_Duty, 20_PerfectCell, 21_fun, 22_lol, 23_lostway, 24_wall_street

Zoom	16位整数	可选，默认为-1。关卡开始时的缩放级别，在这里填写小于1或任何大于5（而不是6）的整数的效果都和填写1相同。其余功能与 CameraTrigger 元素中的对应属性相同。

Angle	16位整数	可选。表示在关卡开始时高级缩放模式下的相机的观察角度。具体功能与 CameraTrigger 元素中的对应属性相同。

FieldOfView	16位整数	可选，默认为0。指定触发后的视野大小。具体功能与 CameraTrigger 元素中的对应属性相同。

ModelTheme	8位自然数	可选，默认与 @Theme 相同。指定生成模型使用的默认主题与背景所使用的主题。设置为 3 以上可以禁用生成模型。

<Level ID="309" Name="1st contact" TimeThresholds="9,25,55,85,145"
Size="14x26x4" SpawnPoint="3,22,62" ExitPoint="11,12,1" MusicJava="5" Zoom="1">
...
</Level>


MovingPlatform 元素

ID	ID	可选。填写后可用于被引用。

AutoStart	布尔型	可选，默认为True。指定在关卡开始时是否该方块是否需要移动。

LoopStartIndex	8位自然数	可选，默认为1。指定当移动方块移动到最后一个路点后的下一个路点的索引（从1开始）。将该值设置为0可以使移动方块在移动到最后一个路点后停止移动。若索引大于路点数量很可能会导致一些BUG。

Clones	16位整数	可选，默认为-1。已过时。

FullBlock	布尔型	可选，默认为True。指定该移动方块是完整的一个方块还是只有上半个。（请注意这只是外观上不同，在游戏物理引擎中两者并无差别）

RelatedTo	ID	可选。语法糖。指定后该移动方块会与目标移动方块保持相对静止，而其 Waypoint 子元素将会被加到目标移动方块移动序列之后。

Offset	三维向量	可选。语法糖。仅在指定 @RelatedTo 后此项才有效。指定与目标移动方块的偏移量。

<MovingPlatform ID="Block19" AutoStart="False" LoopStartIndex="0">
...
</MovingPlatform>

子元素列表：
Waypoint

Position	三维向量	必填。该点的坐标。请注意这里的Z坐标应该在原坐标（png层数）基础上+1，否则在游戏中将显示不正常！

TravelTime	16位自然数	可选，默认为0。移动到该点需要使用的帧（1/22秒）数。请注意如果该值过大可能会导致走到一半弹回来的 BUG！如果遇到这样的 BUG，如果可能请把一个路点拆成两个或多个。

PauseTime	16位自然数	可选，默认为0。在该点停留的帧（1/22秒）数。

<Waypoint Position="-1,-81,4" PauseTime="24" />


Bumper 元素

ID	ID	可选。填写后可用于被@AffectBumpers引用。

Enabled	布尔型	可选，默认为True。指定撞击器在关卡开始时是否被启用。

Position	三维向量	必填。指定撞击器的位置。请注意当撞击器的 Z 坐标 = 0 且 X,Y 坐标 ≤ 0 时会在撞击器旁边多出一些小方块，当玩家以小方块形式站在多出来的小方块上时将不会掉落。

<Bumper Position="11,4,0">
...
</Bumper>

子元素列表：
North & East & South & West 元素 各 0～1 个

StartDelay	16位整数	可选，默认为0。表示从关卡开始到第一次撞击之间的帧（1/22秒）数。若为-1表示不撞击。

PulseRate	16位整数	可选，默认为0。表示两次撞击之间间隔的帧（1/22秒）数。若为-1表示不撞击。

<South PulseRate="30" />


FallingPlatform 元素

Position	三维向量	必填。指定可掉落平台的坐标。请注意这里的Z坐标应该在原坐标基础上+1，否则在游戏中将显示不正常！

FloatTime	16位自然数	可选，默认为20。表示压过到掉落之间间隔的帧（1/22秒）数。

<FallingPlatform Position="14,3,1" FloatTime="10" />


Checkpoint 元素

Position	三维向量	必填。指定存档点的坐标。
RespawnZ	16位整数	可选，默认为0。指定恢复时方块的Z坐标。
Radius	二维向量	可选，默认为0,0。使方块的坐标与存档点坐标之差的绝对值小于此值时也认为是到达了存档点。（换言之可以使存档点变成一个矩形）
<Checkpoint Position="6,22,1" RespawnZ="1" Radius="0,1" />


CameraTrigger 元素

Position	三维向量	必填。指定相机触发点的坐标。

Radius	二维向量	可选，默认为0,0。使方块的坐标与相机触发器坐标之差的绝对值小于此值时也认为是触发了相机触发器。（换言之可以使相机触发点变成一个矩形）

Zoom	16位整数	可选，默认为-1。指定触发后的缩放级别，即相机离方块的距离，从近到远分别是6、5、1、2、3、4，以 WEGFan 为代表的改内存狂魔发现其缩放比例为0.25：0.5：1.25：1.875：3.125：5。填写为负数或不填写表示启动高级相机模式。请注意在手机版中如果触发缩放级别为 4 的相机触发器将不会改变缩放级别。启动高级相机模式后必须填写@Duration，否则无效！填写其他值同样无效。

Angle	16位整数	可选。指定触发后相机的观察角度。22 为默认观察角度，大于等于 0 时使用透视投影，且该值越大观察角度越低，大于 184 时的效果与等于 184 相同；小于 0 时使用平行投影，其数值无实际效果。请注意 @Angle 在正负交换时会闪一下。填写后 @FieldOfView 无效。

FieldOfView	16位整数	可选，默认为 22。指定触发后的视野大小。大于 184 时的效果与等于 184 相同；小于 0 时视角会变得极小，只能看到方块，其数值无实际效果。

StartDelay	16位自然数	可选，默认为0。指定触发到开始移动相机之间间隔的帧（1/22 秒）数。仅在高级相机模式下可用。

Duration	16位自然数	可选，默认为0。指定相机从当前状态转换到目标状态所花费的帧（1/22 秒）数。仅在高级相机模式下可用。

SingleUse	布尔型	可选，默认为 False。指定是否只能触发一次。仅在高级相机模式下可用。

<CameraTrigger Position="4,9,1" Radius="1,2" Zoom="1" />

高级相机模式

　　高级相机模式是 Two Tribes 添加的功能，之所以称之为高级是因为 mobigame 的 EDGE 是 2.5D，其中并没有也很难有这样的实现。实际上在真正的三维绘图中高级相机模式中的一些概念都是很常见的。
　　注意：高级相机模式的动画即使在暂停时也会继续播放！

透视投影

　　透视投影的原理类似于小孔成像（区别在于物和像在孔的同一侧），由于它和眼球的成像（凸透镜成像）效果类似，符合远大近小的规律，因此使用透视投影可以更好地模拟出真实的 3D 世界在眼球中的影像。
　　简单来说透视投影原理就是：在相机前方选择一个平面使其与观测方向垂直，则在 3D 世界中的任意一点在该平面上的投影点为该点与视点的连线与平面的交点。

　　接下来我们谈谈视野（Field of View，常简写为 FoV）大小，视野大小是透视投影特有的。上面我们提到的平面大小是无限的，而人眼观察到的图像大小是有限的，同样地游戏的屏幕大小也是有限的，因此我们能看到的部分与视点连线的夹角大小就称为视野大小，如下图所示。通常情况下视野大小的单位为°或弧度，可惜我们并不知道它在 EDGE 中的单位。

　　视野（Field of View）与缩放级别（Zoom Level）都是数字越小看得越少，数字越大看得越多但是区别在于缩放级别指的是相机与被观察物体之间的距离，而且小地图的大小会随之改变；而视野则是相机可观察到的角度范围大小，而且小地图的大小不会随之改变。由于人眼的视野有限，如果视野过大就会显得不自然。在上面的视频中你会注意到当 @FieldOfView=180 时远处（或者说四周）的物体看起来不太自然。
　　最后我们再谈谈观察角度，如下图所示（图中的 @Angle=0 应改为 @Angle=22 ），当 @Angle=22 时观察角度与地面的夹角为 45°，@Angle 增大时夹角减小。同样我们并不知道这里的单位是什么。

平行投影
　　平行投影与太阳光（由于太阳距离很远可近似看成是平行光）投在若干个 3D 物体上在一个平面（如地面）上留下的影子的效果更加接近。平行投影中由于没有视点，也就没有视野大小的概念。不过应该可以通过调整裁剪的平面大小来达到与视野类似的效果，平行投影的观察角度可以靠平面的倾斜角度和投影方向调整，不过反正游戏中也没给你这功能，就不研究了。
　　在太阳光下飞机在空中打在地面上的影子大小和停在地面上的影子大小差别不大，在平行投影中也是这样，不再是远大近小。东西不论远近，大的投影出来就是大的，小的投影出来就是小的。P.S. 由于在 PC 版的游戏中平行投影效果并不好，我个人猜测 Two Tribes 仿照了太阳光的原理，把相机距离拉得很远，而把视野大小弄得极小来达到平行投影的效果。
　　此外你可以注意到在平行投影中各条平行线在投影后仍然是平行的，但是在透视投影中则不一定。



Prism 元素

Position	三维向量	必填。指定棱柱的位置。

Energy	8位自然数	可选，默认为1。已过时。

<Prism Position="6,22,1" />


Button 元素

ID	ID	可选。填写后可用于被@AffectButtons引用。

Visible	可空布尔型	可选，默认为True。指定按钮是否可见。如果设置为 Null，则该按钮将是半透明的。只有在设置为 True 时按下按钮才有声效。

DisableCount	8位自然数	可选，默认为0。若按钮在ButtonSequence中则此项无效。此属性指定了该按钮在这种情况下总共可以被禁用多少次，其应用可见 rodeo 一关。如果一个按钮已经被禁用 @DisableCount 次及以上时任何其他按钮企图再次启用该按钮都会失败。如果 @DisableCount 为 0，该按钮可以被不断地启用。

Mode	特殊	可选，默认为StayDown。若按钮在ButtonSequence中则此项无效。按钮有按下（禁用）或弹起（启用）两种状态。StayDown表示按钮在没有被启动的情况下只能被按下一次，离开该按钮后保持被按下（禁用）的状态。StayUp表示按钮可以被按下多次。Toggle表示一旦方块离开按钮该按钮就会被弹起，同时受影响的移动方块将恢复原位。请注意按下非 @Mode=StayDown 的按钮不算禁用按钮！

MovingPlatformID	ID	可选，默认为使用@Position的坐标。指定与按钮保持相对静止的移动方块的ID。

Position	三维向量	可选，默认为0,0,0。指定按钮在不与任何移动方块绑定的情况下的坐标。

AffectMovingPlatforms	带数据的ID列表	可选。若按钮在ButtonSequence中则此项无效。指定一堆要影响的移动方块ID。若数据为0表示遍历所有的路点，否则表示遍历数据指定个路点。

AffectBumpers	带数据的ID列表	可选。若按钮在ButtonSequence中则此项无效。指定一堆要影响的撞击器ID，撞击器被影响后将会切换启用/禁用状态。若该按钮的 @Mode 被设为 Toggle，数据为0则按下按钮时将禁用撞击器，松开时将启用撞击器；数据为1则相反。

TriggerAchievements	带数据的ID列表	可选。若按钮在ButtonSequence中则此项无效。指定一堆要触发的成就ID，标准关卡中使用了 1~19，其中ID为5的成就需要以小方块形式激活。数据表示部分成就使用的元数据（仅用于 Snowblind 成就）。

AffectButtons	带数据的ID列表	可选。若按钮在ButtonSequence中则此项无效。指定一堆要影响的按钮ID。设置此项后被引用的按钮将在关卡开始时被禁用，在按下此按钮时目标按钮的启用/禁用状态将被切换。你可以通过将数据设为1来表示默认启用目标按钮。

<Button ID="Button2" Visible="False" Position="11,11,1"
AffectButtons="Button1" />


ButtonSequence 元素

SequenceInOrder	布尔型	可选，默认为False。指定是否强制按钮序列要用指定的顺序按下。

AffectMovingPlatforms	带数据的ID列表	可选。指定一堆要影响的移动方块ID。若数据为0表示遍历所有的路点，否则表示遍历数据指定个路点。

AffectBumpers	带数据的ID列表	可选。指定一堆要影响的撞击器ID，撞击器被影响后将会切换启用/禁用状态。若该按钮的 @Mode 被设为 Toggle，数据为0则按下按钮时将禁用撞击器，松开时将启用撞击器；数据为1则相反。

TriggerAchievements	带数据的ID列表	可选。指定一堆要触发的成就ID，标准关卡中使用了 1~19，其中ID为5的成就需要以小方块形式激活。数据表示部分成就使用的元数据（仅用于 Snowblind 成就）。@WEGFan 猜测可以通过修改 config.bjson 来自定义成就。（仅限破解版）

AffectButtons	带数据的ID列表	可选。指定一堆要影响的按钮ID。设置此项后被引用的按钮将在关卡开始时被禁用，在按下此按钮时目标按钮的启用/禁用状态将被切换。你可以通过将数据设为1来表示默认启用目标按钮。

<ButtonSequence SequenceInOrder="True"
		AffectMovingPlatforms="Block10,Block11,Block12"
		AffectBumpers="Bumper1,Bumper2,Bumper3,Bumper4">
...
</ButtonSequence>
子元素列表：
Button 元素
<Button ID="Button2" Visible="False" Position="11,11,1" />


ResizerGrow & ResizerShrink 元素

Position	三维向量	必填。指定方块尺寸调整器的位置，游戏会自动在该点下方添加一个静态方块，但是不会为其生成模型。为了性能最佳，你应该模仿标准关卡对这一点的静态方块使用 #00FFFF（如果是在最底层则用 #00FF80）来指定只生成方块模型。你可以反编译 babylonian_817 后打开第 0 层和第 28 层查看标准关卡的做法。
Z 坐标 ＞ 关卡高度 或 Z 坐标 ≤ 0 会导致游戏崩溃，X 坐标 ≥ 关卡宽度 或 X 坐标 ＜ 0 或 Y 坐标 ≥ 关卡长度 或 Y 坐标 ＜ 0 会导致该位置虽然在游戏中可见但没有实际效果，也不会添加静态方块，并有几率导致游戏崩溃。若与 /Level/@ExitPoint 重合，关卡终点将被腐蚀。

Visible	布尔型	可选，默认为True。指定方块尺寸调整器在关卡中是否可见。

Radius	二维向量	可选，默认为0,0。语法糖。使方块的坐标与方块尺寸调整器坐标之差的绝对值小于等于此值时也缩放方块。（换言之可以使方块尺寸调整器变成一个矩形）

<ResizerShrink Position="14,2,3" Visible="False" />


OtherCube 元素

PositionTrigger	三维向量	必填。指定“?”显示的坐标位置，方块到达该位置时会激活提示方块。请注意提示方块可以激活多次！

MovingBlockSync	ID	可选。指定要与其同步的MovingPlatform的ID，提示方块将在被同步的MovingPlatform移动到第一个路点时开始移动。

PositionCube	三维向量	必填。指定提示方块的初始位置。

Radius	二维向量	可选，默认为0,0。语法糖。使方块的坐标与触发点坐标之差的绝对值小于等于此值时也认为是到达了触发点。（换言之可以使触发点变成一个矩形）

Mode	特殊	可选，默认为AutoHide。语法糖。填写MoveAway后被触发的位置下方的方块会开始变色。（wire的视频演示）填写Hole后被触发位置下方会变得什么都没有，下落到洞中后会自动瞬移到洞口并不再下落。（furious bot的视频演示）选择AutoHide后离开该方块时提示方块会消失，否则不会消失。MoveAway只能生效一次，之后会变成AutoHide模式。Hole也只能生效一次，之后再进入不会再次下落，也不会触发提示方块。P.S. 原理是在触发位置放一个MovingPlatform和一个Button，并在方块移动到触发位置时将方块移开，来避免方块离开时提示方块消失。

MoveDirection	三维向量	可选，在AutoHide模式下默认为0,0,0，在MoveAway模式下为0,-1,0，在Hole模式下为0,0,1。语法糖。在设置了MovingPlatform/Waypoint的情况下此属性将被忽略。该属性在AutoHide模式下此属性无意义，在其他模式下此属性表示触发方块的移动方向向量。在Hole模式中实际触发位置以及MovingPlatform的初始位置为原来触发位置减去该向量的值。

<OtherCube PositionTrigger="70,27,1" MovingBlockSync="Block29"
   PositionCube="69,25,1">
...
</OtherCube>
子元素列表：
MovingPlatform 元素（仅在非AutoHide模式下可用，@AutoStart的默认值为False，@LoopStartIndex的默认值为0，在没有子元素的情况下会有两个路点，即从@PositionTrigger开始向@MoveDirection移动，@TravelTime在MoveAway模式下为32000，在Hole模式下为1）
Button 元素（仅在非AutoHide模式下可用，@Position默认值为@PositionTrigger，@Visible默认值为False，@AffectMovingPlatforms会自动添加与其对应的MovingPlatform）
按键事件元素
说明：按键事件元素，表示一个方块按键的事件。元素名前半部分是West, East, North, South中的一个，表示移动的方向；元素名后半部分是Up或Down，表示是按下这个方向的键还是放开。
属性列表：

属性名	数据类型	备注
TimeOffset	16位自然数	可选，默认为0。表示从方块被触发到按键间隔的帧（1/22秒）数。
附方块在同一高度上移动距离与所用帧（1/22秒）数列表（会有一点点误差，建议在按键放开后增加延时来减小误差）：

移动距离（格）	所用帧（1/22秒）数	移动距离（格）	所用帧（1/22秒）数
1	8	11	81
2	16	12	87
3	24	13	93
4	32	14	99
5	39	15	105
6	46	16	111
7	53	17	117
8	60	18	123
9	67	19	129
10	74	20	135
<WestDown TimeOffset="14" />


DarkCube 元素

PositionTrigger	三维向量	必填。方块到达该位置时会激活黑暗方块。请注意黑暗方块只会被激活一次！

Radius	二维向量	可选，默认为0,0。使方块的坐标与触发点坐标之差的绝对值小于此值时也认为是到达了触发点。（换言之可以使触发点变成一个矩形）

MovingBlockSync	ID	可选。指定要与其同步的MovingPlatform的ID，黑暗方块将在被同步的MovingPlatform移动到第一个路点时开始移动。

PositionCube	三维向量	必填。指定黑暗方块的初始位置。

<DarkCube PositionTrigger="17,19,1" Radius="1,0" PositionCube="17,9,1">
...
</DarkCube>

子元素列表：
按键事件元素
说明：按键事件元素，表示一个方块按键的事件。元素名前半部分是West, East, North, South中的一个，表示移动的方向；元素名后半部分是Up或Down，表示是按下这个方向的键还是放开。
属性列表：

属性名	数据类型	备注
TimeOffset	16位自然数	可选，默认为0。表示从方块被触发到按键间隔的帧（1/22秒）数。
附方块在同一高度上移动距离与所用帧（1/22秒）数列表（会有一点点误差，建议在按键放开后增加延时来减小误差）：

移动距离（格）	所用帧（1/22秒）数	移动距离（格）	所用帧（1/22秒）数
1	8	11	81
2	16	12	87
3	24	13	93
4	32	14	99
5	39	15	105
6	46	16	111
7	53	17	117
8	60	18	123
9	67	19	129
10	74	20	135
<WestDown TimeOffset="14" />


关卡地图

关卡地图就是那一坨 .{z（层数）}.png 文件，每一个文件都表示所在的 z 坐标那一层上的地图。

快速入门
　　第 0 层有方块的使用 #FFFF80 [rgb(255,255,128)] 填充，其他层使用 #FFFFFF [rgb(255,255,255)]，剩下没有方块的使用 #000000 [rgb(0,0,0)] 填充即可。
　　在生成模型没有被 Level/@ModelTheme 禁用的情况下编译关卡可以得到一个 .eso 模型，将其放在 models 文件夹即可。

特别的技巧
R 通道（方块模式）
255 (0xFF)	方块模式。玩家方块可以与这个方块碰撞。具体值没有影响。
224-254 (0xE0 - 0xFE)	静态发光移动方块模式。具体值没有影响。
192-223 (0xC0 - 0xDF)	静态发光半移动方块模式。具体值没有影响。
160-191 (0xA0 - 0xBF)	静态移动方块模式。具体值没有影响。
128-159 (0x80 - 0x9F)	静态半移动方块模式。具体值没有影响。
0-127 (0x00 - 0x7F)	无方块模式。玩家方块不会与这个方块碰撞。
移动方块模式下没有静态方块，因为它使用不移动的移动方块来代替。半移动方块即只有上半格，对应 @FullBlock=False。发光移动方块即看起来像在移动，就像在 crystal mine 一关中一样，这也是通常的移动方块使用方式。这种模式需要注意：

静态方块在移动版中会有具体的形状（因为移动版不支持模型），在 Z=0 处只有上半层，其他地方都是完整的方块，但在 PC 版中只是让玩家方块碰撞用，在关卡中没有具体的形状，你需要使用模型来使方块具有外观；
不推荐生成模型，会出现重叠的现象；（如果你实在想得不行，那好吧，我想应该还是可以的）
即使移动方块不在移动，游戏也会将其当作移动方块，因此一些机关（如在移动方块上 EDGE 时很可能会停在一块上而不会被另一块捡起）可能会失效，也可能会出现穿墙 BUG；
地板颜色为同一种颜色，而不是棋盘式的深浅相间；
不同的方格之间有很明显的线条分隔。
G 通道（模型主题）
192-255 (0xC0 - 0xFF)	默认主题，即 Level/@ModelTheme。具体值没有影响。
128-191 (0x80 - 0xBF)	使用除了上面一个以外最亮（即数字最小）的主题。具体值没有影响。
64-127 (0x40 - 0x7F)	使用除了上面两个以外较亮（即数字较小）的主题。具体值没有影响。
0-63 (0x00 - 0x3F)	还剩最后一个主题当然就归它啦。具体值没有影响。
B 通道（模型高度）
255 (0xFF)	生成一个完整的方块模型。
2-254 (0x02 - 0xFE)	生成只有上面 1/254 - 253/254 个方块的模型。
1 (0x01)	生成只有上面 0% 的方块模型。（即只有最顶上一层）
0 (0x00)	不为此方块生成模型。
常用高度：可掉落平台 13.2893%, 35, 0x23；半格 50%, 128, 0x80。
`;
    const rawDoc1 = `1.顶栏为level元素属性，勾选angle旁的勾选框使用angle，不勾选使用fov，不填为默认。修改属性后需要点击"应用"按钮应用修改。关卡名使用转义字符 &#10; 可以实现换行， &lt; 可以输入字符"<"

2.加载xml+png按钮可以加载关卡文件，将多个文件一起拖动到浏览器窗口也可以加载。也支持包含xml和png的zip。确认导入后可以选择导出当前关卡zip文件备份。

3.导出功能可以下载当前的xml和png，导出zip功能可以导出包含xml和png的压缩包。

4.点击新建项目按钮新建项目后，可以选择导出当前关卡zip文件备份。

5.编译功能 可以选择xml和png进行编译，也支持包含xml和png的zip。点击 导入当前关卡 可以导入编辑器中当前关卡，然后点击编译即可输出bin和eso，也可以选择分别下载和下载zip，可以自定义关卡文件名（不是关卡名，但默认文件名和关卡名一致），也可以选择不生成eso模型。

6.勾选编译手机版，编译结果为评分时间适用于手机的文件。勾选原版风格模型可以生成和原版相同的模型，不勾选则生成的eso外观和原版有区别。

7.反编译可以导入bin文件，结果为多个png文件和xml文件，可以选择分别下载和下载zip

8."层"左侧的箭头为收起/展开顶栏的按钮

9.层数可以输入数值或按+/-按钮调整

10.工具栏可以选择不同元素，选择单点和画笔模式

11.清空层 按钮可以清空该层所有的静态方块

12.点击"3D编辑"按钮可以打开3d编辑界面界面宽度通过"3d宽度"拖动条和输入框调整。

13.3d模式中，选择模式点击元素可以选择，编辑模式可以进行编辑，选择除橡皮擦以外的工具时，左键放置元素，右键删除元素，选择橡皮擦时，左键删除元素。 按P键可以在镜头位置放置当前选择的元素。

14.元素半径通过虚线框显示在2d和3d界面，bumper撞击方向用面对角线显示

15."自动命名"勾选框勾选后可以自动为移动方块，撞击器和按钮添加id，有id的元素可以被引用

16."保留上次属性"勾选框勾选后再次添加id可以保留上个元素的属性

17.统一运动勾选框，勾选后选择一个移动方块，后续添加的移动方块都会与被选择的那个一起运动(使用relatedto)

18.右下角元素列表可以筛选不同的元素，存档点可以通过按上下按钮排序，一个存档点被触发后，它之前的所有存档点都会失效

19.元素列表中按钮序列右侧按键可以展开子按钮元素列表，子按钮元素右侧的排序按钮可以给按钮序列排序

20.提示方块和黑暗方块的按键事件元素可以通过文本导入

21.压缩包里的按键事件录制器可以录制按键事件并输出xml格式的按键事件元素，可以在后台录制，可以在操作游戏时录制游戏内的操作。输出的文本可以在编辑器中导入

22.底栏有坐标显示和元素数量统计，也可以控制可见的元素，勾选为可见，不勾选为不可见，在2d和3d界面中都生效

23.可以用像素颜色控制方块类型，静态方块模型主题和高度，详情见格式参考-关卡地图部分

24..撤销/重做功能做多可保存50步操作。快捷键：Ctrl+Z / Ctrl+Y

25.拆分路点功能：可以把一个路点拆分成多个来避免traveltime太长时可能出现的回弹bug，点击拆分，输入拆分份数就可以等分路点，效果和拆分前一致，可能要注意改一下循环索引
`;

	// 转义 XML 标签
	const escapedDoc = rawDoc.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escapedDoc1 = rawDoc1.replace(/</g, '&lt;').replace(/>/g, '&gt;');

	const helpContent = `
        <div class="section">
			<h3>📄 使用说明</h3>
            <pre style="font-family: 'Consolas', monospace; font-size: 12px; line-height: 1.6; color: #ccc; background: #0a0a1a; padding: 16px; border-radius: 6px; overflow-x: auto; white-space: pre-wrap; word-break: break-all;">${escapedDoc1}</pre>
			<h3>📄 Edge 关卡格式参考</h3>
			<p>以下内容摘自 EDGEFans 镜像(https://github.com/Mygod/edgefans-archive)</p>
			<pre style="font-family: 'Consolas', monospace; font-size: 12px; line-height: 1.6; color: #ccc; background: #0a0a1a; padding: 16px; border-radius: 6px; overflow-x: auto; white-space: pre-wrap; word-break: break-all;">${escapedDoc}</pre>
		</div>
	`;

	// 填充帮助内容
	if (helpBody) helpBody.innerHTML = helpContent;

	// 打开帮助
	const helpBtn = document.getElementById('helpBtn');
	if (helpBtn) {
		helpBtn.addEventListener('click', function() {
			if (helpSidebar) helpSidebar.classList.add('active');
			if (helpOverlay) helpOverlay.classList.add('active');
		});
	}

	// 关闭帮助
	if (helpCloseBtn) {
		helpCloseBtn.addEventListener('click', function() {
			if (helpSidebar) helpSidebar.classList.remove('active');
			if (helpOverlay) helpOverlay.classList.remove('active');
		});
	}

	// 点击遮罩关闭
	if (helpOverlay) {
		helpOverlay.addEventListener('click', function() {
			if (helpSidebar) helpSidebar.classList.remove('active');
			if (helpOverlay) helpOverlay.classList.remove('active');
		});
	}

	// ESC 键关闭
	document.addEventListener('keydown', function(e) {
		if (e.key === 'Escape' && helpSidebar && helpSidebar.classList.contains('active')) {
			if (helpSidebar) helpSidebar.classList.remove('active');
			if (helpOverlay) helpOverlay.classList.remove('active');
		}
	});
	
	// 初始化画布宽度
	const canvasWrap = document.getElementById('canvasWrap');
	canvasWrap.style.width = '100%';
	canvasWrap.style.transition = 'width 0.4s ease';
	
	// 3D 宽度控制
	const width3dSlider = document.getElementById('width3dSlider');
	const width3dNumber = document.getElementById('width3dNumber');

	function set3DWidth(value) {
		value = Math.max(5, Math.min(95, value));
		width3dSlider.value = value;
		width3dNumber.value = value;
		const container = document.getElementById('view3dContainer');
		if (container.classList.contains('active')) {
			container.style.flex = `0 0 ${value}%`;
			// 调整后重新渲染3D
			setTimeout(() => {
				resizeThreeRenderer();
				render3D();
			}, 50);
		}
	}

	width3dSlider.addEventListener('input', function() {
		set3DWidth(parseInt(this.value));
	});

	width3dNumber.addEventListener('change', function() {
		let val = parseInt(this.value) || 50;
		set3DWidth(val);
	});

	// 3D预览按钮 - 使用当前宽度
	document.getElementById('toggle3dBtn').addEventListener('click', function() {
		show3D();
	});

	// 确保关闭按钮正常工作
	document.getElementById('close3dBtn').addEventListener('click', function() {
		hide3D();
	});
	
	// 重置视角按钮
	document.getElementById('resetCameraBtn').addEventListener('click', function() {
		resetCamera();
	});

	// 3D预览按钮 - 刷新时保留视角
	document.getElementById('toggle3dBtn').addEventListener('click', function() {
		show3D();
	});
	
	document.getElementById('exportZipBtn').addEventListener('click', exportZip);
	
	document.getElementById('newProjectBtn').addEventListener('click', newProject);
	
	// 恢复绘制模式高亮
	const singleBtn = document.getElementById('toolSingle');
	const brushBtn = document.getElementById('toolBrush');
	if (state.drawMode === 'brush') {
		brushBtn.classList.add('active');
		singleBtn.classList.remove('active');
	} else {
		singleBtn.classList.add('active');
		brushBtn.classList.remove('active');
	}
	
	document.getElementById('levelUseAngle').addEventListener('change', function() {
		state.levelUseAngle = this.checked;
		syncLevelUI();
	});
	
	updateLayerMax();
	
	// ===== 拖放加载 =====
	document.addEventListener('dragover', function(e) {
		e.preventDefault();
		e.dataTransfer.dropEffect = 'copy';
	});

    document.addEventListener('drop', async function(e) {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) return;
        
        // ---- ZIP 优先分支 ----
        if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
            if (!confirm('检测到 ZIP 文件，是否确认导入？\n\n点击【确定】→ 继续导入\n点击【取消】→ 取消导入')) {
                return;
            }
            if (hasProjectData()) {
                const exportFirst = confirm(
                    '是否先导出当前项目为 ZIP？\n\n' +
                    '点击【确定】→ 先导出，再导入\n' +
                    '点击【取消】→ 不导出，直接导入'
                );
                if (exportFirst) {
                    exportZip();
                    await new Promise(r => setTimeout(r, 200));
                }
            }
            await loadFromZip(files[0]);
            return;
        }
        
        let hasXml = false, hasPng = false;
        for (let f of files) {
            if (f.name.toLowerCase().endsWith('.xml')) hasXml = true;
            if (f.name.toLowerCase().endsWith('.png')) hasPng = true;
        }
        if (!hasXml && !hasPng) {
            showToast('请拖入 XML / PNG / ZIP 文件');
            return;
        }
        // 1. 先确认导入
        if (!confirm('检测到拖入的文件，是否确认导入？\n\n点击【确定】→ 继续导入\n点击【取消】→ 取消导入')) {
            return;
        }
        // 2. 再问是否导出当前项目
        if (hasProjectData()) {
            const exportFirst = confirm(
                '是否先导出当前项目为 ZIP？\n\n' +
                '点击【确定】→ 先导出，再导入\n' +
                '点击【取消】→ 不导出，直接导入'
            );
            if (exportFirst) {
                exportZip();
                setTimeout(() => loadXMLAndPNG(files), 150);
                return;
            }
        }
        loadXMLAndPNG(files);
    });
	
	// 在 init 函数末尾（或 DOMContentLoaded 回调内）添加：
	document.addEventListener('touchend', () => {
		state.isDrawing = false;
	});
	document.addEventListener('touchcancel', () => {
		state.isDrawing = false;
	});
	
	// ---- 3D 视图控制 ----
	const cameraDistInput = document.getElementById('cameraDistInput');
	if (cameraDistInput) {
		// 初始化默认距离
		const { w, l, h } = state.level.size;
		const maxDim = Math.max(w, l, h);
		const defaultDist = maxDim * 1.8 + 6;
		cameraDistInput.value = defaultDist.toFixed(1);
		
		cameraDistInput.addEventListener('change', function() {
			let val = parseFloat(this.value);
			if (isNaN(val) || val < 0.1) val = 0.1;
			if (val > 200) val = 200;
			this.value = val.toFixed(1);
			setCameraDistance(val, true);
		});
		
		cameraDistInput.addEventListener('input', function() {
			let val = parseFloat(this.value);
			if (!isNaN(val) && val >= 0.1 && val <= 200) {
				setCameraDistance(val, false);
			}
		});
	}

	// 正视图按钮
	document.getElementById('viewFrontBtn').addEventListener('click', setViewFront);
	// 俯视图按钮
	document.getElementById('viewTopBtn').addEventListener('click', setViewTop);
	document.getElementById('viewSideBtn').addEventListener('click', setViewSide);
	// 重置视角时同步输入框
	const origResetCamera = resetCamera;
	resetCamera = function() {
		origResetCamera();
		const input = document.getElementById('cameraDistInput');
		if (input && threeCamera) {
			const dist = threeCamera.position.distanceTo(threeControls.target);
			input.value = dist.toFixed(1);
		}
	};
	// 覆盖原来的 resetCamera 引用（若需要）
	window.resetCamera = resetCamera;
	
	threeContainer = document.getElementById('threeContainer');
	// 鼠标移动（更新准星位置，射线检测高亮）
	threeContainer.addEventListener('pointermove', onPointerMove);
	threeContainer.addEventListener('pointerdown', onPointerDown);
	threeContainer.addEventListener('pointerup', onPointerUp);
	// 键盘事件
	document.addEventListener('keydown', onKeyDown);
	document.addEventListener('keyup', onKeyUp);
	
	threeContainer.addEventListener('contextmenu', (e) => e.preventDefault());
	
	document.getElementById('modePreview').addEventListener('click', () => setInteractionMode('preview'));
	document.getElementById('modeSelect').addEventListener('click', () => setInteractionMode('select'));
	document.getElementById('modeEdit').addEventListener('click', () => setInteractionMode('edit'));
	
	document.addEventListener('keydown', (e) => {
		if (e.key === 'p' && state.interactionMode === 'edit') {
			const cameraPos = threeCamera.position;
			const { w, l } = state.level.size;
			const centerX = w / 2;
			const centerZ = l / 2;
			// 将相机世界坐标转换为网格坐标（假设地面 y=0）
			let x = Math.round(cameraPos.x + centerX - 0.5);
			let z = Math.round(cameraPos.z + centerZ - 0.5);
			let y = Math.round(cameraPos.y - 0.5); // 高度
			// 可选：限制在关卡范围内
			/*x = Math.max(0, Math.min(w - 1, x));
			z = Math.max(0, Math.min(l - 1, z));
			y = Math.max(0, Math.min(state.level.size.h - 1, y));*/
			placeElementAt(state.currentTool, x, z, y);
		}
	});
	
	// ========== 事件委托（代替每个像素上的独立监听） ==========

	canvas.addEventListener('click', function(e) {
        // 添加模式下由 mousedown 负责，click 不再重复放
        if (state.canvasEditMode === 'add'/* && state.currentTool !== 'eraser'*/) return;
		const rect = canvas.getBoundingClientRect();
		const scaleX = canvas.width / rect.width;
		const scaleY = canvas.height / rect.height;
		const mouseX = (e.clientX - rect.left) * scaleX;
		const mouseY = (e.clientY - rect.top) * scaleY;
		const pixelSize = PIXEL_SIZE;
		const padding = PADDING;
		const gridX = Math.floor((mouseX - padding) / pixelSize);
		const gridY = Math.floor((mouseY - padding) / pixelSize);
		const realX = currentMinX + gridX;
		const realY = currentMinY + gridY;
		// 获取 staticCoord 和 elemIdsStr
		const entries = getEntriesAt(realX, realY, state.currentLayer);
		const elemIds = entries.filter(e => e.type !== 'waypoint').map(e => ({ type: e.type, id: e.id }));
		const elemIdsStr = elemIds.length > 0 ? JSON.stringify(elemIds) : null;
		const staticCoord = getStaticCoord(realX, realY, state.currentLayer);
		handlePixelClick(realX, realY, state.currentLayer, staticCoord, elemIdsStr);
	});

	// ===== 画笔模式事件（改进） =====
	// 定义一个处理点击的函数，根据鼠标位置执行点击逻辑
	function processClickAt(clientX, clientY) {
		const rect = canvas.getBoundingClientRect();
		const scaleX = canvas.width / rect.width;
		const scaleY = canvas.height / rect.height;
		const mouseX = (clientX - rect.left) * scaleX;
		const mouseY = (clientY - rect.top) * scaleY;
		const pixelSize = PIXEL_SIZE;
		const padding = PADDING;
		const gridX = Math.floor((mouseX - padding) / pixelSize);
		const gridY = Math.floor((mouseY - padding) / pixelSize);
		const realX = currentMinX + gridX;
		const realY = currentMinY + gridY;
		// 检查坐标是否在有效范围内（防止负数或超出）
		if (isNaN(realX) || isNaN(realY)) return;
		// ===== 新增：检查是否在当前网格范围内 =====
		if (realX < currentMinX || realX >= currentMinX + _currentGridW || realY < currentMinY || realY >= currentMinY + _currentGridH) {
			return;
		}
		// ===== 新增结束 =====
		const entries = getEntriesAt(realX, realY, state.currentLayer);
		const elemIds = entries.filter(e => e.type !== 'waypoint').map(e => ({ type: e.type, id: e.id }));
		const elemIdsStr = elemIds.length > 0 ? JSON.stringify(elemIds) : null;
		const staticCoord = getStaticCoord(realX, realY, state.currentLayer);
		handlePixelClick(realX, realY, state.currentLayer, staticCoord, elemIdsStr);
	}

    let _longPressTimer = null;
    let _longPressDelayTimer = null;
    let _longPressPos = { x: 0, y: 0 };
    let _longPressCell = { x: NaN, y: NaN };

    canvas.addEventListener('mousedown', function(e) {
        if (state.canvasEditMode === 'add'/* && state.currentTool !== 'eraser'*/) {
            state._addSessionActive = true;
            state._addSessionRecorded = false;
            _longPressPos = { x: e.clientX, y: e.clientY };

            // 记录起始格子
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const gx = Math.floor(((e.clientX - rect.left) * scaleX - PADDING) / PIXEL_SIZE);
            const gy = Math.floor(((e.clientY - rect.top) * scaleY - PADDING) / PIXEL_SIZE);
            _longPressCell = { x: currentMinX + gx, y: currentMinY + gy };

            // 立即放一个
            processClickAt(e.clientX, e.clientY);

            // 启动 1 秒延时
            clearTimeout(_longPressDelayTimer);
            clearInterval(_longPressTimer);
            _longPressTimer = null;
            _longPressDelayTimer = setTimeout(() => {
                _longPressTimer = setInterval(() => {
                    processClickAt(_longPressPos.x, _longPressPos.y);
                }, 400);
            }, 1000);

            return;
        }

        if (state.drawMode !== 'brush') return;
        state.isDrawing = true;
        state._brushSessionActive = true;
        state._brushSessionRecorded = false;
        _lastBrushPos = null;
        processClickAt(e.clientX, e.clientY);
    });

	// 鼠标移动：如果正在绘制且为画笔模式，持续绘制
	canvas.addEventListener('mousemove', function(e) {
        // 添加模式：更新位置 + 重置 1 秒延时
        if (state._addSessionActive) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const gx = Math.floor(((e.clientX - rect.left) * scaleX - PADDING) / PIXEL_SIZE);
            const gy = Math.floor(((e.clientY - rect.top) * scaleY - PADDING) / PIXEL_SIZE);
            const realX = currentMinX + gx;
            const realY = currentMinY + gy;

            if (!isNaN(realX) && !isNaN(realY)) {
                mouseCoord.textContent = `(${realX}, ${realY}, ${state.currentLayer})`;
            }

            // 进入新格子就立即放一个（画笔行为）
            if (realX !== _longPressCell.x || realY !== _longPressCell.y) {
                _longPressCell = { x: realX, y: realY };
                _longPressPos = { x: e.clientX, y: e.clientY };
                processClickAt(e.clientX, e.clientY);
            } else {
                // 同格内移动只更新光标位置
                _longPressPos = { x: e.clientX, y: e.clientY };
            }

            // 每次移动都重置 1 秒延时
            clearTimeout(_longPressDelayTimer);
            clearInterval(_longPressTimer);
            _longPressTimer = null;
            _longPressDelayTimer = setTimeout(() => {
                _longPressTimer = setInterval(() => {
                    processClickAt(_longPressPos.x, _longPressPos.y);
                }, 300);
            }, 1000);

            return;
        }

		const rect = canvas.getBoundingClientRect();
		const scaleX = canvas.width / rect.width;
		const scaleY = canvas.height / rect.height;
		const mouseX = (e.clientX - rect.left) * scaleX;
		const mouseY = (e.clientY - rect.top) * scaleY;
		const pixelSize = PIXEL_SIZE;
		const padding = PADDING;
		const gridX = Math.floor((mouseX - padding) / pixelSize);
		const gridY = Math.floor((mouseY - padding) / pixelSize);
		const realX = currentMinX + gridX;
		const realY = currentMinY + gridY;
		
		// 更新坐标显示
		if (!isNaN(realX) && !isNaN(realY)) {
			mouseCoord.textContent = `(${realX}, ${realY}, ${state.currentLayer})`;
		} else {
			mouseCoord.textContent = '( -, - )';
		}
		
		// 画笔模式绘制（增加位置去重）
		if (state.isDrawing && state.drawMode === 'brush') {
			if (_lastBrushPos && _lastBrushPos.x === realX && _lastBrushPos.y === realY) {
				return;
			}
			_lastBrushPos = { x: realX, y: realY };
			processClickAt(e.clientX, e.clientY);
		}
	});

	// 鼠标松开：结束绘制
    canvas.addEventListener('mouseup', function(e) {
        // 添加模式：清掉所有计时器
        if (state._addSessionActive) {
            clearTimeout(_longPressDelayTimer);
            clearInterval(_longPressTimer);
            _longPressDelayTimer = null;
            _longPressTimer = null;
            state._addSessionActive = false;
            state._addSessionRecorded = false;
            return;
        }

        // 原有画笔逻辑
        state.isDrawing = false;
        state._brushSessionActive = false;
        state._brushSessionRecorded = false;
        _lastBrushPos = null;
    });

	// 鼠标离开画布：清除绘制状态和坐标显示
    canvas.addEventListener('mouseleave', function() {
        if (state._addSessionActive) {
            clearTimeout(_longPressDelayTimer);
            clearInterval(_longPressTimer);
            _longPressDelayTimer = null;
            _longPressTimer = null;
            state._addSessionActive = false;
            state._addSessionRecorded = false;
        }
        state.isDrawing = false;
        state._brushSessionActive = false;
        state._brushSessionRecorded = false;
        _lastBrushPos = null;
        mouseCoord.textContent = '( -, - )';
    });

	// 触摸事件（移动端支持）
	canvas.addEventListener('touchstart', function(e) {
		if (state.drawMode !== 'brush') return;
		e.preventDefault();
		state.isDrawing = true;
        state._brushSessionActive = true;      // ← 新增
        state._brushSessionRecorded = false;   // ← 新增
		_lastBrushPos = null;
		const touch = e.touches[0];
		processClickAt(touch.clientX, touch.clientY);
	}, { passive: false });

	canvas.addEventListener('touchmove', function(e) {
		if (!state.isDrawing || state.drawMode !== 'brush') return;
		e.preventDefault();
		const touch = e.touches[0];
		const rect = canvas.getBoundingClientRect();
		const scaleX = canvas.width / rect.width;
		const scaleY = canvas.height / rect.height;
		const mouseX = (touch.clientX - rect.left) * scaleX;
		const mouseY = (touch.clientY - rect.top) * scaleY;
		const pixelSize = PIXEL_SIZE;
		const padding = PADDING;
		const gridX = Math.floor((mouseX - padding) / pixelSize);
		const gridY = Math.floor((mouseY - padding) / pixelSize);
		const realX = currentMinX + gridX;
		const realY = currentMinY + gridY;
		// 位置去重
		if (_lastBrushPos && _lastBrushPos.x === realX && _lastBrushPos.y === realY) {
			return;
		}
		_lastBrushPos = { x: realX, y: realY };
		processClickAt(touch.clientX, touch.clientY);
	}, { passive: false });

	canvas.addEventListener('touchend', function(e) {
		state.isDrawing = false;
        state._brushSessionActive = false;     // ← 新增
        state._brushSessionRecorded = false;   // ← 新增
		_lastBrushPos = null;
	});

	const gridWrapper = document.getElementById('gridWrapper');
	if (gridWrapper) {
		gridWrapper.style.cssText = 
			'display:flex; justify-content:flex-start; align-items:flex-start; ' +
			'flex-shrink:0; position:relative; overflow:visible; ' +
			'width:auto; height:auto;';
	}

	// ===== 鼠标移动：更新坐标 + 画笔模式绘制 =====
	canvas.addEventListener('mousemove', function(e) {
		const rect = canvas.getBoundingClientRect();
		const scaleX = canvas.width / rect.width;
		const scaleY = canvas.height / rect.height;
		const mouseX = (e.clientX - rect.left) * scaleX;
		const mouseY = (e.clientY - rect.top) * scaleY;
		const pixelSize = PIXEL_SIZE;
		const padding = PADDING;
		const gridX = Math.floor((mouseX - padding) / pixelSize);
		const gridY = Math.floor((mouseY - padding) / pixelSize);
		const realX = currentMinX + gridX;
		const realY = currentMinY + gridY;
		
		// 更新坐标显示
		if (!isNaN(realX) && !isNaN(realY)) {
			mouseCoord.textContent = `(${realX}, ${realY}, ${state.currentLayer})`;
		} else {
			mouseCoord.textContent = '( -, - )';
		}
		
		// 画笔模式：鼠标按下并移动时持续绘制
		if (state.isDrawing && state.drawMode === 'brush') {
			// 直接触发点击事件，坐标由 click 事件重新计算
			// 但为了准确，传递当前鼠标位置
			const clickEvent = new MouseEvent('click', {
				clientX: e.clientX,
				clientY: e.clientY,
			});
			canvas.dispatchEvent(clickEvent);
		}
	});

	// 鼠标离开画布时清除坐标显示
	canvas.addEventListener('mouseleave', function() {
		mouseCoord.textContent = '( -, - )';
	});

	canvas.addEventListener('mouseleave', function() {
		mouseCoord.textContent = '( -, - )';
	});
	//canvas.style.imageRendering = 'crisp-edges';   // 'pixelated'或 'crisp-edges'
	canvas.style.transformOrigin = '0 0';
	canvas.style.position = 'absolute';
	canvas.style.top = '0';
	canvas.style.left = '0';
	
	document.getElementById('elemFilterSelect').addEventListener('change', function() {
		updateElemList();
	});

	(function initLevelPropsToggle() {
		const btn = document.getElementById('toggleLevelPropsBtn');
		const area = document.getElementById('levelPropsArea');
		if (!btn || !area) return;

		const STORAGE_KEY = 'level_props_collapsed';

		function applyState(collapsed) {
			area.classList.toggle('collapsed', collapsed);
			btn.textContent = collapsed ? '▼' : '▲';
			btn.title = collapsed ? '展开 Level 属性' : '折叠 Level 属性';
		}

		// 从 localStorage 恢复上次状态
		let saved = false;
		try {
			saved = localStorage.getItem(STORAGE_KEY) === 'true';
		} catch (e) {}
		applyState(saved);

		btn.addEventListener('click', function() {
			const collapsed = !area.classList.contains('collapsed');
			applyState(collapsed);
			try {
				localStorage.setItem(STORAGE_KEY, String(collapsed));
			} catch (e) {}
		});
	})();
    
    (function enableLiveLevelProps() {
        const area = document.getElementById('levelPropsArea');
        if (!area) return;
        const applyLive = (() => {
            let t = null;
            return () => {
                clearTimeout(t);
                t = setTimeout(() => {
                    try { applyLevel(); } catch (e) { /* 忽略中间态 */ }
                }, 150);
            };
        })();
        area.querySelectorAll('input').forEach(el => {
            const isSize = ['sizeW','sizeL','sizeH'].includes(el.id);
            el.addEventListener(isSize ? 'change' : 'input', applyLive);
        });
    })();

	state._lastSavedSnapshot = _serializeHistory();
    state._undoStack = [];
    state._redoStack = [];
    
    document.addEventListener('keydown', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
        const isMac = navigator.platform.toUpperCase().includes('MAC');
        const ctrl = isMac ? e.metaKey : e.ctrlKey;
        if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            undo();
        } else if ((ctrl && e.shiftKey && e.key.toLowerCase() === 'z') ||
                   (ctrl && e.key.toLowerCase() === 'y')) {
            e.preventDefault();
            redo();
        }
    });
    document.getElementById('undoBtn')?.addEventListener('click', undo);
    document.getElementById('redoBtn')?.addEventListener('click', redo);
    
    document.getElementById('canvasAddMode').addEventListener('change', function() {
        setCanvasEditMode(this.checked ? 'add' : 'select');
    });
    
    document.getElementById('toolWaypoint').addEventListener('click', () => setTool('waypoint'));

    const pmBtn = document.getElementById('projectManagerBtn');
    if (pmBtn) pmBtn.addEventListener('click', () => window.PM.open());
    
    document.getElementById('toolMultiSelect').addEventListener('click', () => {
        setTool('multiselect');
        // 可选：清空之前的选择
        state.multiSelection = [];
        requestRender();
    });

    // 如果 edgelxe_select.js 提供了初始化函数
    if (typeof initMultiSelect === 'function') initMultiSelect();
    
    document.getElementById('toolMultiSelect').addEventListener('click', () => {
        setTool('multiselect');
        state.multiSelection = [];
        document.getElementById('msEmptyLabel').hidden = false;
        requestRender();
    });

	fixFormFieldAssociations(document);
	setInteractionMode('preview');
	showToast('Edge 关卡xml编辑器3D 已启动');
}

document.addEventListener('DOMContentLoaded', init);