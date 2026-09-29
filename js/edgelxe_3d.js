// ===== 3D 预览 =====
let threeScene = null;
let threeCamera = null;
let threeRenderer = null;
let threeControls = null;
let threeObjects = [];

let raycaster = null;
let pointer = null;

function ensureRaycasterReady() {
    if (typeof THREE === 'undefined') return false;
    if (!raycaster) raycaster = new THREE.Raycaster();
    if (!pointer) pointer = new THREE.Vector2();
    return true;
}

let mouseDownPos = { x: 0, y: 0 };
let isDragging = false;

function initThree() {
	if (!ensureRaycasterReady()) {
        console.warn('THREE 尚未加载，稍后重试');
        return;
    }
	const container = document.getElementById('threeContainer');
	// 如果已经初始化，直接返回
	if (threeRenderer) return;
	
	const width = container.clientWidth || 400;
	const height = container.clientHeight || 400;
	
	// 场景
	const scene = new THREE.Scene();
	scene.background = new THREE.Color(0x1a1a2e);
	
	// 相机
	const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
	camera.position.set(15, 12, 15);
	camera.lookAt(0, 0, 0);
	
	// 渲染器
	const renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setSize(width, height);
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	container.appendChild(renderer.domElement);
	
	// 控制器
	const controls = new THREE.OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.08;
	controls.autoRotate = false;
	controls.target.set(0, 0.5, 0);
	controls.minDistance = 0.1;
	controls.maxDistance = 200;
	controls.addEventListener('change', function() {
		// 如果用户正在编辑输入框，不更新输入框的值，避免干扰输入
		const input = document.getElementById('cameraDistInput');
		if (document.activeElement === input) return;
		const dist = threeCamera.position.distanceTo(controls.target);
		if (input) {
			input.value = dist.toFixed(1);
		}
	});
	// 灯光
	const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
	scene.add(ambientLight);
	
	const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
	dirLight.position.set(10, 20, 10);
	dirLight.castShadow = true;
	dirLight.shadow.mapSize.width = 1024;
	dirLight.shadow.mapSize.height = 1024;
	scene.add(dirLight);
	
	const fillLight = new THREE.DirectionalLight(0x8888ff, 0.4);
	fillLight.position.set(-10, 5, -10);
	scene.add(fillLight);
	
	const rimLight = new THREE.DirectionalLight(0xffaa66, 0.3);
	rimLight.position.set(0, -5, 15);
	scene.add(rimLight);
	
	// 网格地面
	const gridHelper = new THREE.GridHelper(30, 30, 0x6688aa, 0x334466);
	gridHelper.position.y = -0.01;
	scene.add(gridHelper);
	
	// 地面半透明平面（接收阴影）
	const groundGeo = new THREE.PlaneGeometry(30, 30);
	const groundMat = new THREE.ShadowMaterial({ opacity: 0.3 });
	const ground = new THREE.Mesh(groundGeo, groundMat);
	ground.rotation.x = -Math.PI / 2;
	ground.position.y = -0.01;
	ground.receiveShadow = true;
	scene.add(ground);
	
	threeScene = scene;
	threeCamera = camera;
	threeRenderer = renderer;
	threeControls = controls;
	
	// 启动动画循环
	animate3D();
}

function animate3D() {
    requestAnimationFrame(animate3D);
    // 键盘移动（仅在非预览模式？或任何模式都可）
    const speed = 0.1;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(threeCamera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(threeCamera.quaternion);
    const up = new THREE.Vector3(0, 1, 0);
    let move = new THREE.Vector3();
    if (keys.w) move.add(forward);
    if (keys.s) move.sub(forward);
    if (keys.a) move.sub(right);
    if (keys.d) move.add(right);
    if (keys.space) move.add(up);
    if (keys.shift) move.sub(up);
    if (move.length() > 0) {
        move.multiplyScalar(speed);
        threeControls.target.add(move);
        threeCamera.position.add(move);
        threeControls.update();
    }
    if (threeControls) threeControls.update();
    threeRenderer.render(threeScene, threeCamera);
}

// 3D 相机状态管理
let isFirst3DRender = true;

// 重置相机到默认视角
function resetCamera() {
	if (!threeCamera || !threeControls) return;
	const { w, l, h } = state.level.size;
	const maxDim = Math.max(w, l, h);
	const distance = maxDim * 1.8 + 6;
	threeCamera.position.set(distance * 0.6, distance * 0.7, distance * 0.6);
	threeControls.target.set(0, h/2 * 0.5, 0);
	threeControls.update();
}

// ---- 获取当前相机方向向量（归一化） ----
function getCameraDirection() {
	if (!threeCamera || !threeControls) return null;
	const target = threeControls.target;
	const dir = new THREE.Vector3().copy(threeCamera.position).sub(target);
	if (dir.length() < 0.001) return null;
	return dir.clone().normalize();
}

// ---- 设置相机距离（保持方向不变） ----
function setCameraDistance(dist, updateInput = true) {
	if (!threeCamera || !threeControls) return;
	dist = Math.max(0.1, Math.min(200, dist));
	const dir = getCameraDirection();
	if (!dir) {
		const { w, l, h } = state.level.size;
		const maxDim = Math.max(w, l, h);
		const defaultDist = maxDim * 1.8 + 6;
		const ratio = dist / defaultDist;
		threeCamera.position.set(
			threeCamera.position.x * ratio,
			threeCamera.position.y * ratio,
			threeCamera.position.z * ratio
		);
	} else {
		const target = threeControls.target;
		threeCamera.position.copy(target).add(dir.clone().multiplyScalar(dist));
	}
	threeControls.update();
	// 只有 updateInput 为 true 时才更新输入框
	if (updateInput) {
		const input = document.getElementById('cameraDistInput');
		if (input) input.value = dist.toFixed(1);
	}
}

// ---- 设置视角方向 ----
function setViewDirection(dirVec, label) {
	if (!threeCamera || !threeControls) return;
	const input = document.getElementById('cameraDistInput');
	let dist = parseFloat(input ? input.value : 15);
	if (isNaN(dist) || dist < 0.1) dist = 15;
	dist = Math.max(0.1, Math.min(200, dist));
	const target = threeControls.target;
	const dir = dirVec.clone().normalize();
	threeCamera.position.copy(target).add(dir.multiplyScalar(dist));
	threeControls.update();
	// 更新输入框
	if (input) input.value = dist.toFixed(1);
	showToast(label + ' 视角');
}

// ---- 正视图 ----
function setViewFront() {
	setViewDirection(new THREE.Vector3(0, 0, 1), '正视图');
}

// ---- 俯视图 ----
function setViewTop() {
	setViewDirection(new THREE.Vector3(0, 1, 0), '俯视图');
}

function setViewSide() {
	setViewDirection(new THREE.Vector3(1, 0, 0), '侧视图');
}

const meshPool = new Map();   // 键为 "type:id"，值为 THREE.Mesh
const linePool = new Map();   // 存放虚线等辅助线（可选）

let selectedHighlightHelper = null;

const meshToElement = new Map(); // key: mesh, value: { type, id, data? }

let currentHighlightHelper = null;

function render3D() {
    if (!threeScene) {
        initThree();
    }
	
	// 清除旧的动态对象（非池化的）
	threeObjects.forEach(obj => {
		threeScene.remove(obj);
		if (obj.geometry) obj.geometry.dispose();
		if (obj.material) obj.material.dispose();
	});
	threeObjects = [];
	
    if (!threeScene) return;

    const { w, l, h } = state.level.size;
    const blockSize = 1;
    const gap = 0.04;
    const centerX = w / 2;
    const centerZ = l / 2;
	
	meshToElement.clear();   // 每次渲染重建映射
	
	// ---- 清理旧线条（Line 和 LineSegments） ----
    // 由于我们未池化线条，每次重建，所以需清除所有旧的线条
    const toRemoveLines = [];
    threeScene.children.forEach(child => {
        if (child.type === 'Line' || child.type === 'LineSegments') {
            toRemoveLines.push(child);
        }
    });
    toRemoveLines.forEach(line => {
        threeScene.remove(line);
        if (line.geometry) line.geometry.dispose();
        if (line.material) line.material.dispose();
    });


	
    // 记录本轮使用过的 Mesh 键
    const usedKeys = new Set();

	// 辅助：获取或创建 Mesh，更新位置和材质属性，并记录映射
	function getOrCreateMesh(key, createFn, updateFn, elemInfo) {
		let mesh = meshPool.get(key);
		if (!mesh) {
			mesh = createFn();
			meshPool.set(key, mesh);
			threeScene.add(mesh);
		}
		updateFn(mesh);
		usedKeys.add(key);
		if (elemInfo) {
			meshToElement.set(mesh, elemInfo);
		}
		return mesh;
	}

	// ---- 静态方块（池化） ----
	const staticBoxGeo = new THREE.BoxGeometry(blockSize - gap, blockSize - gap, blockSize - gap);
	for (let z = 0; z < h; z++) {
		const layer = state.staticBlocks[z] || Array.from({ length: l }, () => Array(w).fill(null));
		for (let y = 0; y < l; y++) {
			for (let x = 0; x < w; x++) {
				const staticBlock = layer[y] && layer[y][x];
				const key = `static:${x},${y},${z}`;
				if (staticBlock && state.visibility.static) {
					const color = new THREE.Color(`rgb(${staticBlock.r},${staticBlock.g},${staticBlock.b})`);
					const posX = x - centerX + 0.5;
					const posY = z + 0.5;
					const posZ = y - centerZ + 0.5;
					getOrCreateMesh(
						key,
						() => {
							const mat = new THREE.MeshStandardMaterial({
								color: color,
								roughness: 0.7,
								metalness: 0.1
							});
							const mesh = new THREE.Mesh(staticBoxGeo, mat);
							mesh.castShadow = true;
							mesh.receiveShadow = true;
							return mesh;
						},
						(mesh) => {
							mesh.position.set(posX, posY, posZ);
							mesh.material.color.copy(color);
						},
						{ type: 'static', coord: { x, y, z } }
					);
				}
			}
		}
	}

	// ---- 移动平台 ----
	const movingGeo = new THREE.BoxGeometry(blockSize - gap, blockSize - gap, blockSize - gap);
	state.movingPlatforms.forEach(mp => {
		if (!state.visibility.moving) return;
		const pos = getMovingPos(mp);
		if (!pos) return;
		const key = `moving:${mp.id}`;
		getOrCreateMesh(
			key,
			() => {
				const mat = new THREE.MeshStandardMaterial({
					color: 0x4488FF,
					transparent: true,
					opacity: 0.7,
					roughness: 0.5,
					metalness: 0.2,
					emissive: 0x4488FF,
					emissiveIntensity: 0.05
				});
				const mesh = new THREE.Mesh(movingGeo, mat);
				mesh.castShadow = true;
				mesh.receiveShadow = true;
				return mesh;
			},
			(mesh) => {
				mesh.position.set(pos.x - centerX + 0.5, pos.z + 0.5, pos.y - centerZ + 0.5);
			},
			{ type: 'moving', id: mp.id }
		);
	});

	// ---- 掉落平台 ----
	const fallingSize = blockSize - gap;
	const fallingHeight = fallingSize * 0.1;
	const fallingGeo = new THREE.BoxGeometry(fallingSize, fallingHeight, fallingSize);
	state.fallingPlatforms.forEach(fp => {
		if (!state.visibility.falling) return;
		const pos = { x: fp.x, y: fp.y, z: fp.z };
		if (pos.x === undefined) return;
		const key = `falling:${fp.id}`;
		const offsetY = 0.5 - fallingHeight / 2;
		getOrCreateMesh(
			key,
			() => {
				const mat = new THREE.MeshStandardMaterial({
					color: 0xFF8800,
					roughness: 0.5,
					metalness: 0.2
				});
				const mesh = new THREE.Mesh(fallingGeo, mat);
				mesh.castShadow = true;
				mesh.receiveShadow = true;
				return mesh;
			},
			(mesh) => {
				mesh.position.set(
					pos.x - centerX + 0.5,
					pos.z + 0.5 + offsetY,
					pos.y - centerZ + 0.5
				);
			},
			{ type: 'falling', id: fp.id }
		);
	});

	// ---- 棱柱 ----
	const prismSize = blockSize * 0.2;
	const prismGeo = new THREE.BoxGeometry(prismSize, prismSize, prismSize);
	state.prisms.forEach(p => {
		if (!state.visibility.prism) return;
		const pos = { x: p.x, y: p.y, z: p.z };
		if (pos.x === undefined) return;
		const key = `prism:${p.id}`;
		getOrCreateMesh(
			key,
			() => {
				const mat = new THREE.MeshStandardMaterial({
					color: 0x00FFFF,
					roughness: 0.5,
					metalness: 0.2,
					emissive: 0x00FFFF,
					emissiveIntensity: 0.05
				});
				const mesh = new THREE.Mesh(prismGeo, mat);
				mesh.castShadow = true;
				mesh.receiveShadow = true;
				return mesh;
			},
			(mesh) => {
				mesh.position.set(
					pos.x - centerX + 0.5,
					pos.z + 0.5,
					pos.y - centerZ + 0.5
				);
			},
			{ type: 'prism', id: p.id }
		);
	});

	// ---- 尺寸调整器 (Resizer) ----
	state.resizers.forEach(r => {
		if (!state.visibility.resizer) return;
		const pos = { x: r.x, y: r.y, z: r.z };
		const px = pos.x - centerX + 0.5;
		const py = pos.z + 0.02;
		const pz = pos.y - centerZ + 0.5;
		const isGrow = r.type === 'grow';
		const color = isGrow ? 0x88FF88 : 0x88AA88;
		const half = blockSize * 0.4;

		// 定义两个三角形顶点
		let tri1, tri2;
		if (isGrow) {
			tri1 = [
				new THREE.Vector3(-half * 0.8, 0, 0),
				new THREE.Vector3( half * 0.8, 0, 0),
				new THREE.Vector3(0, 0, -half * 1.2)
			];
			tri2 = [
				new THREE.Vector3(-half * 0.8, 0, 0),
				new THREE.Vector3( half * 0.8, 0, 0),
				new THREE.Vector3(0, 0,  half * 1.2)
			];
		} else {
			tri1 = [
				new THREE.Vector3(-half * 0.8, 0, -half * 1.2),
				new THREE.Vector3( half * 0.8, 0, -half * 1.2),
				new THREE.Vector3(0, 0, 0)
			];
			tri2 = [
				new THREE.Vector3(-half * 0.8, 0,  half * 1.2),
				new THREE.Vector3( half * 0.8, 0,  half * 1.2),
				new THREE.Vector3(0, 0, 0)
			];
		}

		// 池化两个三角形（分别用不同 key）
		const key1 = `resizer_1:${r.id}`;
		const key2 = `resizer_2:${r.id}`;

		const createTriMeshFn = (points) => {
			const geo = new THREE.BufferGeometry();
			const verts = new Float32Array([
				points[0].x, points[0].y, points[0].z,
				points[1].x, points[1].y, points[1].z,
				points[2].x, points[2].y, points[2].z
			]);
			geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
			geo.setIndex([0, 1, 2]);
			geo.computeVertexNormals();
			const mat = new THREE.MeshBasicMaterial({
				color: color,
				side: THREE.DoubleSide,
				transparent: true,
				opacity: 0.85
			});
			const mesh = new THREE.Mesh(geo, mat);
			mesh.position.set(px, py, pz);
			return mesh;
		};

		getOrCreateMesh(
			key1,
			() => createTriMeshFn(tri1),
			(mesh) => { mesh.position.set(px, py, pz); },
			{ type: 'resizer', id: r.id }
		);

		getOrCreateMesh(
			key2,
			() => createTriMeshFn(tri2),
			(mesh) => { mesh.position.set(px, py, pz); },
			{ type: 'resizer', id: r.id }
		);

		// ... 边框线条（保持不变） ...


		// 边框线条
		const addOutline = (points, color) => {
			const pts = [
				points[0], points[1],
				points[1], points[2],
				points[2], points[0]
			];
			const geo = new THREE.BufferGeometry().setFromPoints(pts);
			const mat = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.5 });
			const line = new THREE.LineSegments(geo, mat);
			line.position.set(px, py, pz);
			return line;
		};
		threeScene.add(addOutline(tri1, 0x88FF88));
		threeScene.add(addOutline(tri2, 0x88FF88));
	});

	// ---- 撞击器 (Bumper) ----
	//const bumperSize = blockSize - gap * 0.5;
	//const bumperGeo = new THREE.BoxGeometry(bumperSize, bumperSize, bumperSize);
	// ---- 撞击器 (Bumper) ----
	state.bumpers.forEach(b => {
		if (!state.visibility.bumper) return;
		const pos = { x: b.x, y: b.y, z: b.z };
		const size = blockSize - gap * 0.5;
		const key = `bumper:${b.id}`;
		getOrCreateMesh(
			key,
			() => {
				const geo = new THREE.BoxGeometry(size, size, size);
				const mat = new THREE.MeshStandardMaterial({
					color: 0xFF4444,
					roughness: 0.4,
					metalness: 0.3,
					emissive: 0xFF4444,
					emissiveIntensity: 0.08
				});
				const mesh = new THREE.Mesh(geo, mat);
				mesh.castShadow = true;
				mesh.receiveShadow = true;
				return mesh;
			},
			(mesh) => {
				mesh.position.set(
					pos.x - centerX + 0.5,
					pos.z + 0.5,
					pos.y - centerZ + 0.5
				);
			},
			{ type: 'bumper', id: b.id }
		);

		// ---- 方向面对角线（X形） ----
		const dirMap = {
			east:  { axis: 'x', sign: 1 },
			west:  { axis: 'x', sign: -1 },
			north: { axis: 'z', sign: -1 },
			south: { axis: 'z', sign: 1 }
		};
		const hasDir = (dir) => b[dir] && b[dir].enabled === true;

		['east', 'west', 'north', 'south'].forEach(dir => {
			if (!hasDir(dir)) return;
			const map = dirMap[dir];
			const half = size / 2;
			const d = half * 0.01; // 避免 Z-fighting
			let points = [];
			if (map.axis === 'x') {
				const sx = map.sign * half;
				points = [
					new THREE.Vector3(sx + d * map.sign, -half, -half),
					new THREE.Vector3(sx + d * map.sign,  half,  half),
					new THREE.Vector3(sx + d * map.sign, -half,  half),
					new THREE.Vector3(sx + d * map.sign,  half, -half)
				];
			} else { // z轴
				const sz = map.sign * half;
				points = [
					new THREE.Vector3(-half, -half, sz + d * map.sign),
					new THREE.Vector3( half,  half, sz + d * map.sign),
					new THREE.Vector3(-half,  half, sz + d * map.sign),
					new THREE.Vector3( half, -half, sz + d * map.sign)
				];
			}
			// 两条对角线
			const lineMat = new THREE.LineBasicMaterial({ color: 0xFFFFFF });
			const line1 = new THREE.Line(
				new THREE.BufferGeometry().setFromPoints([points[0], points[1]]),
				lineMat
			);
			line1.position.set(
				pos.x - centerX + 0.5,
				pos.z + 0.5,
				pos.y - centerZ + 0.5
			);
			threeScene.add(line1);
			threeObjects.push(line1);

			const line2 = new THREE.Line(
				new THREE.BufferGeometry().setFromPoints([points[2], points[3]]),
				lineMat
			);
			line2.position.set(
				pos.x - centerX + 0.5,
				pos.z + 0.5,
				pos.y - centerZ + 0.5
			);
			threeScene.add(line2);
			threeObjects.push(line2);
		});
	});

	// ---- 存档点 ----
	const checkpointGeo = new THREE.OctahedronGeometry(0.3);
	state.checkpoints.forEach(c => {
		if (!state.visibility.checkpoint) return;
		const pos = { x: c.x, y: c.y, z: c.z };
		if (pos.x === undefined) return;
		const key = `checkpoint:${c.id}`;
		getOrCreateMesh(
			key,
			() => {
				const mat = new THREE.MeshStandardMaterial({
					color: 0x44FF44,
					roughness: 0.5,
					metalness: 0.2,
					emissive: 0x44FF44,
					emissiveIntensity: 0.05
				});
				const mesh = new THREE.Mesh(checkpointGeo, mat);
				mesh.castShadow = true;
				mesh.receiveShadow = true;
				return mesh;
			},
			(mesh) => {
				mesh.position.set(
					pos.x - centerX + 0.5,
					pos.z + 0.5,
					pos.y - centerZ + 0.5
				);
			},
			{ type: 'checkpoint', id: c.id }
		);
		// 半径矩形（不加入映射）
	});

	// ---- 相机触发器 ----
	const cameraGeo = new THREE.ConeGeometry(0.25, 0.4, 4);
	state.cameraTriggers.forEach(c => {
		if (!state.visibility.cameratrigger) return;
		const pos = { x: c.x, y: c.y, z: c.z };
		if (pos.x === undefined) return;
		const key = `cameratrigger:${c.id}`;
		getOrCreateMesh(
			key,
			() => {
				const mat = new THREE.MeshStandardMaterial({
					color: 0xAA44FF,
					roughness: 0.2,
					metalness: 0.5,
					emissive: 0xAA44FF,
					emissiveIntensity: 0.1
				});
				const mesh = new THREE.Mesh(cameraGeo, mat);
				mesh.castShadow = true;
				mesh.receiveShadow = true;
				return mesh;
			},
			(mesh) => {
				mesh.position.set(
					pos.x - centerX + 0.5,
					pos.z + 0.5 + 0.2,
					pos.y - centerZ + 0.5
				);
			},
			{ type: 'cameratrigger', id: c.id }
		);
	});

	// ---- 按钮 ----
	const btnSize = blockSize * 0.5;
	const btnHeight = blockSize * 0.08;
	const btnGeo = new THREE.BoxGeometry(btnSize, btnHeight, btnSize);
	state.buttons.forEach(btn => {
		if (!state.visibility.button) return;
		let pos = null;
		if (btn.movingPlatformID) {
			const mp = state.movingPlatforms.find(m => m.id === btn.movingPlatformID || m.xmlId === btn.movingPlatformID);
			if (mp) {
				const mpPos = getMovingPos(mp);
				pos = { x: mpPos.x, y: mpPos.y, z: mpPos.z + 1 };
			}
		}
		if (!pos && btn.x !== null && btn.x !== undefined && btn.y !== null && btn.y !== undefined && btn.z !== null && btn.z !== undefined) {
			if (typeof btn.x === 'number' && !isNaN(btn.x) && typeof btn.y === 'number' && !isNaN(btn.y) && typeof btn.z === 'number' && !isNaN(btn.z)) {
				pos = { x: btn.x, y: btn.y, z: btn.z };
			}
		}
		if (!pos) return;
		const key = `button:${btn.id}`;
		getOrCreateMesh(
			key,
			() => {
				const mat = new THREE.MeshStandardMaterial({
					color: 0xFF44FF,
					roughness: 0.5,
					metalness: 0.2,
					emissive: 0xFF44FF,
					emissiveIntensity: 0.05
				});
				const mesh = new THREE.Mesh(btnGeo, mat);
				mesh.castShadow = true;
				mesh.receiveShadow = true;
				return mesh;
			},
			(mesh) => {
				mesh.position.set(
					pos.x - centerX + 0.5,
					pos.z - 0.01 + btnHeight/2,
					pos.y - centerZ + 0.5
				);
			},
			{ type: 'button', id: btn.id }
		);
	});

	// ---- 序列子按钮 ----
	const seqBtnSize = blockSize * 0.5;
	const seqBtnHeight = blockSize * 0.08;
	const seqBtnGeo = new THREE.BoxGeometry(seqBtnSize, seqBtnHeight, seqBtnSize);
	state.buttonSequences.forEach(seq => {
		if (!state.visibility.buttonsequence) return;
		if (!seq.buttons) return;
		seq.buttons.forEach(btn => {
			let pos = null;
			if (btn.movingPlatformID) {
				const mp = state.movingPlatforms.find(m => m.id === btn.movingPlatformID || m.xmlId === btn.movingPlatformID);
				if (mp) {
					const mpPos = getMovingPos(mp);
					pos = { x: mpPos.x, y: mpPos.y, z: mpPos.z + 0.53 };
				}
			}
			if (!pos && btn.position) {
				pos = { x: btn.position.x, y: btn.position.y, z: btn.position.z - 0.47 };
			}
			if (!pos) return;
			const key = `seqbutton:${btn.id}`;
			getOrCreateMesh(
				key,
				() => {
					const mat = new THREE.MeshStandardMaterial({
						color: 0xFFAA44,
						roughness: 0.5,
						metalness: 0.2,
						emissive: 0xFFAA44,
						emissiveIntensity: 0.05
					});
					const mesh = new THREE.Mesh(seqBtnGeo, mat);
					mesh.castShadow = true;
					mesh.receiveShadow = true;
					return mesh;
				},
				(mesh) => {
					mesh.position.set(
						pos.x - centerX + 0.5,
						pos.z + 0.5,
						pos.y - centerZ + 0.5
					);
				},
				{ type: 'seqbutton', id: btn.id }
			);
		});
	});

	// ---- OtherCube ----
	state.otherCubes.forEach(oc => {
		if (!state.visibility.othercube) return;
		// 触发点
		const triggerPos = { x: oc.triggerX, y: oc.triggerY, z: oc.triggerZ };
		const triggerKey = `othercube_trigger:${oc.id}`;
		getOrCreateMesh(
			triggerKey,
			() => {
				const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
				const mat = new THREE.MeshStandardMaterial({ color: 0x44CCFF, emissive: 0x44CCFF, emissiveIntensity: 0.2 });
				const mesh = new THREE.Mesh(geo, mat);
				mesh.castShadow = true;
				mesh.receiveShadow = true;
				return mesh;
			},
			(mesh) => {
				mesh.position.set(triggerPos.x - centerX + 0.5, triggerPos.z + 0.5, triggerPos.y - centerZ + 0.5);
			},
			{ type: 'othercube_trigger', id: oc.id }
		);
		// 方块
		const cubePos = { x: oc.cubeX, y: oc.cubeY, z: oc.cubeZ };
		const cubeKey = `othercube_cube:${oc.id}`;
		getOrCreateMesh(
			cubeKey,
			() => {
				const geo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
				const mat = new THREE.MeshStandardMaterial({ color: 0x66DDFF, transparent: true, opacity: 0.8 });
				const mesh = new THREE.Mesh(geo, mat);
				mesh.castShadow = true;
				mesh.receiveShadow = true;
				return mesh;
			},
			(mesh) => {
				mesh.position.set(cubePos.x - centerX + 0.5, cubePos.z + 0.5, cubePos.y - centerZ + 0.5);
			},
			{ type: 'othercube_cube', id: oc.id }
		);
	});

	// ---- DarkCube ----
	state.darkCubes.forEach(dc => {
		if (!state.visibility.darkcube) return;
		// 触发点
		const triggerPos = { x: dc.triggerX, y: dc.triggerY, z: dc.triggerZ };
		const triggerKey = `darkcube_trigger:${dc.id}`;
		getOrCreateMesh(
			triggerKey,
			() => {
				const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
				const mat = new THREE.MeshStandardMaterial({ color: 0x555555, emissive: 0x333333 });
				const mesh = new THREE.Mesh(geo, mat);
				mesh.castShadow = true;
				mesh.receiveShadow = true;
				return mesh;
			},
			(mesh) => {
				mesh.position.set(triggerPos.x - centerX + 0.5, triggerPos.z + 0.5, triggerPos.y - centerZ + 0.5);
			},
			{ type: 'darkcube_trigger', id: dc.id }
		);
		// 方块
		const cubePos = { x: dc.cubeX, y: dc.cubeY, z: dc.cubeZ };
		const cubeKey = `darkcube_cube:${dc.id}`;
		getOrCreateMesh(
			cubeKey,
			() => {
				const geo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
				const mat = new THREE.MeshStandardMaterial({ color: 0x777777, transparent: true, opacity: 0.8 });
				const mesh = new THREE.Mesh(geo, mat);
				mesh.castShadow = true;
				mesh.receiveShadow = true;
				return mesh;
			},
			(mesh) => {
				mesh.position.set(cubePos.x - centerX + 0.5, cubePos.z + 0.5, cubePos.y - centerZ + 0.5);
			},
			{ type: 'darkcube_cube', id: dc.id }
		);
	});

	// ---- 出生点和终点（3D渲染） ----
	const spawn = state.level.spawn;
	const exit = state.level.exit;
	const maxLayer = getLayerRange().maxZ;

	// 出生点：向下圆锥 (尖朝下)，底面与单元格顶面内切，高度=1
	if (spawn && state.visibility.spawn) {
		if (spawn.x >= 0 && spawn.x < w && spawn.y >= 0 && spawn.y < l) {
			let spawnZ = spawn.z;
			if (!isFinite(spawnZ)) spawnZ = 0;
			if (spawnZ < 0) spawnZ = 0;
			if (spawnZ >= h) spawnZ = h;

			const coneHeight = 1.0;
			const coneRadius = 0.45;
			const coneGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 16);
			const coneMat = new THREE.MeshStandardMaterial({
				color: 0x44dd88,
				roughness: 0.4,
				metalness: 0.1,
				emissive: 0x44dd88,
				emissiveIntensity: 0.06,
				transparent: true,
				opacity: 0.6
			});
			const spawnCone = new THREE.Mesh(coneGeo, coneMat);
			spawnCone.rotation.x = Math.PI; // 尖朝下
			spawnCone.position.set(
				spawn.x - centerX + 0.5,
				spawnZ + 0.5,        // 底面圆心在顶面
				spawn.y - centerZ + 0.5
			);
			spawnCone.castShadow = true;
			spawnCone.receiveShadow = true;
			threeScene.add(spawnCone);
			threeObjects.push(spawnCone);
			meshToElement.set(spawnCone, { type: 'spawn', id: 'spawn' });

			// ---- 起点竖线：从 y=-20 延伸到 y=h+20，贯穿场景 ----
			const yMin = -20;
			const yMax = maxLayer + 20;
			const linePoints = [
				new THREE.Vector3(spawn.x - centerX + 0.5, yMin, spawn.y - centerZ + 0.5),
				new THREE.Vector3(spawn.x - centerX + 0.5, yMax, spawn.y - centerZ + 0.5)
			];
			const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
			const lineMat = new THREE.LineBasicMaterial({
				color: 0x44dd88,
				transparent: true,
				opacity: 0.25
			});
			const line = new THREE.Line(lineGeo, lineMat);
			threeScene.add(line);
			threeObjects.push(line);
		}
	}

	// 终点：向上圆锥 (尖朝上)，底面与单元格底面内切，高度=1
	if (exit && state.visibility.exit) {
		if (exit.x >= 0 && exit.x < w && exit.y >= 0 && exit.y < l) {
			let exitZ = exit.z;
			if (!isFinite(exitZ)) exitZ = 0;
			if (exitZ < 0) exitZ = 0;
			if (exitZ >= h) exitZ = h;

			const coneHeight = 1.0;
			const coneRadius = 0.45;
			const coneGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 16);
			const coneMat = new THREE.MeshStandardMaterial({
				color: 0xdd4444,
				roughness: 0.4,
				metalness: 0.1,
				emissive: 0xdd4444,
				emissiveIntensity: 0.06,
				transparent: true,
				opacity: 0.6
			});
			const exitCone = new THREE.Mesh(coneGeo, coneMat);
			// 默认尖朝上
			exitCone.position.set(
				exit.x - centerX + 0.5,
				exitZ + 0.5,               // 底面圆心在底面
				exit.y - centerZ + 0.5
			);
			exitCone.castShadow = true;
			exitCone.receiveShadow = true;
			threeScene.add(exitCone);
			threeObjects.push(exitCone);
			meshToElement.set(exitCone, { type: 'exit', id: 'exit' });

			// ---- 终点竖线：从 y=-20 延伸到 y=h+20，贯穿场景 ----
			const yMin = -20;
			const yMax = maxLayer + 20;
			const linePoints = [
				new THREE.Vector3(exit.x - centerX + 0.5, yMin, exit.y - centerZ + 0.5),
				new THREE.Vector3(exit.x - centerX + 0.5, yMax, exit.y - centerZ + 0.5)
			];
			const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
			const lineMat = new THREE.LineBasicMaterial({
				color: 0xdd4444,
				transparent: true,
				opacity: 0.25
			});
			const line = new THREE.Line(lineGeo, lineMat);
			threeScene.add(line);
			threeObjects.push(line);
		}
	}

    // ---- 清理未使用的 Mesh ----
    meshPool.forEach((mesh, key) => {
        if (!usedKeys.has(key)) {
            threeScene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
            meshPool.delete(key);
        }
    });

	// 清除旧高亮
	if (currentHighlightHelper) {
		threeScene.remove(currentHighlightHelper);
		currentHighlightHelper.geometry.dispose();
		currentHighlightHelper.material.dispose();
		currentHighlightHelper = null;
	}
	// 如果存在高亮mesh，且该mesh不是当前选中的元素，则添加高亮线框
	if (state.highlightedMesh) {
		// 查找高亮mesh对应的元素
		const elem = meshToElement.get(state.highlightedMesh);
		let isSelected = false;
		if (state.selectedElement && elem) {
			if (elem.type === 'static' && state.selectedElement.type === 'static') {
				// 静态比较坐标
				if (elem.coord && state.selectedElement.staticCoord) {
					isSelected = (elem.coord.x === state.selectedElement.staticCoord.x &&
								  elem.coord.y === state.selectedElement.staticCoord.y &&
								  elem.coord.z === state.selectedElement.staticCoord.z);
				}
			} else {
				isSelected = (elem.type === state.selectedElement.type && elem.id === state.selectedElement.id);
			}
		}
		if (!isSelected) {
			const box = new THREE.Box3().setFromObject(state.highlightedMesh);
			const helper = new THREE.Box3Helper(box, 0xffff00);
			threeScene.add(helper);
			currentHighlightHelper = helper;
		}
	}
	
	// ---- 绘制选中高亮（使用 Box3Helper） ----
	if (selectedHighlightHelper) {
		threeScene.remove(selectedHighlightHelper);
		selectedHighlightHelper.geometry.dispose();
		selectedHighlightHelper.material.dispose();
		selectedHighlightHelper = null;
	}
	if (state.selectedElement) {
		let selectedMesh = null;
		const sel = state.selectedElement;
		if (sel.type === 'static') {
			if (!sel.staticCoord) {
				// 若 staticCoord 未定义，清除选中并跳过
				state.selectedElement = null;
				// 但注意这里不能直接 return，否则后续代码不执行，所以只清除并继续
				// 更好的做法是直接跳过，但为了安全，可置空后继续
			} else {
				for (let [mesh, elem] of meshToElement) {
					if (elem.type === 'static' && elem.coord.x === sel.staticCoord.x &&
						elem.coord.y === sel.staticCoord.y && elem.coord.z === sel.staticCoord.z) {
						selectedMesh = mesh;
						break;
					}
				}
			}
		} else {
			for (let [mesh, elem] of meshToElement) {
				if (elem.type === sel.type && elem.id === sel.id) {
					selectedMesh = mesh;
					break;
				}
			}
		}
		if (selectedMesh) {
			const box = new THREE.Box3().setFromObject(selectedMesh);
			const helper = new THREE.Box3Helper(box, 0xffffff);
			threeScene.add(helper);
			selectedHighlightHelper = helper;
		}
	}


    // ---- 重新绘制所有半径矩形和线条（调用 drawRadiusRect 等） ----
    // 由于我们在上面调用 drawRadiusRect 时，它会创建新的线条，但线条会在下一次渲染时被清除。
    // 所以需要确保在绘制之后，它们能保留。因为我们在开头清除了旧线条，所以这里的 drawRadiusRect 会创建新的线条，并留在场景中。
    // 所以上面的 drawRadiusRect 调用需要保留。

	// ---- 绘制辅助线（半径虚线框和Bumper方向线） ----

	// 辅助函数：绘制3D半径虚线框
	function draw3DRadiusRect(pos2d, radiusX, radiusY, color, opacity = 1) {
		if (!pos2d || typeof pos2d.x !== 'number' || isNaN(pos2d.x) || typeof pos2d.y !== 'number' || isNaN(pos2d.y) || typeof pos2d.z !== 'number' || isNaN(pos2d.z)) return;
		if (!isFinite(radiusX) || !isFinite(radiusY) || (radiusX <= 0 && radiusY <= 0)) return;
		const halfX = (2 * radiusX + 1) * blockSize / 2;
		const halfY = (2 * radiusY + 1) * blockSize / 2;
		const cx = pos2d.x - centerX + 0.5;
		const cy = pos2d.z + 0.05;
		const cz = pos2d.y - centerZ + 0.5;
		const corners = [
			new THREE.Vector3(-halfX, 0, -halfY),
			new THREE.Vector3(halfX, 0, -halfY),
			new THREE.Vector3(halfX, 0, halfY),
			new THREE.Vector3(-halfX, 0, halfY),
			new THREE.Vector3(-halfX, 0, -halfY)
		];
		const geometry = new THREE.BufferGeometry().setFromPoints(corners);
		const material = new THREE.LineDashedMaterial({
			color: color,
			dashSize: 0.06,
			gapSize: 0.04,
			transparent: true,
			opacity: opacity
		});
		const line = new THREE.Line(geometry, material);
		line.computeLineDistances();
		line.position.set(cx, cy, cz);
		threeScene.add(line);
		threeObjects.push(line);
		// 添加较细的实线作为高光
		const glowMat = new THREE.LineBasicMaterial({
			color: 0xffffff,
			transparent: true,
			opacity: 0.5
		});
		const glowLine = new THREE.Line(geometry.clone(), glowMat);
		glowLine.position.copy(line.position);
		threeScene.add(glowLine);
		threeObjects.push(glowLine);
	}

	// 辅助函数：绘制Bumper方向线
	function drawBumperDirection(pos2d, direction, enabled, color = 0xff0000) {
		if (!enabled) return;
		if (!pos2d || typeof pos2d.x !== 'number' || isNaN(pos2d.x) || typeof pos2d.y !== 'number' || isNaN(pos2d.y) || typeof pos2d.z !== 'number' || isNaN(pos2d.z)) return;
		const cx = pos2d.x - centerX + 0.5;
		const cy = pos2d.z + 0.5;
		const cz = pos2d.y - centerZ + 0.5;
		const dirVec = new THREE.Vector3(0, 0, 0);
		const length = 1.5;
		switch (direction) {
			case 'north': dirVec.set(0, 0, -length); break;
			case 'east': dirVec.set(length, 0, 0); break;
			case 'south': dirVec.set(0, 0, length); break;
			case 'west': dirVec.set(-length, 0, 0); break;
			default: return;
		}
		const start = new THREE.Vector3(cx, cy, cz);
		const end = new THREE.Vector3().copy(start).add(dirVec);
		const points = [start, end];
		const geometry = new THREE.BufferGeometry().setFromPoints(points);
		const material = new THREE.LineBasicMaterial({ color: color });
		const line = new THREE.Line(geometry, material);
		threeScene.add(line);
		threeObjects.push(line);
	}

	// 遍历绘制半径矩形
    state.checkpoints.forEach(c => {
        if (!state.visibility.checkpoint) return;
        if (c.radiusX > 0 || c.radiusY > 0) {
            draw3DRadiusRect({x: c.x, y: c.y, z: c.z}, c.radiusX, c.radiusY, 0x44FF44);
        }
    });
    state.cameraTriggers.forEach(c => {
        if (!state.visibility.cameratrigger) return;
        if (c.radiusX > 0 || c.radiusY > 0) {
            draw3DRadiusRect({x: c.x, y: c.y, z: c.z}, c.radiusX, c.radiusY, 0xAA44FF);
        }
    });
    state.resizers.forEach(r => {
        if (!state.visibility.resizer) return;
        if (r.radiusX > 0 || r.radiusY > 0) {
            const color = r.type === 'grow' ? 0x88FF88 : 0x88AA88;
            draw3DRadiusRect({x: r.x, y: r.y, z: r.z}, r.radiusX, r.radiusY, color);
        }
    });
    state.otherCubes.forEach(oc => {
        if (!state.visibility.othercube) return;
        if (oc.radiusX > 0 || oc.radiusY > 0) {
            draw3DRadiusRect({x: oc.triggerX, y: oc.triggerY, z: oc.triggerZ}, oc.radiusX, oc.radiusY, 0x44CCFF);
        }
    });
    state.darkCubes.forEach(dc => {
        if (!state.visibility.darkcube) return;
        if (dc.radiusX > 0 || dc.radiusY > 0) {
            draw3DRadiusRect({x: dc.triggerX, y: dc.triggerY, z: dc.triggerZ}, dc.radiusX, dc.radiusY, 0x555555);
        }
    });

	// 绘制Bumper方向线
	/*state.bumpers.forEach(b => {
        if (!state.visibility.bumper) return;
		const dirs = ['north', 'east', 'south', 'west'];
		dirs.forEach(dir => {
			const d = b[dir];
			if (d && d.enabled) {
				let color = 0xFF4444;
				if (dir === 'north') color = 0x44FF44;
				else if (dir === 'east') color = 0x4444FF;
				else if (dir === 'south') color = 0xFFFF44;
				else if (dir === 'west') color = 0xFF44FF;
				drawBumperDirection({x: b.x, y: b.y, z: b.z}, dir, true, color);
			}
		});
	});*/
    
    // ===== 3D 复制选区线框 =====
    let _copySelectionBoxHelper = null;

    function updateCopySelectionBox() {
        if (!threeScene) return;
        // 清除旧的
        if (_copySelectionBoxHelper) {
            threeScene.remove(_copySelectionBoxHelper);
            if (_copySelectionBoxHelper.geometry) _copySelectionBoxHelper.geometry.dispose();
            if (_copySelectionBoxHelper.material) _copySelectionBoxHelper.material.dispose();
            _copySelectionBoxHelper = null;
        }
        const box = window.QuickFill && window.QuickFill.getCopyBox
            ? window.QuickFill.getCopyBox()
            : null;
        if (!box) return;

        const { w, l, h } = state.level.size;
        const centerX = w / 2, centerZ = l / 2;

        // 网格坐标 -> 世界坐标：格子 (x,y,z) 的立方体范围是 [x, x+1) × [z, z+1) × [y, y+1)
        const x0 = box.minX - centerX;
        const x1 = box.maxX + 1 - centerX;
        const z0 = box.minY - centerZ;
        const z1 = box.maxY + 1 - centerZ;
        const y0 = box.minZ;
        const y1 = box.maxZ + 1;

        // 8 个角
        const corners = [
            new THREE.Vector3(x0, y0, z0),
            new THREE.Vector3(x1, y0, z0),
            new THREE.Vector3(x1, y0, z1),
            new THREE.Vector3(x0, y0, z1),
            new THREE.Vector3(x0, y1, z0),
            new THREE.Vector3(x1, y1, z0),
            new THREE.Vector3(x1, y1, z1),
            new THREE.Vector3(x0, y1, z1)
        ];
        const edges = [
            [0,1],[1,2],[2,3],[3,0],
            [4,5],[5,6],[6,7],[7,4],
            [0,4],[1,5],[2,6],[3,7]
        ];
        const positions = [];
        edges.forEach(([a, b]) => {
            positions.push(corners[a].x, corners[a].y, corners[a].z);
            positions.push(corners[b].x, corners[b].y, corners[b].z);
        });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const mat = new THREE.LineBasicMaterial({ color: 0x4fc3f7, linewidth: 2 });
        _copySelectionBoxHelper = new THREE.LineSegments(geo, mat);
        threeScene.add(_copySelectionBoxHelper);
    }

    // 让 QuickFill 能通知 3D 刷新
    window.__onCopySelectionChanged = function () {
        if (!threeScene) return;
        updateCopySelectionBox();
        render3D();   // 或者单独做一次 requestAnimationFrame 里的 3D 刷新
    };

    // ---- 重置相机（仅首次） ----
    if (isFirst3DRender) {
        resetCamera();
        isFirst3DRender = false;
    }
    
    // 复制选区框
    updateCopySelectionBox();

    resizeThreeRenderer();
}

// 显示3D视图（并排）
function show3D() {
	const container = document.getElementById('view3dContainer');
	const handle = document.getElementById('splitHandle');
	// 隐藏分隔条（不再使用）
	handle.style.display = 'none';
	const width = parseInt(width3dSlider.value) || 50;
	container.style.flex = `0 0 ${width}%`;
	container.classList.add('active');
	setTimeout(() => {
		if (!threeRenderer) {
			initThree();
			isFirst3DRender = true;
		}
		resizeThreeRenderer();
		render3D();
	}, 150);
}

function hide3D() {
	const container = document.getElementById('view3dContainer');
	const handle = document.getElementById('splitHandle');
	container.classList.remove('active');
	container.style.flex = '0 0 0';
	handle.style.display = 'none';
	const canvasWrap = document.getElementById('canvasWrap');
	canvasWrap.style.width = '100%';
	setTimeout(() => {
		resizeThreeRenderer();
		render3D();
	}, 100);
}

function resizeThreeRenderer() {
	const container = document.getElementById('threeContainer');
	const width = container.clientWidth || 400;
	const height = container.clientHeight || 400;
	if (threeRenderer) {
		threeRenderer.setSize(width, height);
		threeCamera.aspect = width / height;
		threeCamera.updateProjectionMatrix();
	}
}

function onResize3D() {
	resizeThreeRenderer();
}
