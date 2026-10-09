/**
 * edgelxe_quickfill.js
 * 快速填充 + 选区复制粘贴（整合版）
 *
 * 面板顶部两个标签页：
 *   ⚡ 填充       —— 形状填充/删除，支持严格模式、覆盖模式
 *   📋 复制粘贴  —— 框选区域复制、按法线方向粘贴
 */
(function () {
'use strict';

// ==================== 通用状态 ====================
let panel = null;
let activeTab = 'fill';       // 'fill' | 'clip'
let lastMousePos = { x: null, y: null, z: null };

// ---------- 快速填充状态 ----------
const qf = {
    recordActive: false,
    coords: [],
    fillMode: 1,       // 1=实心 2=空心 3=线框架
    shapeType: 1,      // 1=立方体 2=三棱柱(锥) 3=球 4=圆柱(锥) 5=线 6=面 7=三棱锥
    coneMode: false,
    strictMode: false,
    coverExisting: false,
    keepCoordsAfter: false,
    removeCap: false,
};

// ---------- 复制粘贴状态 ----------
const cb = {
    recordMode: null,      // 'copy' | 'paste' | null
    copyCoords: [],
    pasteCoord: null,
    normal: 'y+',
    clipboard: null,
    keepCoordsAfter: false,
    overwrite: false,   // ★ 粘贴时是否覆盖目标位置原有元素
};

// ==================== 通用工具 ====================
function boundsOf(coords) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    coords.forEach(c => {
        if (c.x < minX) minX = c.x; if (c.x > maxX) maxX = c.x;
        if (c.y < minY) minY = c.y; if (c.y > maxY) maxY = c.y;
        if (c.z < minZ) minZ = c.z; if (c.z > maxZ) maxZ = c.z;
    });
    return { minX, minY, minZ, maxX, maxY, maxZ };
}
function eachInBounds(b, fn) {
    for (let x = b.minX; x <= b.maxX; x++)
        for (let y = b.minY; y <= b.maxY; y++)
            for (let z = b.minZ; z <= b.maxZ; z++) fn(x, y, z);
}
function isOnBoundary(b, x, y, z) {
    return x === b.minX || x === b.maxX ||
           y === b.minY || y === b.maxY ||
           z === b.minZ || z === b.maxZ;
}
function isOnEdge(b, x, y, z) {
    let c = 0;
    if (x === b.minX || x === b.maxX) c++;
    if (y === b.minY || y === b.maxY) c++;
    if (z === b.minZ || z === b.maxZ) c++;
    return c >= 2;
}
function pointInTriangle2D(px, py, ax, ay, bx, by, cx, cy, eps = 1e-4) {
    const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
    const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
    const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
    const hasNeg = (d1 < -eps) || (d2 < -eps) || (d3 < -eps);
    const hasPos = (d1 > eps) || (d2 > eps) || (d3 > eps);
    return !(hasNeg && hasPos);
}
function isPointOnSegment(px, py, ax, ay, bx, by, eps) {
    const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
    if (Math.abs(cross) > eps * Math.hypot(bx - ax, by - ay)) return false;
    const dot = (px - ax) * (bx - ax) + (py - ay) * (by - ay);
    if (dot < 0) return false;
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
    if (dot > len2) return false;
    return true;
}
function rectFromDiag(p1, p2) {
    const dx = Math.abs(p1.x - p2.x), dy = Math.abs(p1.y - p2.y), dz = Math.abs(p1.z - p2.z);
    let thickAxis;
    if (dz <= dx && dz <= dy) thickAxis = 'z';
    else if (dy <= dx && dy <= dz) thickAxis = 'y';
    else thickAxis = 'x';

    const lo = { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), z: Math.min(p1.z, p2.z) };
    const hi = { x: Math.max(p1.x, p2.x), y: Math.max(p1.y, p2.y), z: Math.max(p1.z, p2.z) };
    if (thickAxis === 'z') hi.z = lo.z;
    else if (thickAxis === 'y') hi.y = lo.y;
    else hi.x = lo.x;

    const pts = [];
    for (let x = lo.x; x <= hi.x; x++)
        for (let y = lo.y; y <= hi.y; y++)
            for (let z = lo.z; z <= hi.z; z++)
                pts.push({ x, y, z });
    return pts;
}

// ==================== 快速填充：形状生成 ====================
function genCube(b, mode) {
    const pts = [];
    eachInBounds(b, (x, y, z) => {
        if (mode === 1) pts.push({ x, y, z });
        else if (mode === 2) { if (isOnBoundary(b, x, y, z)) pts.push({ x, y, z }); }
        else if (mode === 3) { if (isOnEdge(b, x, y, z)) pts.push({ x, y, z }); }
    });
    return pts;
}

function genSphereFromDiameter(p1, p2) {
    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;
    const cz = (p1.z + p2.z) / 2;
    const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
    const R = Math.sqrt(dx*dx + dy*dy + dz*dz) / 2;
    if (R < 1e-9) return [{ x: Math.round(cx), y: Math.round(cy), z: Math.round(cz) }];

    const pts = [];
    const minX = Math.floor(cx - R) - 1, maxX = Math.ceil(cx + R) + 1;
    const minY = Math.floor(cy - R) - 1, maxY = Math.ceil(cy + R) + 1;
    const minZ = Math.floor(cz - R) - 1, maxZ = Math.ceil(cz + R) + 1;
    const R2 = R * R + 0.5;

    for (let x = minX; x <= maxX; x++)
        for (let y = minY; y <= maxY; y++)
            for (let z = minZ; z <= maxZ; z++) {
                const ex = x - cx, ey = y - cy, ez = z - cz;
                if (ex*ex + ey*ey + ez*ez <= R2) pts.push({ x, y, z });
            }
    return pts;
}

// ===== 3D 三角形栅格化（任意朝向） =====
// 三点面：先画 3 条边，再对每一 z 层用线连两个交点
/*function genTriangleFace(p1, p2, p3) {
    const result = new Map();
    const addPts = arr => { for (const p of arr) result.set(`${p.x},${p.y},${p.z}`, p); };

    // 3 条轮廓边
    addPts(genLine(p1, p2));
    addPts(genLine(p2, p3));
    addPts(genLine(p3, p1));

    const verts = [p1, p2, p3];
    const edges = [[0,1],[1,2],[2,0]];
    const zmin = Math.min(p1.z, p2.z, p3.z);
    const zmax = Math.max(p1.z, p2.z, p3.z);

    for (let z = zmin; z <= zmax; z++) {
        const hits = [];
        for (const [i, j] of edges) {
            const a = verts[i], b = verts[j];
            if (a.z === b.z) continue;
            const t = (z - a.z) / (b.z - a.z);
            if (t <= 0.0001 || t >= 0.9999) continue;
            hits.push({
                x: Math.round(a.x + (b.x - a.x) * t),
                y: Math.round(a.y + (b.y - a.y) * t),
                z
            });
        }
        if (hits.length < 2) continue;
        // 取最远的两点
        let bestA = hits[0], bestB = hits[1], bestD = -1;
        for (let i = 0; i < hits.length; i++)
            for (let j = i + 1; j < hits.length; j++) {
                const d = Math.abs(hits[i].x - hits[j].x) + Math.abs(hits[i].y - hits[j].y);
                if (d > bestD) { bestD = d; bestA = hits[i]; bestB = hits[j]; }
            }
        addPts(genLine(bestA, bestB));
    }
    return [...result.values()];
}*/

function genPolygonFace(poly) {
    const result = new Map();
    const add = arr => { for (const p of arr) result.set(`${p.x},${p.y},${p.z}`, p); };

    // 1. 轮廓边
    const N = poly.length;
    for (let i = 0; i < N; i++) {
        add(genLine(poly[i], poly[(i + 1) % N]));
    }

    // 2. 逐 z 层：取交点，用线连最远两点
    const zmin = Math.min(...poly.map(p => p.z));
    const zmax = Math.max(...poly.map(p => p.z));
    for (let z = zmin; z <= zmax; z++) {
        const hits = [];
        for (let i = 0; i < N; i++) {
            const a = poly[i], b = poly[(i + 1) % N];
            if (a.z === b.z) continue;
            const t = (z - a.z) / (b.z - a.z);
            if (t <= 1e-4 || t >= 1 - 1e-4) continue;
            hits.push({
                x: Math.round(a.x + (b.x - a.x) * t),
                y: Math.round(a.y + (b.y - a.y) * t),
                z
            });
        }
        if (hits.length < 2) continue;
        let bestA = hits[0], bestB = hits[1], bestD = -1;
        for (let i = 0; i < hits.length; i++)
            for (let j = i + 1; j < hits.length; j++) {
                const d = Math.abs(hits[i].x - hits[j].x) + Math.abs(hits[i].y - hits[j].y);
                if (d > bestD) { bestD = d; bestA = hits[i]; bestB = hits[j]; }
            }
        add(genLine(bestA, bestB));
    }
    return [...result.values()];
}

// 三点矩形：p1, p2, p3 是矩形三个连续顶点
function genQuadFace(p1, p2, p3) {
    const p4 = {
        x: p2.x + p3.x - p1.x,
        y: p2.y + p3.y - p1.y,
        z: p2.z + p3.z - p1.z
    };
    return genPolygonFace([p1, p2, p4, p3]);
}

// 三点三角形
function genTriangleFace(p1, p2, p3) {
    return genPolygonFace([p1, p2, p3]);
}

// 棱柱：3 点=2 点矩形底面+方向；4 点=3 点三角形底面+方向
function genPrism(coords) {
    let baseGrid, last, dirPt;
    if (coords.length === 3) {
        const [p1, p2, p3] = coords;
        baseGrid = rectFromDiag(p1, p2);
        last = p2;
        dirPt = p3;
    } else if (coords.length >= 4) {
        const [p1, p2, p3, p4] = coords;
        //baseGrid = genTriangleFace(p1, p2, p3);
        baseGrid = fillTriangleSolid(p1, p2, p3);   // ← 实心
        last = p3;
        dirPt = p4;
    } else return [];

    if (baseGrid.length === 0) return [];
    const dx = dirPt.x - last.x, dy = dirPt.y - last.y, dz = dirPt.z - last.z;
    if (dx === 0 && dy === 0 && dz === 0) return baseGrid;

    const all = new Map();
    for (const B of baseGrid) {
        const end = { x: B.x + dx, y: B.y + dy, z: B.z + dz };
        // 含起点含终点，Map 会去重，不会在底面/顶面多一层
        for (const p of genLine(B, end)) {
            all.set(`${p.x},${p.y},${p.z}`, p);
        }
    }
    return [...all.values()];
}

// 棱锥：3 点=2 点矩形底面+顶点；4 点=3 点三角形底面+顶点
function genPyramid(coords) {
    let baseGrid, apex;
    if (coords.length === 3) {
        const [p1, p2, p3] = coords;
        baseGrid = rectFromDiag(p1, p2);
        apex = p3;
    } else if (coords.length >= 4) {
        const [p1, p2, p3, p4] = coords;
        //baseGrid = genTriangleFace(p1, p2, p3);
        baseGrid = fillTriangleSolid(p1, p2, p3);   // ← 实心
        apex = p4;
    } else return [];

    if (baseGrid.length === 0) return [];

    // 防止生成低于底面的点
    //let minZ = Infinity;
    //for (const B of baseGrid) if (B.z < minZ) minZ = B.z;

    const all = new Map();
    for (const B of baseGrid) {
        for (const p of genLine(B, apex)) {
            //if (p.z < minZ) continue;
            all.set(`${p.x},${p.y},${p.z}`, p);
        }
    }
    return [...all.values()];
}

// ===== 圆柱/圆锥（3 点：p1、p2 为直径，p3 定母线方向/顶点） =====
function genCylinderCone(p1, p2, p3, coneMode) {
    const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2, cz = (p1.z + p2.z) / 2;
    const ddx = p2.x - p1.x, ddy = p2.y - p1.y, ddz = p2.z - p1.z;
    const R = Math.sqrt(ddx*ddx + ddy*ddy + ddz*ddz) / 2;

    let ax = p3.x - p2.x, ay = p3.y - p2.y, az = p3.z - p2.z;
    const H = Math.sqrt(ax*ax + ay*ay + az*az);
    if (H < 1e-9 || R < 1e-9) return [];
    ax /= H; ay /= H; az /= H;

    const pts = [];
    const bbox = Math.ceil(R + H) + 2;
    const minX = Math.floor(cx - bbox), maxX = Math.ceil(cx + bbox);
    const minY = Math.floor(cy - bbox), maxY = Math.ceil(cy + bbox);
    const minZ = Math.floor(cz - bbox), maxZ = Math.ceil(cz + bbox);

    for (let x = minX; x <= maxX; x++)
        for (let y = minY; y <= maxY; y++)
            for (let z = minZ; z <= maxZ; z++) {
                const vx = x - cx, vy = y - cy, vz = z - cz;
                const t = vx*ax + vy*ay + vz*az;
                if (t < -0.5 || t > H + 0.5) continue;
                const px = vx - t*ax, py = vy - t*ay, pz = vz - t*az;
                const d2 = px*px + py*py + pz*pz;
                let localR = R;
                if (coneMode) localR = R * (1 - t / H);
                if (d2 <= localR*localR + 0.5) pts.push({ x, y, z });
            }
    return pts;
}

// ===== 填充模式后处理 =====
function applyFillMode(pts, mode) {
    if (mode === 1 || pts.length === 0) return pts;
    const set = new Set(pts.map(p => `${p.x},${p.y},${p.z}`));

    const shell = pts.filter(p => {
        const n = [
            [p.x+1,p.y,p.z], [p.x-1,p.y,p.z],
            [p.x,p.y+1,p.z], [p.x,p.y-1,p.z],
            [p.x,p.y,p.z+1], [p.x,p.y,p.z-1]
        ];
        return n.some(([nx,ny,nz]) => !set.has(`${nx},${ny},${nz}`));
    });
    if (mode === 2) return shell;

    // 线框：在 shell 中，6 邻居里空邻居数 >= 2 的点（棱和顶点）
    return shell.filter(p => {
        const n = [
            [p.x+1,p.y,p.z], [p.x-1,p.y,p.z],
            [p.x,p.y+1,p.z], [p.x,p.y-1,p.z],
            [p.x,p.y,p.z+1], [p.x,p.y,p.z-1]
        ];
        let emptyCount = 0;
        for (const [nx,ny,nz] of n) {
            if (!set.has(`${nx},${ny},${nz}`)) emptyCount++;
        }
        return emptyCount >= 2;
    });
}

function removeEndCaps(pts, shapeType) {
    if (pts.length === 0) return pts;
    if (shapeType !== 2 && shapeType !== 4 && shapeType !== 7) return pts;

    let zmin = Infinity, zmax = -Infinity;
    for (const p of pts) {
        if (p.z < zmin) zmin = p.z;
        if (p.z > zmax) zmax = p.z;
    }
    // 棱柱(2)和圆柱(4 且非圆锥)：去顶去底
    // 圆锥(4 且 coneMode)和棱锥(7)：只去底
    let removeTop = false;
    if (shapeType === 2) removeTop = true;
    if (shapeType === 4 && !qf.coneMode) removeTop = true;

    return pts.filter(p => {
        if (p.z === zmin) return false;
        if (removeTop && p.z === zmax) return false;
        return true;
    });
}

function genLineInclusive(p1, p2) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
    const steps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
    if (steps === 0) return [{ x: p1.x, y: p1.y, z: p1.z }];
    const pts = [], seen = new Set();
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = Math.round(p1.x + dx * t);
        const y = Math.round(p1.y + dy * t);
        const z = Math.round(p1.z + dz * t);
        const k = `${x},${y},${z}`;
        if (!seen.has(k)) { seen.add(k); pts.push({ x, y, z }); }
    }
    return pts;
}

function genLineExclusive(p1, p2) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
    const steps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
    if (steps === 0) return [{ x: p1.x, y: p1.y, z: p1.z }];
    const pts = [], seen = new Set();
    for (let i = 0; i < steps; i++) {   // 不含终点
        const t = i / steps;
        const x = Math.round(p1.x + dx * t);
        const y = Math.round(p1.y + dy * t);
        const z = Math.round(p1.z + dz * t);
        const k = `${x},${y},${z}`;
        if (!seen.has(k)) { seen.add(k); pts.push({ x, y, z }); }
    }
    return pts;
}

// 兼容旧调用
function genLine(p1, p2) { return genLineInclusive(p1, p2); }

function bridgePath6(a, b) {
    const path = [{ x: a.x, y: a.y, z: a.z }];
    let cx = a.x, cy = a.y, cz = a.z;
    while (cx !== b.x) { cx += Math.sign(b.x - cx); path.push({ x: cx, y: cy, z: cz }); }
    while (cy !== b.y) { cy += Math.sign(b.y - cy); path.push({ x: cx, y: cy, z: cz }); }
    while (cz !== b.z) { cz += Math.sign(b.z - cz); path.push({ x: cx, y: cy, z: cz }); }
    return path;
}

// 严格模式：在基础点集上继续填充，直到每个点至少有一个正交邻居
// 严格模式：给孤立点补线，直到每个点至少有一个 6 面邻居（只看本次生成的点集内部）
function applyStrictMode(points) {
    if (points.length === 0) return points;
    const set = new Map();
    for (const p of points) set.set(`${p.x},${p.y},${p.z}`, p);

    function hasNeighbor(x, y, z) {
        const n = [
            `${x+1},${y},${z}`, `${x-1},${y},${z}`,
            `${x},${y+1},${z}`, `${x},${y-1},${z}`,
            `${x},${y},${z+1}`, `${x},${y},${z-1}`
        ];
        for (const k of n) if (set.has(k)) return true;
        return false;
    }

    for (let iter = 0; iter < 400; iter++) {
        const isolated = [];
        for (const p of set.values()) {
            if (!hasNeighbor(p.x, p.y, p.z)) isolated.push(p);
        }
        if (isolated.length === 0) break;

        for (const p of isolated) {
            let nearest = null, nd = Infinity;
            for (const q of set.values()) {
                if (q === p) continue;
                const d = Math.abs(q.x - p.x) + Math.abs(q.y - p.y) + Math.abs(q.z - p.z);
                if (d < nd) { nd = d; nearest = q; }
            }
            if (!nearest) break;
            for (const lp of bridgePath6(p, nearest)) {
                const k = `${lp.x},${lp.y},${lp.z}`;
                if (!set.has(k)) set.set(k, lp);
            }
        }
    }
    return [...set.values()];
}

function getBoundsLocal(coords) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    coords.forEach(c => {
        if (c.x < minX) minX = c.x; if (c.x > maxX) maxX = c.x;
        if (c.y < minY) minY = c.y; if (c.y > maxY) maxY = c.y;
        if (c.z < minZ) minZ = c.z; if (c.z > maxZ) maxZ = c.z;
    });
    return { minX, minY, minZ, maxX, maxY, maxZ };
}

function fillTriangleSolid(p1, p2, p3) {
    const ux = p2.x - p1.x, uy = p2.y - p1.y, uz = p2.z - p1.z;
    const uLen = Math.sqrt(ux*ux + uy*uy + uz*uz);
    if (uLen < 1e-9) return [];
    const uxN = ux / uLen, uyN = uy / uLen, uzN = uz / uLen;

    const ca = { x: p3.x - p1.x, y: p3.y - p1.y, z: p3.z - p1.z };
    const dotU = ca.x*uxN + ca.y*uyN + ca.z*uzN;
    let vx = ca.x - uxN*dotU, vy = ca.y - uyN*dotU, vz = ca.z - uzN*dotU;
    const vLen = Math.sqrt(vx*vx + vy*vy + vz*vz);
    if (vLen < 1e-9) return [];
    vx /= vLen; vy /= vLen; vz /= vLen;

    // 法向量
    const nx = uyN*vz - uzN*vy;
    const ny = uzN*vx - uxN*vz;
    const nz = uxN*vy - uyN*vx;

    const minX = Math.floor(Math.min(p1.x, p2.x, p3.x)) - 1;
    const maxX = Math.ceil(Math.max(p1.x, p2.x, p3.x)) + 1;
    const minY = Math.floor(Math.min(p1.y, p2.y, p3.y)) - 1;
    const maxY = Math.ceil(Math.max(p1.y, p2.y, p3.y)) + 1;
    const minZ = Math.floor(Math.min(p1.z, p2.z, p3.z)) - 1;
    const maxZ = Math.ceil(Math.max(p1.z, p2.z, p3.z)) + 1;

    const pts = [];
    for (let x = minX; x <= maxX; x++)
        for (let y = minY; y <= maxY; y++)
            for (let z = minZ; z <= maxZ; z++) {
                const dxp = x - p1.x, dyp = y - p1.y, dzp = z - p1.z;
                // 平面距离
                const dist = dxp*nx + dyp*ny + dzp*nz;
                if (Math.abs(dist) > 0.75) continue;
                // 投影到平面内的 2D 坐标
                const px = dxp*uxN + dyp*uyN + dzp*uzN;
                const py = dxp*vx + dyp*vy + dzp*vz;
                if (pointInTriangle2D(px, py, 0, 0, uLen, 0, dotU, vLen)) {
                    pts.push({ x, y, z });
                }
            }
    return pts;
}

function generateShapePoints(coords, shapeType, mode) {
    if (coords.length < 2) return [];
    let pts;
    switch (shapeType) {
        case 1: pts = genCube(getBoundsLocal(coords), 1); break;
        case 2: pts = genPrism(coords); break;
        case 3: pts = genSphereFromDiameter(coords[0], coords[1]); break;
        case 4: {
            if (coords.length < 3) return [];
            pts = genCylinderCone(coords[0], coords[1], coords[2], qf.coneMode);
            break;
        }
        case 5: return genLine(coords[0], coords[1]);
        case 6: {
            if (coords.length < 3) return [];
            pts = genTriangleFace(coords[0], coords[1], coords[2]);
            break;
        }
        case 7: pts = genPyramid(coords); break;
        case 8: {
            if (coords.length < 3) return [];
            pts = genQuadFace(coords[0], coords[1], coords[2]);
            break;
        }
        default: return [];
    }
    let result = applyFillMode(pts, mode);
    if (qf.removeCap && (mode === 2 || mode === 3)) {
        result = removeEndCaps(result, shapeType);
    }
    return result;
}

// ==================== 快速填充：坐标管理 ====================
function qfAddCoord(x, y, z) {
    //if (qf.coords.some(c => c.x === x && c.y === y && c.z === z)) return false;
    qf.coords.push({ x, y, z });
    refreshQfCoordList();
    const need = getRequiredPointCount();
    if (qf.recordActive && qf.coords.length >= need) {
        qf.recordActive = false;
        updateRecordBtns();
        showToast(`已记录 ${need} 个坐标，自动停止收集`);
    }
    return true;
}
function getRequiredPointCount() {
    switch (qf.shapeType) {
        case 2: return 4;   // 三棱柱
        case 4: return 3;   // 圆柱/圆锥
        case 6: return 3;   // 三角形面
        case 7: return 4;   // 三棱锥
        case 8: return 3;   // 矩形面
        default: return 2;
    }
}
function qfRemoveCoord(idx) { qf.coords.splice(idx, 1); refreshQfCoordList(); }
function qfClearCoords() { qf.coords.length = 0; refreshQfCoordList(); }
function parseCoordText(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);
    const parsed = [], errors = [];
    lines.forEach((line, i) => {
        const parts = line.split(/[,;\s]+/).map(s => parseInt(s.trim(), 10));
        if (parts.length !== 3 || parts.some(isNaN)) {
            errors.push(`第 ${i + 1} 行格式错误: ${line}`);
            return;
        }
        parsed.push({ x: parts[0], y: parts[1], z: parts[2] });
    });
    return { parsed, errors };
}

// ==================== 快速填充：占用检测 ====================
function buildOccupiedSet() {
    const s = new Set();
    for (let z = 0; z < state.level.size.h; z++) {
        const layer = state.staticBlocks[z];
        if (!layer) continue;
        for (let y = 0; y < state.level.size.l; y++) {
            if (!layer[y]) continue;
            for (let x = 0; x < state.level.size.w; x++) {
                if (layer[y][x]) s.add(`${x},${y},${z}`);
            }
        }
    }
    state.spatialIndex.forEach((entries, key) => {
        if (entries.some(e => e.type !== 'waypoint')) s.add(key);
    });
    return s;
}

// ==================== 快速填充：静默写入 ====================
function fillStaticAt(x, y, z) {
    if (x < 0 || x >= state.level.size.w || y < 0 || y >= state.level.size.l ||
        z < 0 || z >= state.level.size.h) return false;
    const layer = state.staticBlocks[z];
    if (!layer || layer[y][x]) return false;
    const color = state.staticColor || getStaticDefault(z);
    layer[y][x] = { r: color.r, g: color.g, b: color.b };
    return true;
}
function deleteElementSilent(type, id) {
    let t = type;
    if (t === 'othercube_trigger' || t === 'othercube_cube') t = 'othercube';
    else if (t === 'darkcube_trigger' || t === 'darkcube_cube') t = 'darkcube';

    if (t === 'seqbutton') {
        for (const seq of state.buttonSequences) {
            const idx = seq.buttons ? seq.buttons.findIndex(b => b.id === id) : -1;
            if (idx !== -1) { seq.buttons.splice(idx, 1); return; }
        }
        return;
    }
    const arrays = {
        moving: state.movingPlatforms, falling: state.fallingPlatforms,
        prism: state.prisms, resizer: state.resizers, bumper: state.bumpers,
        checkpoint: state.checkpoints, cameratrigger: state.cameraTriggers,
        button: state.buttons, othercube: state.otherCubes,
        darkcube: state.darkCubes, buttonsequence: state.buttonSequences
    };
    const arr = arrays[t];
    if (!arr) return;
    const idx = arr.findIndex(m => m.id === id);
    if (idx === -1) return;
    if (t === 'moving') {
        const mp = arr[idx];
        const pos = getMovingPos(mp);
        state.buttons.forEach(btn => {
            if (btn.movingPlatformID === mp.xmlId || btn.movingPlatformID === mp.id) {
                btn.x = pos.x; btn.y = pos.y; btn.z = pos.z;
                btn.movingPlatformID = '';
            }
        });
        state.buttonSequences.forEach(seq => {
            (seq.buttons || []).forEach(btn => {
                if (btn.movingPlatformID === mp.xmlId || btn.movingPlatformID === mp.id) {
                    btn.position = { x: pos.x, y: pos.y, z: pos.z };
                    btn.movingPlatformID = '';
                }
            });
        });
    }
    const elem = arr[idx];
    cleanReferences(elem.xmlId || elem.id || id);
    arr.splice(idx, 1);
}
function mp_xmlId(elem) { return (elem && (elem.xmlId || elem.id)) || null; }

// ==================== 快速填充：主执行 ====================
function qfExecute() {
    if (qf.coords.length < 2) { showToast('请至少记录2个坐标'); return; }
    const tool = state.currentTool;
    const isEraser = tool === 'eraser';
    const supported = ['static','moving','falling','prism','resizerGrow','resizerShrink',
                       'bumper','checkpoint','cameratrigger','button','othercube','darkcube'];
    if (!isEraser && !supported.includes(tool)) {
        showToast('当前工具不支持快速填充');
        return;
    }

    const genMode = isEraser ? 1 : qf.fillMode;
    let allPoints = generateShapePoints(qf.coords, qf.shapeType, genMode);
    if (allPoints.length === 0) { showToast('形状未生成任何点'); return; }

    const occupied = buildOccupiedSet();

    if (!isEraser && qf.strictMode) {
        allPoints = applyStrictMode(allPoints);
        if (allPoints.length === 0) { showToast('严格模式过滤后没有有效点'); return; }
    }

    let targets;
    if (isEraser) {
        targets = allPoints.filter(p => occupied.has(`${p.x},${p.y},${p.z}`));
    } else if (qf.coverExisting) {
        targets = allPoints;
    } else {
        targets = allPoints.filter(p => !occupied.has(`${p.x},${p.y},${p.z}`));
    }

    if (targets.length === 0) {
        showToast(isEraser ? '范围内没有可删除的元素' : '所有位置都已有元素');
        return;
    }
    if (!confirm(`即将${isEraser ? '删除' : '填充'} ${targets.length} 个位置，确定吗？`)) return;

    state._suppressUI = true;
    const beforeSnap = _serializeHistory();
    const prevSuppress = state._suppressUndo;
    state._suppressUndo = true;

    let count = 0;
    try {
        if (isEraser) {
            targets.forEach(p => {
                const layer = state.staticBlocks[p.z];
                if (layer && layer[p.y] && layer[p.y][p.x]) layer[p.y][p.x] = null;
                const entries = getEntriesAt(p.x, p.y, p.z);
                const seen = new Set();
                entries.forEach(e => {
                    if (e.type === 'waypoint') return;
                    const key = `${e.type}:${e.id}`;
                    if (seen.has(key)) return;
                    seen.add(key);
                    deleteElementSilent(e.type, e.id);
                    count++;
                });
            });
            if (count === 0) count = targets.length;
        } else {
            targets.forEach(p => {
                const key = `${p.x},${p.y},${p.z}`;
                if (qf.coverExisting && occupied.has(key)) {
                    const layer = state.staticBlocks[p.z];
                    if (layer && layer[p.y] && layer[p.y][p.x]) layer[p.y][p.x] = null;
                    const entries = getEntriesAt(p.x, p.y, p.z);
                    const seen = new Set();
                    entries.forEach(e => {
                        if (e.type === 'waypoint') return;
                        const k = `${e.type}:${e.id}`;
                        if (seen.has(k)) return;
                        seen.add(k);
                        deleteElementSilent(e.type, e.id);
                    });
                    occupied.delete(key);
                }
                if (tool === 'static') {
                    if (fillStaticAt(p.x, p.y, p.z)) count++;
                } else {
                    switch (tool) {
                        case 'moving': placeMoving(p.x, p.y, p.z); break;
                        case 'falling': placeFalling(p.x, p.y, p.z); break;
                        case 'prism': placePrism(p.x, p.y, p.z); break;
                        case 'resizerGrow': placeResizer(p.x, p.y, p.z, 'grow'); break;
                        case 'resizerShrink': placeResizer(p.x, p.y, p.z, 'shrink'); break;
                        case 'bumper': placeBumper(p.x, p.y, p.z); break;
                        case 'checkpoint': placeCheckpoint(p.x, p.y, p.z); break;
                        case 'cameratrigger': placeCameraTrigger(p.x, p.y, p.z); break;
                        case 'button': placeButton(p.x, p.y, p.z); break;
                        case 'othercube': placeOtherCube(p.x, p.y, p.z); break;
                        case 'darkcube': placeDarkCube(p.x, p.y, p.z); break;
                    }
                    count++;
                }
            });
        }
    } finally {
        state._suppressUI = false;
        state._suppressUndo = prevSuppress;
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

    rebuildSpatialIndex();
    updateCanvasRangeFromSize();
    updateLayerMax();
    requestRender();
    updatePanel();
    updateElemList();
    updateStatus();
    uniInterface();
    if (!qf.keepCoordsAfter) qfClearCoords();
    showToast(`${isEraser ? '删除' : '填充'}完成：${count} 个位置`);
}

// ==================== 复制粘贴：复制 ====================
function doCopy() {
    if (cb.copyCoords.length < 2) { showToast('请先记录两个坐标确定选区'); return; }
    const b = boundsOf(cb.copyCoords);
    const min = { x: b.minX, y: b.minY, z: b.minZ };

    const blocks = [];
    for (let z = b.minZ; z <= b.maxZ; z++) {
        const layer = state.staticBlocks[z];
        if (!layer) continue;
        for (let y = b.minY; y <= b.maxY; y++) {
            if (!layer[y]) continue;
            for (let x = b.minX; x <= b.maxX; x++) {
                if (layer[y][x]) {
                    blocks.push({ x, y, z, r: layer[y][x].r, g: layer[y][x].g, b: layer[y][x].b });
                }
            }
        }
    }

    const inside = p => p && p.x >= b.minX && p.x <= b.maxX &&
                             p.y >= b.minY && p.y <= b.maxY &&
                             p.z >= b.minZ && p.z <= b.maxZ;

    const elements = [];
    function collect(type, arr, posGetter) {
        arr.forEach(el => {
            const p = posGetter(el);
            if (!inside(p)) return;
            const clone = JSON.parse(JSON.stringify(el));
            const item = {
                kind: 'top', type, clone,
                rel: { x: p.x - min.x, y: p.y - min.y, z: p.z - min.z }
            };
            if (type === 'moving' && clone.waypoints) {
                item.waypointRels = clone.waypoints.map(wp => ({
                    x: wp.x - min.x, y: wp.y - min.y, z: wp.z - min.z
                }));
            }
            if (type === 'othercube' || type === 'darkcube') {
                item.relCube = {
                    x: el.cubeX - min.x, y: el.cubeY - min.y, z: el.cubeZ - min.z
                };
            }
            elements.push(item);
        });
    }
    collect('moving', state.movingPlatforms, el => {
        const wp = el.waypoints && el.waypoints[0];
        return wp ? { x: wp.x, y: wp.y, z: wp.z } : null;
    });
    collect('falling', state.fallingPlatforms, el => ({ x: el.x, y: el.y, z: el.z }));
    collect('prism', state.prisms, el => ({ x: el.x, y: el.y, z: el.z }));
    collect('resizer', state.resizers, el => ({ x: el.x, y: el.y, z: el.z }));
    collect('bumper', state.bumpers, el => ({ x: el.x, y: el.y, z: el.z }));
    collect('checkpoint', state.checkpoints, el => ({ x: el.x, y: el.y, z: el.z }));
    collect('cameratrigger', state.cameraTriggers, el => ({ x: el.x, y: el.y, z: el.z }));
    collect('button', state.buttons, el => {
        if (el.movingPlatformID) {
            const mp = state.movingPlatforms.find(p =>
                p.id === el.movingPlatformID || p.xmlId === el.movingPlatformID);
            if (mp) {
                const mpPos = getMovingPos(mp);
                // 按钮显示位置就是 mp 位置 z+1
                return { x: mpPos.x, y: mpPos.y, z: mpPos.z + 1 };
            }
        }
        return { x: el.x, y: el.y, z: el.z };
    });
    collect('othercube', state.otherCubes, el => ({ x: el.triggerX, y: el.triggerY, z: el.triggerZ }));
    collect('darkcube', state.darkCubes, el => ({ x: el.triggerX, y: el.triggerY, z: el.triggerZ }));

    function getChildBtnPos(btn) {
        if (btn.movingPlatformID) {
            const mp = state.movingPlatforms.find(p =>
                p.id === btn.movingPlatformID || p.xmlId === btn.movingPlatformID);
            if (mp) {
                const mpPos = getMovingPos(mp);
                return { x: mpPos.x, y: mpPos.y, z: mpPos.z + 1 };
            }
        }
        return btn.position ? { x: btn.position.x, y: btn.position.y, z: btn.position.z } : null;
    }

    state.buttonSequences.forEach(seq => {
        if (!seq.buttons || seq.buttons.length === 0) return;
        const childPositions = seq.buttons.map(getChildBtnPos).filter(Boolean);
        if (childPositions.length === 0) return;
        if (!childPositions.some(inside)) return;
        const clone = JSON.parse(JSON.stringify(seq));
        const childRels = clone.buttons.map(btn => {
            const p = getChildBtnPos(btn);
            return p ? { x: p.x - min.x, y: p.y - min.y, z: p.z - min.z } : null;
        });
        elements.push({ kind: 'buttonsequence', type: 'buttonsequence', clone, childRels });
    });

    cb.clipboard = {
        min,
        max: { x: b.maxX, y: b.maxY, z: b.maxZ },   // ★ 记下 bbox 上限
        blocks,
        elements
    };
    if (!cb.keepCoordsAfter) {
        cb.copyCoords.length = 0;
        refreshCbCopyList();
    }
    showToast(`已复制 ${blocks.length} 方块 + ${elements.length} 元素`);
    refreshCbStatus();

    // 通知 3D 刷新选区框（如果已经接入）
    if (typeof window.__onCopySelectionChanged === 'function') {
        window.__onCopySelectionChanged();
    }
}

// ==================== 复制粘贴：粘贴 ====================
function doPaste() {
    if (!cb.clipboard) { showToast('剪贴板为空'); return; }
    if (!cb.pasteCoord) { showToast('请先记录粘贴目标坐标'); return; }
    // 整份深拷贝，避免污染剪贴板里原始数据
    const clip = JSON.parse(JSON.stringify(cb.clipboard));
    const target = cb.pasteCoord;
    const normal = cb.normal;
    //const clip = cb.clipboard;

    function mapOffset(rx, ry, rz) {
        let mx, my;
        switch (normal) {
            case 'y+': mx =  rx; my =  ry; break;
            case 'y-': mx = -rx; my = -ry; break;
            case 'x+': mx =  ry; my = -rx; break;
            case 'x-': mx = -ry; my =  rx; break;
            default:   mx =  rx; my =  ry;
        }
        return { x: target.x + mx, y: target.y + my, z: target.z + rz };
    }

    const PREFIX = {
        moving: 'M', falling: 'F', prism: 'P', resizer: 'R',
        bumper: 'B', checkpoint: 'CP', cameratrigger: 'CT',
        button: 'Btn', othercube: 'OC', darkcube: 'DC',
        seqbutton: 'SB', buttonsequence: 'BS'
    };

    const idMap = new Map();
    const xmlMap = new Map();
    function allocXml(c, newInternalId) {
        if (!c.xmlId) return;
        const newXml = generateUniqueXmlId(newInternalId);
        xmlMap.set(c.xmlId, newXml);
        c.xmlId = newXml;
    }
    clip.elements.forEach(item => {
        const c = item.clone;
        if (item.kind === 'top') {
            const oldId = c.id;
            const newId = generateInternalId(PREFIX[item.type] || 'E');
            c.id = newId;
            if (oldId) idMap.set(oldId, newId);
            allocXml(c, newId);
        } else if (item.kind === 'buttonsequence') {
            const oldSeqId = c.id;
            const newSeqId = generateInternalId('BS');
            c.id = newSeqId;
            if (oldSeqId) idMap.set(oldSeqId, newSeqId);
            (c.buttons || []).forEach(btn => {
                const oldBtnId = btn.id;
                const newBtnId = generateInternalId('SB');
                btn.id = newBtnId;
                if (oldBtnId) idMap.set(oldBtnId, newBtnId);
                allocXml(btn, newBtnId);
            });
        }
    });

    function remapSingle(v) {
        if (!v) return v;
        if (xmlMap.has(v)) return xmlMap.get(v);
        if (idMap.has(v)) return idMap.get(v);
        return v;
    }
    function remapList(str) {
        if (!str) return str;
        return str.split(',').map(s => {
            s = s.trim();
            if (!s) return '';
            const m = s.match(/^([^(]+)(\([^)]*\))?$/);
            if (!m) return s;
            const oldId = m[1].trim();
            const data = m[2] || '';
            let newId = oldId;
            if (xmlMap.has(oldId)) newId = xmlMap.get(oldId);
            else if (idMap.has(oldId)) newId = idMap.get(oldId);
            return newId + data;
        }).filter(Boolean).join(',');
    }
    function remapReferences(c) {
        if (c.movingPlatformID) c.movingPlatformID = remapSingle(c.movingPlatformID);
        if (c.relatedTo)       c.relatedTo       = remapSingle(c.relatedTo);
        if (c.movingBlockSync) c.movingBlockSync = remapSingle(c.movingBlockSync);
        if (c.affectMoving)    c.affectMoving    = remapList(c.affectMoving);
        if (c.affectBumpers)   c.affectBumpers   = remapList(c.affectBumpers);
        if (c.affectButtons)   c.affectButtons   = remapList(c.affectButtons);
    }

    const prevSuppressUI = state._suppressUI;
    const prevSuppressUndo = state._suppressUndo;
    state._suppressUI = true;
    state._suppressUndo = true;

    const beforeSnap = _serializeHistory();
    let countBlocks = 0, countElems = 0;

    const getArray = t => ({
        moving: state.movingPlatforms, falling: state.fallingPlatforms,
        prism: state.prisms, resizer: state.resizers, bumper: state.bumpers,
        checkpoint: state.checkpoints, cameratrigger: state.cameraTriggers,
        button: state.buttons, othercube: state.otherCubes, darkcube: state.darkCubes
    })[t];

    try {
        // ★ 覆盖模式：先清空目标区域
        if (cb.overwrite && clip.max) {
            const bW = clip.max.x - clip.min.x;
            const bL = clip.max.y - clip.min.y;
            const bH = clip.max.z - clip.min.z;
            for (let dz = 0; dz <= bH; dz++) {
                for (let dy = 0; dy <= bL; dy++) {
                    for (let dx = 0; dx <= bW; dx++) {
                        const dst = mapOffset(dx, dy, dz);
                        if (dst.x < 0 || dst.x >= state.level.size.w) continue;
                        if (dst.y < 0 || dst.y >= state.level.size.l) continue;
                        if (dst.z < 0 || dst.z >= state.level.size.h) continue;
                        // 清空静态方块
                        const layer = state.staticBlocks[dst.z];
                        if (layer && layer[dst.y]) layer[dst.y][dst.x] = null;
                        // 清空非静态元素
                        const entries = getEntriesAt(dst.x, dst.y, dst.z);
                        entries.forEach(e => {
                            if (e.type === 'waypoint') return;
                            deleteElementSilent(e.type, e.id);
                        });
                    }
                }
            }
        }
        clip.blocks.forEach(b => {
            const dst = mapOffset(b.x - clip.min.x, b.y - clip.min.y, b.z - clip.min.z);
            if (dst.x < 0 || dst.x >= state.level.size.w ||
                dst.y < 0 || dst.y >= state.level.size.l ||
                dst.z < 0 || dst.z >= state.level.size.h) return;
            const layer = state.staticBlocks[dst.z];
            if (!layer) return;
            layer[dst.y][dst.x] = { r: b.r, g: b.g, b: b.b };
            countBlocks++;
        });

        clip.elements.forEach(item => {
            const c = item.clone;
            if (item.kind === 'top') {
                if (item.type === 'moving') {
                    (c.waypoints || []).forEach((wp, i) => {
                        const r = item.waypointRels[i];
                        if (!r) return;
                        const d = mapOffset(r.x, r.y, r.z);
                        wp.x = d.x; wp.y = d.y; wp.z = d.z;
                    });
                } else if (item.type === 'othercube' || item.type === 'darkcube') {
                    const d = mapOffset(item.rel.x, item.rel.y, item.rel.z);
                    c.triggerX = d.x; c.triggerY = d.y; c.triggerZ = d.z;
                    if (item.relCube) {
                        const dc = mapOffset(item.relCube.x, item.relCube.y, item.relCube.z);
                        c.cubeX = dc.x; c.cubeY = dc.y; c.cubeZ = dc.z;
                    }
                } else {
                    const d = mapOffset(item.rel.x, item.rel.y, item.rel.z);
                    c.x = d.x; c.y = d.y; c.z = d.z;
                }
                remapReferences(c);
                const arr = getArray(item.type);
                if (arr) { arr.push(c); countElems++; }
            } else if (item.kind === 'buttonsequence') {
                (c.buttons || []).forEach((btn, i) => {
                    const r = item.childRels[i];
                    if (!r || !btn.position) return;
                    const d = mapOffset(r.x, r.y, r.z);
                    btn.position = { x: d.x, y: d.y, z: d.z };
                });
                remapReferences(c);
                (c.buttons || []).forEach(remapReferences);
                state.buttonSequences.push(c);
                countElems++;
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

    rebuildSpatialIndex();
    updateCanvasRangeFromSize();
    updateLayerMax();
    requestRender();
    updatePanel();
    updateElemList();
    updateStatus();
    uniInterface();
    if (!cb.keepCoordsAfter) {
        cb.pasteCoord = null;
        refreshCbPasteInfo();
    }
    showToast(`已粘贴 ${countBlocks} 方块 + ${countElems} 元素`);
}

// ==================== 复制粘贴：坐标管理 ====================
function cbAddCopyCoord(x, y, z) {
    if (cb.copyCoords.length >= 2) cb.copyCoords.length = 0;
    cb.copyCoords.push({ x, y, z });
    refreshCbCopyList();
    if (cb.copyCoords.length === 2) {
        cb.recordMode = null;
        updateRecordBtns();
        showToast('复制选区已确定');
    }
    // ← 新增
    if (typeof window.__onCopySelectionChanged === 'function') {
        window.__onCopySelectionChanged();
    }
}
function cbRemoveCopyCoord(i) {
    cb.copyCoords.splice(i, 1);
    refreshCbCopyList();
    if (typeof window.__onCopySelectionChanged === 'function') {
        window.__onCopySelectionChanged();
    }
}
function cbClearCopyCoords() {
    cb.copyCoords.length = 0;
    refreshCbCopyList();
    if (typeof window.__onCopySelectionChanged === 'function') {
        window.__onCopySelectionChanged();
    }
}

// ==================== UI：面板 ====================
function createPanel() {
    const p = document.createElement('div');
    p.id = 'quickFillPanel';
    p.style.cssText = `
        position: fixed; right: 10px; width: 320px;
        background: #16213e; border: 1px solid #1a4a7a; border-radius: 8px;
        padding: 12px; color: #ccc; font-size: 12px; z-index: 9999;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5); display: none;
        overflow-y: auto;
    `;
    p.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div style="display:flex;gap:6px;">
                <button id="tabFill" style="padding:4px 12px;background:#4fc3f7;color:#0a0a1a;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">⚡ 填充</button>
                <button id="tabClip" style="padding:4px 12px;background:#1a4a7a;color:#fff;border:none;border-radius:4px;cursor:pointer;">📋 复制粘贴</button>
            </div>
            <button id="qfCloseBtn" style="background:none;border:none;color:#aaa;font-size:16px;cursor:pointer;">✕</button>
        </div>

        <!-- ============ 填充面板 ============ -->
        <div id="fillContent">
            <button id="qfRecordBtn" style="width:100%;padding:6px;background:#1a4a7a;border:none;color:#fff;border-radius:4px;cursor:pointer;margin-bottom:8px;">
                ▶ 开始记录坐标（点击画布或选择元素）
            </button>
            <div style="color:#8ab4f8;margin-bottom:4px;">已记录坐标:</div>
            <div id="qfCoordList" style="max-height:100px;overflow-y:auto;background:#0a0a1a;border:1px solid #1a4a7a;border-radius:4px;padding:4px;font-size:11px;font-family:monospace;"></div>
            <div style="display:flex;gap:4px;margin-top:4px;">
                <button id="qfAddCurrentBtn" style="flex:1;padding:4px;background:#1a4a7a;border:none;color:#fff;border-radius:4px;cursor:pointer;">+ 添加鼠标位置</button>
                <button id="qfClearCoordsBtn" style="padding:4px 8px;background:#a03030;border:none;color:#fff;border-radius:4px;cursor:pointer;">清空</button>
            </div>
            <div style="color:#8ab4f8;margin:8px 0 4px;">批量输入坐标（每行 x,y,z）:</div>
            <textarea id="qfCoordInput" rows="3" style="width:100%;box-sizing:border-box;background:#0f3460;border:1px solid #1a4a7a;color:#eee;padding:4px;border-radius:4px;font-family:monospace;font-size:11px;resize:vertical;" placeholder="0,0,0&#10;5,5,0"></textarea>
            <button id="qfImportBtn" style="margin-top:4px;padding:4px 12px;background:#1a4a7a;border:none;color:#fff;border-radius:4px;cursor:pointer;">导入坐标</button>

            <div style="margin-top:10px;color:#8ab4f8;">填充模式:</div>
            <label style="display:block;margin:2px 0;"><input type="radio" name="qfFillMode" value="1" checked> 实心</label>
            <label style="display:block;margin:2px 0;"><input type="radio" name="qfFillMode" value="2"> 空心</label>
            <label style="display:block;margin:2px 0;"><input type="radio" name="qfFillMode" value="3"> 线/框架</label>
            <label style="display:block;margin:4px 0;color:#8ab4f8;">
                <input type="checkbox" id="qfStrictMode"> 严格模式（每元素至少接触一个邻居）
            </label>
            <label style="display:block;margin:4px 0;color:#8ab4f8;">
                <input type="checkbox" id="qfCoverExisting"> 覆盖已有元素（默认关闭）
            </label>
            <label style="display:block;margin:4px 0;color:#8ab4f8;">
                <input type="checkbox" id="qfRemoveCap"> 去端面（棱柱/圆柱去顶底，棱锥/圆锥去底）
            </label>

            <div style="margin-top:8px;color:#8ab4f8;">形状:</div>
            <label style="display:block;margin:2px 0;"><input type="radio" name="qfShape" value="5"> 线（2 点）</label>
            <label style="display:block;margin:2px 0;"><input type="radio" name="qfShape" value="6"> 三角形面（3 点）</label>
            <label style="display:block;margin:2px 0;"><input type="radio" name="qfShape" value="8"> 矩形面（3 点）</label>
            <label style="display:block;margin:2px 0;"><input type="radio" name="qfShape" value="1" checked> 立方体（2 点）</label>
            <label style="display:block;margin:2px 0;"><input type="radio" name="qfShape" value="2"> 棱柱（3 点=矩形+方向，4 点=三角+方向）</label>
            <label style="display:block;margin:2px 0;"><input type="radio" name="qfShape" value="7"> 棱锥（3 点=矩形+顶点，4 点=三角+顶点）</label>
            <label style="display:block;margin:2px 0;"><input type="radio" name="qfShape" value="3"> 球（2 点）</label>
            <label style="display:block;margin:2px 0;"><input type="radio" name="qfShape" value="4"> 圆柱/圆锥（3 点：直径+母线/顶点）</label>
            <label style="display:block;margin:4px 0;color:#8ab4f8;">
                <input type="checkbox" id="qfConeMode"> 圆锥模式（形状 4 使用顶点收尖）
            </label>

            <label style="display:block;margin:6px 0;color:#8ab4f8;">
                <input type="checkbox" id="qfKeepCoords"> 操作后保留坐标记录
            </label>
            <div style="margin-top:10px;padding-top:8px;border-top:1px solid #1a4a7a;">
                <div style="color:#8ab4f8;margin-bottom:4px;">当前工具: <span id="qfCurrentTool" style="color:#ffaa44;">-</span></div>
                <button id="qfFillBtn" style="width:100%;padding:8px;background:#14532d;border:1px solid #22c55e;color:#86efac;border-radius:4px;cursor:pointer;font-weight:bold;">
                    ⚡ 执行填充 / 删除
                </button>
            </div>
        </div>

        <!-- ============ 复制粘贴面板 ============ -->
        <div id="clipContent" style="display:none;">
            <div style="color:#8ab4f8;margin-bottom:4px;">① 复制选区（两个对角坐标）:</div>
            <button id="cbRecordCopyBtn" style="width:100%;padding:6px;background:#1a4a7a;border:none;color:#fff;border-radius:4px;cursor:pointer;margin-bottom:4px;">
                ▶ 记录复制选区（点击画布或选择元素）
            </button>
            <div id="cbCopyList" style="max-height:80px;overflow-y:auto;background:#0a0a1a;border:1px solid #1a4a7a;border-radius:4px;padding:4px;font-family:monospace;font-size:11px;"></div>
            <div style="display:flex;gap:4px;margin-top:4px;">
                <button id="cbCopyAddBtn" style="flex:1;padding:4px;background:#1a4a7a;border:none;color:#fff;border-radius:4px;cursor:pointer;">+ 鼠标位置</button>
                <button id="cbCopyClearBtn" style="padding:4px 8px;background:#a03030;border:none;color:#fff;border-radius:4px;cursor:pointer;">清空</button>
            </div>
            <button id="cbCopyBtn" style="width:100%;padding:6px;margin-top:6px;background:#14532d;border:1px solid #22c55e;color:#86efac;border-radius:4px;cursor:pointer;font-weight:bold;">
                📄 复制
            </button>

            <div style="color:#8ab4f8;margin:8px 0 4px;">批量输入坐标（每行 x,y,z，取前两个）:</div>
            <textarea id="cbCoordInput" rows="3" style="width:100%;box-sizing:border-box;background:#0f3460;border:1px solid #1a4a7a;color:#eee;padding:4px;border-radius:4px;font-family:monospace;font-size:11px;resize:vertical;" placeholder="0,0,0&#10;5,5,0"></textarea>
            <button id="cbImportBtn" style="margin-top:4px;padding:4px 12px;background:#1a4a7a;border:none;color:#fff;border-radius:4px;cursor:pointer;">导入为复制选区</button>

            <label style="display:block;margin:8px 0 4px;color:#8ab4f8;">
                <input type="checkbox" id="cbKeepCoords"> 操作后保留坐标记录
            </label>

            <hr style="border:none;border-top:1px solid #1a4a7a;margin:10px 0;">

            <div style="color:#8ab4f8;margin-bottom:4px;">② 粘贴目标（一个坐标）:</div>
            <button id="cbRecordPasteBtn" style="width:100%;padding:6px;background:#1a4a7a;border:none;color:#fff;border-radius:4px;cursor:pointer;margin-bottom:4px;">
                ▶ 记录粘贴目标（点击画布或选择元素）
            </button>
            <div id="cbPasteInfo" style="background:#0a0a1a;border:1px solid #1a4a7a;border-radius:4px;padding:4px;font-family:monospace;font-size:11px;">未设置</div>
            <div style="display:flex;gap:4px;margin-top:4px;">
                <input id="cbPasteInput" type="text" placeholder="或输入 x,y,z" style="flex:1;background:#0f3460;border:1px solid #1a4a7a;color:#eee;padding:4px;border-radius:4px;font-family:monospace;font-size:11px;">
                <button id="cbPasteApplyBtn" style="padding:4px 8px;background:#1a4a7a;border:none;color:#fff;border-radius:4px;cursor:pointer;">应用</button>
            </div>

            <div style="color:#8ab4f8;margin:8px 0 4px;">③ 法线方向:</div>
            <label style="display:block;margin:2px 0;"><input type="radio" name="cbNormal" value="y+" checked> Y+ (默认)</label>
            <label style="display:block;margin:2px 0;"><input type="radio" name="cbNormal" value="y-"> Y-</label>
            <label style="display:block;margin:2px 0;"><input type="radio" name="cbNormal" value="x+"> X+</label>
            <label style="display:block;margin:2px 0;"><input type="radio" name="cbNormal" value="x-"> X-</label>

            
            <label style="display:block;margin:8px 0 4px;color:#8ab4f8;">
                <input type="checkbox" id="cbOverwrite"> 覆盖目标位置原有元素
            </label>
            <button id="cbPasteBtn" style="width:100%;padding:8px;margin-top:10px;background:#14532d;border:1px solid #22c55e;color:#86efac;border-radius:4px;cursor:pointer;font-weight:bold;">
                📥 粘贴
            </button>

            <div id="cbStatus" style="margin-top:6px;font-size:11px;color:#5a7a9a;">剪贴板：空</div>
        </div>
    `;
    document.body.appendChild(p);
    return p;
}

// ==================== UI：刷新 ====================
function refreshQfCoordList() {
    const list = document.getElementById('qfCoordList');
    if (!list) return;
    if (qf.coords.length === 0) { list.innerHTML = '<div style="color:#5a7a9a;">暂无坐标</div>'; return; }
    list.innerHTML = qf.coords.map((c, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:2px 0;border-bottom:1px solid #1a2a4a;">
            <span>${i + 1}. (${c.x},${c.y},${c.z})</span>
            <button onclick="window._qfRemoveCoord(${i})" style="background:none;border:none;color:#a03030;cursor:pointer;font-size:14px;">✕</button>
        </div>
    `).join('');
}
window._qfRemoveCoord = qfRemoveCoord;

function refreshCbCopyList() {
    const el = document.getElementById('cbCopyList');
    if (!el) return;
    if (cb.copyCoords.length === 0) { el.innerHTML = '<div style="color:#5a7a9a;">暂无坐标</div>'; return; }
    el.innerHTML = cb.copyCoords.map((c, i) => `
        <div style="display:flex;justify-content:space-between;">
            <span>${i + 1}. (${c.x},${c.y},${c.z})</span>
            <button onclick="window._cbRemoveCopyCoord(${i})" style="background:none;border:none;color:#a03030;cursor:pointer;">✕</button>
        </div>
    `).join('');
}
window._cbRemoveCopyCoord = cbRemoveCopyCoord;

function refreshCbPasteInfo() {
    const el = document.getElementById('cbPasteInfo');
    if (!el) return;
    el.textContent = cb.pasteCoord ? `(${cb.pasteCoord.x}, ${cb.pasteCoord.y}, ${cb.pasteCoord.z})` : '未设置';
}

function refreshCbStatus() {
    const el = document.getElementById('cbStatus');
    if (!el) return;
    if (!cb.clipboard) { el.textContent = '剪贴板：空'; return; }
    el.textContent = `剪贴板：${cb.clipboard.blocks.length} 方块 + ${cb.clipboard.elements.length} 元素`;
}

function updateRecordBtns() {
    const b1 = document.getElementById('qfRecordBtn');
    if (b1) {
        b1.textContent = qf.recordActive
            ? '✅ 记录中（点击停止）'
            : '▶ 开始记录坐标（点击画布或选择元素）';
        b1.style.background = qf.recordActive ? '#14532d' : '#1a4a7a';
    }
    const b2 = document.getElementById('cbRecordCopyBtn');
    if (b2) {
        b2.textContent = cb.recordMode === 'copy'
            ? '✅ 记录中（点击停止）'
            : '▶ 记录复制选区（点击画布或选择元素）';
        b2.style.background = cb.recordMode === 'copy' ? '#14532d' : '#1a4a7a';
    }
    const b3 = document.getElementById('cbRecordPasteBtn');
    if (b3) {
        b3.textContent = cb.recordMode === 'paste'
            ? '✅ 记录中（点击停止）'
            : '▶ 记录粘贴目标（点击画布或选择元素）';
        b3.style.background = cb.recordMode === 'paste' ? '#14532d' : '#1a4a7a';
    }
}

function switchTab(tab) {
    activeTab = tab;
    const fillContent = document.getElementById('fillContent');
    const clipContent = document.getElementById('clipContent');
    const tabFill = document.getElementById('tabFill');
    const tabClip = document.getElementById('tabClip');
    if (tab === 'fill') {
        fillContent.style.display = 'block';
        clipContent.style.display = 'none';
        tabFill.style.background = '#4fc3f7';
        tabFill.style.color = '#0a0a1a';
        tabClip.style.background = '#1a4a7a';
        tabClip.style.color = '#fff';
    } else {
        fillContent.style.display = 'none';
        clipContent.style.display = 'block';
        tabFill.style.background = '#1a4a7a';
        tabFill.style.color = '#fff';
        tabClip.style.background = '#4fc3f7';
        tabClip.style.color = '#0a0a1a';
    }
    // 切换时清空不相关的记录模式，避免混淆
    qf.recordActive = false;
    cb.recordMode = null;
    updateRecordBtns();
}

// ==================== UI：事件 ====================
function bindEvents() {
    document.getElementById('qfCloseBtn').addEventListener('click', () => {
        panel.style.display = 'none';
        qf.recordActive = false;
        cb.recordMode = null;
        updateRecordBtns();
    });
    document.getElementById('tabFill').addEventListener('click', () => switchTab('fill'));
    document.getElementById('tabClip').addEventListener('click', () => switchTab('clip'));

    // ---- 填充事件 ----
    document.getElementById('qfRecordBtn').addEventListener('click', () => {
        qf.recordActive = !qf.recordActive;
        cb.recordMode = null;
        updateRecordBtns();
        if (qf.recordActive) showToast('点击画布或选择元素记录坐标');
    });
    document.getElementById('qfAddCurrentBtn').addEventListener('click', () => {
        if (lastMousePos.x === null) { showToast('请先在画布上移动鼠标'); return; }
        qfAddCoord(lastMousePos.x, lastMousePos.y, state.currentLayer);
    });
    document.getElementById('qfClearCoordsBtn').addEventListener('click', () => {
        if (qf.coords.length === 0) return;
        if (!confirm('清空所有坐标？')) return;
        qfClearCoords();
    });
    document.getElementById('qfImportBtn').addEventListener('click', () => {
        const text = document.getElementById('qfCoordInput').value;
        const { parsed, errors } = parseCoordText(text);
        if (errors.length > 0) { showToast(errors[0]); return; }
        if (parsed.length === 0) { showToast('没有有效坐标'); return; }
        let added = 0;
        parsed.forEach(c => { if (qfAddCoord(c.x, c.y, c.z)) added++; });
        showToast(`导入 ${added} 个坐标`);
    });
    document.querySelectorAll('input[name="qfFillMode"]').forEach(el => {
        el.addEventListener('change', () => { qf.fillMode = parseInt(el.value, 10); });
    });
    document.querySelectorAll('input[name="qfShape"]').forEach(el => {
        el.addEventListener('change', () => { qf.shapeType = parseInt(el.value, 10); });
    });
    document.getElementById('qfStrictMode').addEventListener('change', function() { qf.strictMode = this.checked; });
    document.getElementById('qfConeMode').addEventListener('change', function() { qf.coneMode = this.checked; });
    document.getElementById('qfCoverExisting').addEventListener('change', function() { qf.coverExisting = this.checked; });
    document.getElementById('qfFillBtn').addEventListener('click', qfExecute);
    document.getElementById('qfRemoveCap').addEventListener('change', function() {
        qf.removeCap = this.checked;
    });

    // ---- 复制粘贴事件 ----
    document.getElementById('cbRecordCopyBtn').addEventListener('click', () => {
        cb.recordMode = cb.recordMode === 'copy' ? null : 'copy';
        qf.recordActive = false;
        updateRecordBtns();
    });
    document.getElementById('cbRecordPasteBtn').addEventListener('click', () => {
        cb.recordMode = cb.recordMode === 'paste' ? null : 'paste';
        qf.recordActive = false;
        updateRecordBtns();
    });
    document.getElementById('cbCopyAddBtn').addEventListener('click', () => {
        if (lastMousePos.x === null) { showToast('请先在画布上移动鼠标'); return; }
        cbAddCopyCoord(lastMousePos.x, lastMousePos.y, state.currentLayer);
    });
    document.getElementById('cbCopyClearBtn').addEventListener('click', () => {
        cbClearCopyCoords();
    });
    document.getElementById('cbCopyBtn').addEventListener('click', doCopy);

    document.getElementById('cbPasteApplyBtn').addEventListener('click', () => {
        const txt = document.getElementById('cbPasteInput').value.trim();
        const parts = txt.split(/[,;\s]+/).map(s => parseInt(s.trim(), 10));
        if (parts.length !== 3 || parts.some(isNaN)) { showToast('格式：x,y,z'); return; }
        cb.pasteCoord = { x: parts[0], y: parts[1], z: parts[2] };
        refreshCbPasteInfo();
    });
    document.querySelectorAll('input[name="cbNormal"]').forEach(el => {
        el.addEventListener('change', () => { cb.normal = el.value; });
    });
    document.getElementById('cbPasteBtn').addEventListener('click', doPaste);
    const owEl = document.getElementById('cbOverwrite');
    if (owEl) {
        owEl.addEventListener('change', function () {
            cb.overwrite = this.checked;
        });
    }
    
    // 保留坐标复选框
    document.getElementById('qfKeepCoords').addEventListener('change', function() {
        qf.keepCoordsAfter = this.checked;
    });
    document.getElementById('cbKeepCoords').addEventListener('change', function() {
        cb.keepCoordsAfter = this.checked;
    });

    // 复制粘贴面板的批量导入
    document.getElementById('cbImportBtn').addEventListener('click', () => {
        const text = document.getElementById('cbCoordInput').value;
        const { parsed, errors } = parseCoordText(text);
        if (errors.length > 0) { showToast(errors[0]); return; }
        if (parsed.length === 0) { showToast('没有有效坐标'); return; }
        cb.copyCoords.length = 0;
        for (const c of parsed) {
            cb.copyCoords.push(c);
            if (cb.copyCoords.length === 2) break;
        }
        refreshCbCopyList();
        showToast(`已导入 ${cb.copyCoords.length} 个坐标到复制选区`);
        if (typeof window.__onCopySelectionChanged === 'function') {
            window.__onCopySelectionChanged();
        }
    });

    // ---- 画布点击：记录坐标（捕获阶段） ----
    if (typeof canvas !== 'undefined' && canvas) {
        canvas.addEventListener('click', (e) => {
            // 快速填充记录
            if (qf.recordActive && activeTab === 'fill') {
                e.stopImmediatePropagation(); e.preventDefault();
                const real = getCanvasGridFromEvent(e);
                if (!real) return;
                qfAddCoord(real.x, real.y, state.currentLayer);
                return;
            }
            // 复制/粘贴记录
            if (cb.recordMode && activeTab === 'clip') {
                e.stopImmediatePropagation(); e.preventDefault();
                const real = getCanvasGridFromEvent(e);
                if (!real) return;
                if (cb.recordMode === 'copy') {
                    cbAddCopyCoord(real.x, real.y, state.currentLayer);
                } else if (cb.recordMode === 'paste') {
                    cb.pasteCoord = { x: real.x, y: real.y, z: state.currentLayer };
                    cb.recordMode = null;
                    updateRecordBtns();
                    refreshCbPasteInfo();
                    showToast('粘贴目标已确定');
                }
            }
        }, true);
        
        canvas.addEventListener('touchend', (e) => {
            if (qf.recordActive && activeTab === 'fill') {
                e.stopImmediatePropagation(); e.preventDefault();
                const t = e.changedTouches[0];
                const real = getCanvasGridFromEvent({ clientX: t.clientX, clientY: t.clientY });
                if (!real) return;
                qfAddCoord(real.x, real.y, state.currentLayer);
                return;
            }
            if (cb.recordMode && activeTab === 'clip') {
                e.stopImmediatePropagation(); e.preventDefault();
                const t = e.changedTouches[0];
                const real = getCanvasGridFromEvent({ clientX: t.clientX, clientY: t.clientY });
                if (!real) return;
                if (cb.recordMode === 'copy') cbAddCopyCoord(real.x, real.y, state.currentLayer);
                else if (cb.recordMode === 'paste') {
                    cb.pasteCoord = { x: real.x, y: real.y, z: state.currentLayer };
                    cb.recordMode = null;
                    updateRecordBtns();
                    refreshCbPasteInfo();
                    showToast('粘贴目标已确定');
                }
            }
        }, { passive: false, capture: true });

        canvas.addEventListener('mousemove', (e) => {
            const real = getCanvasGridFromEvent(e);
            if (real) lastMousePos = { x: real.x, y: real.y, z: state.currentLayer };
        });
    }
}

function getCanvasGridFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * sx;
    const my = (e.clientY - rect.top) * sy;
    const gx = Math.floor((mx - PADDING) / PIXEL_SIZE);
    const gy = Math.floor((my - PADDING) / PIXEL_SIZE);
    const realX = currentMinX + gx;
    const realY = currentMinY + gy;
    if (isNaN(realX) || isNaN(realY)) return null;
    return { x: realX, y: realY };
}

// ==================== 面板位置 ====================
function repositionPanel() {
    const p = document.getElementById('quickFillPanel');
    if (!p) return;
    const toolbar = document.getElementById('toolbar');
    if (!toolbar) return;
    const rect = toolbar.getBoundingClientRect();
    const top = rect.bottom + 6;
    const maxH = window.innerHeight - top - 10;
    p.style.top = top + 'px';
    p.style.maxHeight = Math.max(120, maxH) + 'px';
}

// ==================== 初始化 ====================
function init() {
    if (panel && document.body.contains(panel)) return;
    panel = createPanel();
    bindEvents();
    refreshQfCoordList();
    refreshCbCopyList();
    refreshCbPasteInfo();
    refreshCbStatus();
    updateRecordBtns();
    switchTab('fill');

    setInterval(() => {
        const el = document.getElementById('qfCurrentTool');
        if (el) el.textContent = state.currentTool || '-';
    }, 500);

    // 工具栏按钮
    const unified = document.getElementById('unifiedMovementContainer');
    if (unified && unified.parentElement && !document.getElementById('toolQuickFill')) {
        const parent = unified.parentElement;
        const sep = document.createElement('div');
        sep.className = 'sep';
        parent.insertBefore(sep, unified.nextSibling);
        const btn = document.createElement('button');
        btn.id = 'toolQuickFill';
        btn.textContent = '⚡ 快速填充 / 复制';
        btn.title = '快速填充 + 选区复制粘贴';
        btn.addEventListener('click', () => window.QuickFill.toggle());
        parent.insertBefore(btn, sep.nextSibling);
    }

    window.addEventListener('resize', repositionPanel);
    if (typeof ResizeObserver !== 'undefined') {
        const toolbar = document.getElementById('toolbar');
        if (toolbar) new ResizeObserver(repositionPanel).observe(toolbar);
    }
}

// ==================== 对外接口 ====================
window.QuickFill = {
    toggle() {
        if (!panel) init();
        if (panel.style.display === 'none' || !panel.style.display) {
            repositionPanel();
            panel.style.display = 'block';
        } else {
            panel.style.display = 'none';
            qf.recordActive = false;
            cb.recordMode = null;
            updateRecordBtns();
        }
    },
    open() {
        if (!panel) init();
        repositionPanel();
        panel.style.display = 'block';
    },
    isRecording() {
        if (!panel || panel.style.display === 'none') return false;
        if (activeTab === 'fill') return qf.recordActive;
        return !!(cb.recordMode);
    },
    recordAt(x, y, z) {
        // 填充面板的记录
        if (activeTab === 'fill' && qf.recordActive) {
            return qfAddCoord(x, y, z);
        }
        // 复制粘贴面板的记录
        if (activeTab === 'clip') {
            if (cb.recordMode === 'copy') {
                cbAddCopyCoord(x, y, z);
                return true;
            }
            if (cb.recordMode === 'paste') {
                cb.pasteCoord = { x, y, z };
                cb.recordMode = null;
                updateRecordBtns();
                refreshCbPasteInfo();
                showToast('粘贴目标已确定');
                return true;
            }
        }
        return false;
    },
    // ← 新增：给 3D 用的选区盒子
    getCopyBox() {
        if (cb.copyCoords.length < 2) return null;
        const b = boundsOf(cb.copyCoords);
        return {
            minX: b.minX, minY: b.minY, minZ: b.minZ,
            maxX: b.maxX, maxY: b.maxY, maxZ: b.maxZ
        };
    },
    
    // ---- 给多选用的复制/粘贴接口 ----
    setCopyBox(minX, minY, minZ, maxX, maxY, maxZ) {
        cb.copyCoords.length = 0;
        cb.copyCoords.push({ x: minX, y: minY, z: minZ });
        cb.copyCoords.push({ x: maxX, y: maxY, z: maxZ });
        refreshCbCopyList();
    },
    setPasteCoord(x, y, z) {
        cb.pasteCoord = { x, y, z };
        refreshCbPasteInfo();
    },
    doCopy,
    doPaste,
    
    setOverwrite(v) {
        cb.overwrite = !!v;
        if (state.settings) state.settings.pasteOverwrite = cb.overwrite;
        const el = document.getElementById('cbOverwrite');
        if (el) el.checked = cb.overwrite;
    },
    getOverwrite() {
        return cb.overwrite;
    },
    getClipboardInfo() {
        if (!cb.clipboard) return null;
        return {
            blocks: cb.clipboard.blocks.length,
            elements: cb.clipboard.elements.length
        };
    },
};

// 兼容旧代码：如果 3D 里还在调 window.Clipboard
window.Clipboard = {
    toggle() { window.QuickFill.toggle(); switchTab('clip'); },
    open()   { window.QuickFill.open(); switchTab('clip'); }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 200));
} else {
    setTimeout(init, 200);
}

})();