// 此文件包含AI辅助生成的代码。
// This file contains AI-assisted code generation.
// 这个文件实现了EDGE游戏关卡文件的JavaScript编译器。
// This file implements a JavaScript compiler for EDGE game level files.
// 它的灵感来自并基于以下参考：
// It is inspired by and based on the following references:
// 文件格式规格和结构来自：
// File format specifications and structure from:
//    - ESO.cs,ESOHeader.cs，ESOFooter.cs,ESOModels.cs (C#) - https://github.com/Mygod/EDGE/tree/master/EdgeTool/Core/LibTwoTribes
//    - CRC32.cs (C#) - https://github.com/Mygod/EDGE/tree/master/EdgeTool/Core/LibTwoTribes/Util
//    - EdgeBin.h (C header) - https://github.com/Mygod/EDGE/blob/master/EdgeTool/Core/Level/EdgeBin.h
//	  - EDGEFans mirror: https://github.com/Mygod/edgefans-archive

// ==================== CRC32 (自定义) ====================
function makeCrc32Table() {
    const table = new Uint32Array(256);
    const poly = 0xEDB88320;
    for (let i = 0; i < 256; i++) {
        let crc = i;
        for (let j = 0; j < 8; j++) {
            if (crc & 1) crc = (crc >>> 1) ^ poly;
            else crc >>>= 1;
        }
        table[i] = crc;
    }
    return table;
}
const CRC32_TABLE = makeCrc32Table();

function customCrc32(bytes) {
    let crc = 0;
    for (let b of bytes) {
        const idx = (crc ^ b) & 0xFF;
        crc = (crc >>> 8) ^ CRC32_TABLE[idx];
    }
    return crc >>> 0;
}

// 输入：XML文件名（不含扩展名），保持原大小写，直接ASCII编码、反转、CRC
function generateEsoName(xmlBaseName) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(xmlBaseName); // 大小写敏感
    // 反转
    const reversed = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
        reversed[i] = bytes[bytes.length - 1 - i];
    }
    const crc = customCrc32(reversed);
    const hex = crc.toString(16).toUpperCase().padStart(8, '0');
    return hex + '050DB82A' + '.eso';
}

// ==================== 二进制写入器 ====================
class BinWriter {
    constructor(initialSize = 65536) {
        this.buffer = new ArrayBuffer(initialSize);
        this.view = new DataView(this.buffer);
        this.offset = 0;
    }
    ensure(size) {
        if (this.offset + size > this.buffer.byteLength) {
            const newSize = Math.max(this.buffer.byteLength * 2, this.offset + size);
            const newBuf = new ArrayBuffer(newSize);
            new Uint8Array(newBuf).set(new Uint8Array(this.buffer, 0, this.offset));
            this.buffer = newBuf;
            this.view = new DataView(this.buffer);
        }
    }
    writeInt8(v) { this.ensure(1); this.view.setInt8(this.offset, v); this.offset += 1; }
    writeInt16(v) { this.ensure(2); this.view.setInt16(this.offset, v, true); this.offset += 2; }
    writeInt32(v) { this.ensure(4); this.view.setInt32(this.offset, v, true); this.offset += 4; }
    writeUint8(v) { this.ensure(1); this.view.setUint8(this.offset, v); this.offset += 1; }
    writeBool(v) { this.writeUint8(v ? 1 : 0); }
    writeBytes(arr) { this.ensure(arr.length); new Uint8Array(this.buffer, this.offset, arr.length).set(arr); this.offset += arr.length; }
    writeString(str) { const b = new TextEncoder().encode(str); this.writeInt32(b.length); this.writeBytes(b); }
    writeVector(x, y, z) { this.writeInt16(x); this.writeInt16(y); this.writeInt16(z); }
    getBuffer() { return this.buffer.slice(0, this.offset); }
}

// 主题配置
const THEME_CONFIG = {
    0: {
        nodeChild: '67228D77050DB82A',
        material: '2F2CC05D050DB82A',
        translate: { x: 53.5, y: 2.25, z: -46 },
        scale: 0.1
    },
    1: {
        nodeChild: '1DE2AE87050DB82A',
        material: '55ECE3AD050DB82A',
        translate: { x: 89.5, y: 2.25, z: -90 },
        scale: 0.1
    },
    2: {
        nodeChild: '8A7DBFAE050DB82A',
        material: 'C273F284050DB82A',
        translate: { x: 43, y: 2.25, z: -32.5 },
        scale: 0.1
    },
    3: {
        nodeChild: '451F8839050DB82A',
        material: '0D11C513050DB82A',
        translate: { x: 30, y: 2.25, z: -74.5 },
        scale: 0.1
    }
};

function parseHexHash(hashStr) {
    const bytes = new Uint8Array(8);
    const hex = hashStr.replace(/\s/g, '');
    const groups = [];
    for (let i = 0; i < hex.length; i += 8) {
        groups.push(hex.substr(i, 8));
    }
    let pos = 0;
    for (let g of groups) {
        const b = new Uint8Array(4);
        for (let j = 0; j < 4; j++) {
            b[j] = parseInt(g.substr(j * 2, 2), 16);
        }
        b.reverse();
        for (let j = 0; j < 4; j++) {
            bytes[pos + j] = b[j];
        }
        pos += 4;
    }
    return bytes;
}

function writeAssetHash(view, offset, hashStr) {
    const bytes = parseHexHash(hashStr);
    for (let i = 0; i < 8; i++) {
        view.setUint8(offset + i, bytes[i]);
    }
    return offset + 8;
}

function writeVec3(view, offset, vecStr) {
    const parts = vecStr.split(',').map(Number);
    view.setFloat32(offset, parts[0], true);
    view.setFloat32(offset + 4, parts[1], true);
    view.setFloat32(offset + 8, parts[2], true);
    return offset + 12;
}

function writeVec2(view, offset, vecStr) {
    const parts = vecStr.split(',').map(Number);
    view.setFloat32(offset, parts[0], true);
    view.setFloat32(offset + 4, parts[1], true);
    return offset + 8;
}

function generateESO(xmlString, internalFileName) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');
    const modelsNode = doc.querySelector('Models');
    if (!modelsNode) throw new Error('未找到 <Models> 根节点');

    const getAttr = (node, attr, defaultVal) => {
        const val = node.getAttribute(attr);
        return val !== null ? val : defaultVal;
    };

    const v01 = parseInt(getAttr(modelsNode, 'V01', '1'), 10);
    const v02 = parseInt(getAttr(modelsNode, 'V02', '4096'), 10);
    const nodeChild = getAttr(modelsNode, 'NodeChild', '0000000000000000');
    const nodeSibling = getAttr(modelsNode, 'NodeSibling', '0000000000000000');
    const v07 = parseInt(getAttr(modelsNode, 'V07', '0'), 10);
    const v08 = parseInt(getAttr(modelsNode, 'V08', '0'), 10);
    const v09 = parseInt(getAttr(modelsNode, 'V09', '0'), 10);
    const scaleXYZ = parseFloat(getAttr(modelsNode, 'ScaleXYZ', '1'));
    const translate = getAttr(modelsNode, 'Translate', '0,0,0');
    const rotate = getAttr(modelsNode, 'Rotate', '0,0,0');
    const scale = getAttr(modelsNode, 'Scale', '1,1,1');
    const v20 = parseFloat(getAttr(modelsNode, 'V20', '0'));
    const v21 = parseInt(getAttr(modelsNode, 'V21', '0'), 10);
    const bMin = getAttr(modelsNode, 'BoundingMin', '0,0,0');
    const bMax = getAttr(modelsNode, 'BoundingMax', '0,0,0');

    const modelNodes = doc.querySelectorAll('Models > Model');
    if (modelNodes.length === 0) throw new Error('没有找到任何 Model');

    const modelsData = [];
    for (const modelEl of modelNodes) {
        const materialAsset = getAttr(modelEl, 'MaterialAsset', '0000000000000000');
        const triangleNodes = modelEl.querySelectorAll('Triangle');
        const vertices = [];
        for (const tri of triangleNodes) {
            const vertNodes = tri.querySelectorAll('Vertex');
            if (vertNodes.length !== 3) continue;
            for (const vn of vertNodes) {
                const pos = getAttr(vn, 'Position', '0,0,0');
                const normal = getAttr(vn, 'Normal', '0,0,0');
                const color = getAttr(vn, 'Color', '');
                const texCoord = getAttr(vn, 'TexCoord', '0,0');
                const texCoord2 = getAttr(vn, 'TexCoord2', '0,0');
                vertices.push({ pos, normal, color, texCoord, texCoord2 });
            }
        }
        if (vertices.length === 0) continue;

        let flags = 0;
        const hasNormal = vertices.some(v => v.normal !== '0,0,0');
        const hasColor = vertices.some(v => v.color !== '');
        const hasTexCoord = vertices.some(v => v.texCoord !== '0,0');
        const hasTexCoord2 = vertices.some(v => v.texCoord2 !== '0,0');
        if (hasNormal) flags |= 1;
        if (hasColor) flags |= 2;
        if (hasTexCoord) flags |= 4;
        if (hasTexCoord2) flags |= 8;

        modelsData.push({
            materialAsset,
            flags,
            vertices,
            hasNormal,
            hasColor,
            hasTexCoord,
            hasTexCoord2
        });
    }
    if (modelsData.length === 0) throw new Error('没有有效的顶点数据');

    // 计算总大小
    let totalSize = 136; // Asset header
    let headerSize = 4 + 4 + 8 + 8 + 4 + 4 + 4 + 4 + 12 + 12 + 12 + 4 + 4 + 4;
    if (modelsData.length > 0) headerSize += 24;
    totalSize += headerSize;

    for (const model of modelsData) {
        const numVerts = model.vertices.length;
        totalSize += 8 + 4 + 4 + 4 + 4; // MaterialAsset + flags + numVerts + numPolys + unknown
        if (model.hasNormal) totalSize += numVerts * 12;
        if (model.hasColor) totalSize += numVerts * 4;
        if (model.hasTexCoord) totalSize += numVerts * 8;
        if (model.hasTexCoord2) totalSize += numVerts * 8;
        totalSize += numVerts * 12; // positions
        totalSize += numVerts * 2; // indices
    }
    totalSize += 20; // footer

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    let pos = 0;

    // ---- Asset Header ----
    const low = 0x00000004;
    const high = 0x00180000;
    view.setUint32(pos, low, true);
    view.setUint32(pos + 4, high, true);
    pos += 8;

    // 文件名 (64 bytes)
    const enc = new TextEncoder();
    const nameBytes = enc.encode(internalFileName || 'level');
    for (let i = 0; i < 64; i++) {
        view.setUint8(pos + i, i < nameBytes.length ? nameBytes[i] : 0);
    }
    pos += 64;

    // 命名空间 (64 bytes)
    const ns = 'models';
    const nsBytes = enc.encode(ns);
    for (let i = 0; i < 64; i++) {
        view.setUint8(pos + i, i < nsBytes.length ? nsBytes[i] : 0);
    }
    pos += 64;

    // ---- ESO Header ----
    view.setInt32(pos, v01, true); pos += 4;
    view.setInt32(pos, v02, true); pos += 4;
    pos = writeAssetHash(view, pos, nodeChild);
    pos = writeAssetHash(view, pos, nodeSibling);
    view.setInt32(pos, v07, true); pos += 4;
    view.setInt32(pos, v08, true); pos += 4;
    view.setInt32(pos, v09, true); pos += 4;
    view.setFloat32(pos, scaleXYZ, true); pos += 4;
    pos = writeVec3(view, pos, translate);
    pos = writeVec3(view, pos, rotate);
    pos = writeVec3(view, pos, scale);
    view.setFloat32(pos, v20, true); pos += 4;
    view.setInt32(pos, v21, true); pos += 4;
    view.setInt32(pos, modelsData.length, true); pos += 4;
    if (modelsData.length > 0) {
        pos = writeVec3(view, pos, bMin);
        pos = writeVec3(view, pos, bMax);
    }

    // ---- Models ----
    for (const model of modelsData) {
        const numVerts = model.vertices.length;
        const numPolys = Math.floor(numVerts / 3);
        pos = writeAssetHash(view, pos, model.materialAsset);
        view.setUint32(pos, model.flags, true); pos += 4;
        view.setInt32(pos, numVerts, true); pos += 4;
        view.setInt32(pos, numPolys, true); pos += 4;
        view.setInt32(pos, 0, true); pos += 4;

        for (const v of model.vertices) {
            pos = writeVec3(view, pos, v.pos);
        }
        if (model.hasNormal) {
            for (const v of model.vertices) {
                pos = writeVec3(view, pos, v.normal);
            }
        }
        if (model.hasColor) {
            for (const v of model.vertices) {
                let color = 0xFFFFFFFF;
                if (v.color && v.color !== '') {
                    const hex = v.color.replace('#', '');
                    if (hex.length === 6) color = 0xFF000000 + parseInt(hex, 16);
                    else if (hex.length === 8) color = parseInt(hex, 16);
                }
                view.setUint32(pos, color, true); pos += 4;
            }
        }
        if (model.hasTexCoord) {
            for (const v of model.vertices) {
                pos = writeVec2(view, pos, v.texCoord);
            }
        }
        if (model.hasTexCoord2) {
            for (const v of model.vertices) {
                pos = writeVec2(view, pos, v.texCoord2);
            }
        }
        for (let i = 0; i < numVerts; i++) {
            view.setUint16(pos, i, true); pos += 2;
        }
    }

    // ---- Footer ----
    if (modelsData.length > 0) {
        view.setUint32(pos, 1, true); pos += 4;
        view.setFloat32(pos, 0, true); pos += 4;
        view.setFloat32(pos, 0, true); pos += 4;
        view.setInt32(pos, 0, true); pos += 4;
        view.setInt32(pos, 0, true); pos += 4;
    } else {
        view.setUint32(pos, 0, true); pos += 4;
    }

    return buffer;
}

function generateESOFromPngs(xmlDoc, pngs, theme, internalFileName, layeredMode) {
    layeredMode = !!layeredMode; // 默认 false = 原模式
    const level = xmlDoc.documentElement;
    const sizeAttr = level.getAttribute('Size');
    const parts = sizeAttr.split('x').map(s => parseInt(s.trim(), 10));
    if (parts.length !== 3) throw new Error('Size 无效');
    const W = parts[0], L = parts[1], H = parts[2];

    const exitPointAttr = level.getAttribute('ExitPoint');
    let exitPoint = null;
    if (exitPointAttr) {
        const p = exitPointAttr.split(',').map(s => parseInt(s.trim(), 10));
        if (p.length === 3) exitPoint = { x: p[0], y: p[1], z: p[2] };
    }

    // 默认主题：函数参数 theme 即 ModelTheme（由调用方传入）
    const defaultTheme = (theme >= 0 && theme <= 3) ? theme : 0;
    // 主题顺序：[默认, 剩余中最亮, 次亮, 最后]
    const remaining = [0, 1, 2, 3].filter(t => t !== defaultTheme).sort((a, b) => a - b);
    const themeOrder = [defaultTheme, ...remaining];

    // 按主题收集方块（R==255 且 B>0）
    const blocksByTheme = [[], [], [], []];
    const blocks3d = Array.from({ length: W }, () =>
        Array.from({ length: L }, () => Array(H).fill(-1))
    );
    
    function isFullBlock(x, y, z) {
        if (x < 0 || x >= W || y < 0 || y >= L || z < 0 || z >= H) return false;
        return blocks3d[x][y][z] >= 1;
    }

    for (let z = 0; z < H; z++) {
        const png = pngs[z];
        if (!png) continue;
        const data = png.data;
        const w = png.width, h = png.height;
        for (let y = 0; y < h && y < L; y++) {
            for (let x = 0; x < w && x < W; x++) {
                const idx = (y * w + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                if (r !== 255) continue;
                if (b === 0) continue;
                const heightFrac = (b - 1) / 254;
                blocks3d[x][y][z] = heightFrac;
                let themeIdx;
                if (g >= 192) themeIdx = 0;
                else if (g >= 128) themeIdx = 1;
                else if (g >= 64) themeIdx = 2;
                else themeIdx = 3;
                blocksByTheme[themeIdx].push({
                    x, y, z,
                    heightFrac
                });
            }
        }
    }

    let totalBlocks = 0;
    for (const arr of blocksByTheme) totalBlocks += arr.length;
    if (totalBlocks === 0) throw new Error('没有静态方块');

    const step = 10;
    const modelsXml = [];
    let globalMinX = Infinity, globalMaxX = -Infinity;
    let globalMinY = Infinity, globalMaxY = -Infinity;
    let globalMinZ = Infinity, globalMaxZ = -Infinity;
    
    // 层高对应的纹理坐标偏移
    const LAYER_V_STEP = 0.25;       // 每层偏移 0.25（由示例文件反推）
    const LAYER_COLOR_MAX = Infinity; // 不封顶（Z>3 部分的颜色没有变化，也可以是3）
    // 原始（z=0）纹理坐标
    const V_TOP_FACE_A  = 0.75;      // 顶面 v（近端）
    const V_TOP_FACE_B  = 1.00;      // 顶面 v（远端）
    const V_SIDE_TOP    = 0.75;      // 侧面 v（顶部）
    const V_SIDE_BOTTOM = 0.875;     // 侧面 v（底部）
    const SIDE_V_SLOPE = -0.025;   // 每单位 y 对应的 v 变化
    const SIDE_V_AT_Y0 = 0.4375;   // y = 0 时的 v

    function sideV(worldY) {
        return SIDE_V_AT_Y0 + SIDE_V_SLOPE * worldY;
    }

    // 根据 z 层数返回 v 偏移（z 越高越浅）
    function layerVOffset(z) {
        if (!layeredMode) return 0;
        return -Math.min(z, LAYER_COLOR_MAX) * LAYER_V_STEP;
    }
    
    // 统一坐标系：所有 Model 共享同一个 translate/scale（由根节点决定）
    const mainCfg = THEME_CONFIG[defaultTheme];
    const mainTranslate = mainCfg.translate;
    const mainScale = mainCfg.scale;
    const baseX = -mainTranslate.x / mainScale;
    const baseY_bottom = -mainTranslate.y / mainScale;
    const baseZ = (-L - mainTranslate.z) / mainScale;
    
    /*for (let themeIdx = 0; themeIdx < 4; themeIdx++) {
        const blocks = blocksByTheme[themeIdx];
        if (blocks.length === 0) continue;
        const actualTheme = themeOrder[themeIdx];
        const cfg = THEME_CONFIG[actualTheme];
        if (!cfg) continue;

        //const { translate, scale } = cfg;
        //const baseX = -translate.x / scale;
        //const baseY_bottom = -translate.y / scale;
        //const baseZ = (-L - translate.z) / scale;

        const triangles = [];
        for (const b of blocks) {
            const { x, y, z, heightFrac } = b;
            const hasTop = isFullBlock(x, y, z + 1);
            const hasEast = isFullBlock(x + 1, y, z);
            const hasSouth = isFullBlock(x, y + 1, z);
            const isExitArea = exitPoint && (z === exitPoint.z - 1) &&
                Math.abs(x - exitPoint.x) <= 1 && Math.abs(y - exitPoint.y) <= 1;

            const x0 = baseX + x * step;
            const x1 = baseX + (x + 1) * step;
            const yFullBottom = baseY_bottom + z * step;          // 整格底部
            const yFullTop = baseY_bottom + (z + 1) * step;       // 整格顶部
            const yTop = yFullTop;
            const yBottom = yFullTop - step * heightFrac;         // B 通道缩放整格高度
            const z0 = baseZ + y * step;
            const z1 = baseZ + (y + 1) * step;

            globalMinX = Math.min(globalMinX, x0, x1);
            globalMaxX = Math.max(globalMaxX, x0, x1);
            globalMinY = Math.min(globalMinY, yFullBottom, yFullTop);
            globalMaxY = Math.max(globalMaxY, yFullBottom, yFullTop);
            globalMinZ = Math.min(globalMinZ, z0, z1);
            globalMaxZ = Math.max(globalMaxZ, z0, z1);

            const isEven = ((x + y) % 2 === 0);

            // 顶面
            if (!hasTop && !isExitArea) {
                const dV = layerVOffset(z);
                const v0 = V_TOP_FACE_A + dV;
                const v1 = V_TOP_FACE_B + dV;
                let u0, u1;
                if (isEven) { u0 = 0.51; u1 = 0.74; }
                else { u0 = 0.76; u1 = 0.99; }

                const pA = `${x0},${yTop},${z0}`;
                const pB = `${x1},${yTop},${z0}`;
                const pC = `${x0},${yTop},${z1}`;
                const pD = `${x1},${yTop},${z1}`;
                const n = '0,1,0';

                // 三角形 A-B-C（原版顺序）
                triangles.push(`    <Triangle>\n      <Vertex Position="${pA}" Normal="${n}" TexCoord="${u0},${v0}" />\n      <Vertex Position="${pB}" Normal="${n}" TexCoord="${u1},${v0}" />\n      <Vertex Position="${pC}" Normal="${n}" TexCoord="${u0},${v1}" />\n    </Triangle>`);
                // 三角形 C-B-D（原版顺序）
                triangles.push(`    <Triangle>\n      <Vertex Position="${pC}" Normal="${n}" TexCoord="${u0},${v1}" />\n      <Vertex Position="${pB}" Normal="${n}" TexCoord="${u1},${v0}" />\n      <Vertex Position="${pD}" Normal="${n}" TexCoord="${u1},${v1}" />\n    </Triangle>`);
            }

            // 东面
            if (!hasEast) {
                const vTop = layeredMode ? sideV(yTop) : V_SIDE_TOP;
                const vBot = layeredMode ? sideV(yBottom) : V_SIDE_BOTTOM;
                const p1 = `${x1},${yBottom},${z0}`;
                const p2 = `${x1},${yBottom},${z1}`;
                const p3 = `${x1},${yTop},${z1}`;
                const p4 = `${x1},${yTop},${z0}`;
                const n = '1,0,0';
                triangles.push(`    <Triangle>\n      <Vertex Position="${p1}" Normal="${n}" TexCoord="0.49,${vBot}" />\n      <Vertex Position="${p2}" Normal="${n}" TexCoord="0.26,${vBot}" />\n      <Vertex Position="${p4}" Normal="${n}" TexCoord="0.26,${vTop}" />\n    </Triangle>`);
                triangles.push(`    <Triangle>\n      <Vertex Position="${p2}" Normal="${n}" TexCoord="0.49,${vBot}" />\n      <Vertex Position="${p3}" Normal="${n}" TexCoord="0.26,${vTop}" />\n      <Vertex Position="${p4}" Normal="${n}" TexCoord="0.49,${vTop}" />\n    </Triangle>`);
            }

            // 南面
            if (!hasSouth) {
                const vTop = layeredMode ? sideV(yTop) : V_SIDE_TOP;
                const vBot = layeredMode ? sideV(yBottom) : V_SIDE_BOTTOM;

                const pA = `${x0},${yBottom},${z1}`;
                const pB = `${x0},${yTop},${z1}`;
                const pC = `${x1},${yBottom},${z1}`;
                const pD = `${x1},${yTop},${z1}`;
                const n = '0,0,1';

                // 三角形 A-B-C（原版顺序）
                triangles.push(`    <Triangle>\n      <Vertex Position="${pA}" Normal="${n}" TexCoord="0.01,${vBot}" />\n      <Vertex Position="${pB}" Normal="${n}" TexCoord="0.01,${vTop}" />\n      <Vertex Position="${pC}" Normal="${n}" TexCoord="0.24,${vBot}" />\n    </Triangle>`);
                // 三角形 B-D-C（原版顺序）
                triangles.push(`    <Triangle>\n      <Vertex Position="${pB}" Normal="${n}" TexCoord="0.01,${vTop}" />\n      <Vertex Position="${pD}" Normal="${n}" TexCoord="0.24,${vTop}" />\n      <Vertex Position="${pC}" Normal="${n}" TexCoord="0.24,${vBot}" />\n    </Triangle>`);
            }
        }

        if (triangles.length > 0) {
            modelsXml.push(`  <Model MaterialAsset="${cfg.material}">\n${triangles.join('\n')}\n  </Model>`);
        }
    }*/
    
    const MAX_TRIS_PER_MODEL = 20000;   // 60000 顶点，安全上限
    /*如果还是卡/内存爆：说明 4 个主题循环里 triangles.join() 累计字符串太大。可以把 MAX_TRIS_PER_MODEL 从 20000 降到 5000，模型数变多但每个字符串更小，缓解峰值内存。*/
    
    for (let themeIdx = 0; themeIdx < 4; themeIdx++) {
        const blocks = blocksByTheme[themeIdx];
        if (blocks.length === 0) continue;
        const actualTheme = themeOrder[themeIdx];
        const cfg = THEME_CONFIG[actualTheme];
        if (!cfg) continue;

        let triangles = [];
        const flushModel = () => {
            if (triangles.length === 0) return;
            modelsXml.push(`  <Model MaterialAsset="${cfg.material}">\n${triangles.join('\n')}\n  </Model>`);
            triangles = [];
        };

        for (const b of blocks) {
            const { x, y, z, heightFrac } = b;
            const hasTop = isFullBlock(x, y, z + 1);
            const hasEast = isFullBlock(x + 1, y, z);
            const hasSouth = isFullBlock(x, y + 1, z);
            const isExitArea = exitPoint && (z === exitPoint.z - 1) &&
                Math.abs(x - exitPoint.x) <= 1 && Math.abs(y - exitPoint.y) <= 1;

            const x0 = baseX + x * step;
            const x1 = baseX + (x + 1) * step;
            const yFullBottom = baseY_bottom + z * step;
            const yFullTop = baseY_bottom + (z + 1) * step;
            const yTop = yFullTop;
            const yBottom = yFullTop - step * heightFrac;
            const z0 = baseZ + y * step;
            const z1 = baseZ + (y + 1) * step;

            globalMinX = Math.min(globalMinX, x0, x1);
            globalMaxX = Math.max(globalMaxX, x0, x1);
            globalMinY = Math.min(globalMinY, yFullBottom, yFullTop);
            globalMaxY = Math.max(globalMaxY, yFullBottom, yFullTop);
            globalMinZ = Math.min(globalMinZ, z0, z1);
            globalMaxZ = Math.max(globalMaxZ, z0, z1);

            const isEven = ((x + y) % 2 === 0);

            // 顶面
            if (!hasTop && !isExitArea) {
                const dV = layerVOffset(z);
                const v0 = V_TOP_FACE_A + dV;
                const v1 = V_TOP_FACE_B + dV;
                let u0, u1;
                if (isEven) { u0 = 0.51; u1 = 0.74; }
                else { u0 = 0.76; u1 = 0.99; }

                const pA = `${x0},${yTop},${z0}`;
                const pB = `${x1},${yTop},${z0}`;
                const pC = `${x0},${yTop},${z1}`;
                const pD = `${x1},${yTop},${z1}`;
                const n = '0,1,0';

                triangles.push(`    <Triangle>\n      <Vertex Position="${pA}" Normal="${n}" TexCoord="${u0},${v0}" />\n      <Vertex Position="${pB}" Normal="${n}" TexCoord="${u1},${v0}" />\n      <Vertex Position="${pC}" Normal="${n}" TexCoord="${u0},${v1}" />\n    </Triangle>`);
                triangles.push(`    <Triangle>\n      <Vertex Position="${pC}" Normal="${n}" TexCoord="${u0},${v1}" />\n      <Vertex Position="${pB}" Normal="${n}" TexCoord="${u1},${v0}" />\n      <Vertex Position="${pD}" Normal="${n}" TexCoord="${u1},${v1}" />\n    </Triangle>`);
            }

            // 东面
            if (!hasEast) {
                const vTop = layeredMode ? sideV(yTop) : V_SIDE_TOP;
                const vBot = layeredMode ? sideV(yBottom) : V_SIDE_BOTTOM;
                const p1 = `${x1},${yBottom},${z0}`;
                const p2 = `${x1},${yBottom},${z1}`;
                const p3 = `${x1},${yTop},${z1}`;
                const p4 = `${x1},${yTop},${z0}`;
                const n = '1,0,0';
                triangles.push(`    <Triangle>\n      <Vertex Position="${p1}" Normal="${n}" TexCoord="0.49,${vBot}" />\n      <Vertex Position="${p2}" Normal="${n}" TexCoord="0.26,${vBot}" />\n      <Vertex Position="${p4}" Normal="${n}" TexCoord="0.26,${vTop}" />\n    </Triangle>`);
                triangles.push(`    <Triangle>\n      <Vertex Position="${p2}" Normal="${n}" TexCoord="0.49,${vBot}" />\n      <Vertex Position="${p3}" Normal="${n}" TexCoord="0.26,${vTop}" />\n      <Vertex Position="${p4}" Normal="${n}" TexCoord="0.49,${vTop}" />\n    </Triangle>`);
            }

            // 南面
            if (!hasSouth) {
                const vTop = layeredMode ? sideV(yTop) : V_SIDE_TOP;
                const vBot = layeredMode ? sideV(yBottom) : V_SIDE_BOTTOM;

                const pA = `${x0},${yBottom},${z1}`;
                const pB = `${x0},${yTop},${z1}`;
                const pC = `${x1},${yBottom},${z1}`;
                const pD = `${x1},${yTop},${z1}`;
                const n = '0,0,1';

                triangles.push(`    <Triangle>\n      <Vertex Position="${pA}" Normal="${n}" TexCoord="0.01,${vBot}" />\n      <Vertex Position="${pB}" Normal="${n}" TexCoord="0.01,${vTop}" />\n      <Vertex Position="${pC}" Normal="${n}" TexCoord="0.24,${vBot}" />\n    </Triangle>`);
                triangles.push(`    <Triangle>\n      <Vertex Position="${pB}" Normal="${n}" TexCoord="0.01,${vTop}" />\n      <Vertex Position="${pD}" Normal="${n}" TexCoord="0.24,${vTop}" />\n      <Vertex Position="${pC}" Normal="${n}" TexCoord="0.24,${vBot}" />\n    </Triangle>`);
            }

            // ★ 每处理完一个方块，检查是否达到阈值
            if (triangles.length >= MAX_TRIS_PER_MODEL) {
                flushModel();
            }
        }

        // ★ 收尾
        flushModel();
    }

    if (modelsXml.length === 0) throw new Error('没有生成有效模型');

    // 使用默认主题的 NodeChild / Translate / Scale
    //const mainCfg = THEME_CONFIG[defaultTheme];
    const bMin = `${globalMinX},${globalMinY},${globalMinZ}`;
    const bMax = `${globalMaxX},${globalMaxY},${globalMaxZ}`;
    const translateStr = `${mainCfg.translate.x},${mainCfg.translate.y},${mainCfg.translate.z}`;

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<Models V01="1" V02="4096" NodeChild="${mainCfg.nodeChild}" `;
    xml += `Translate="${translateStr}" Scale="${mainCfg.scale},${mainCfg.scale},${mainCfg.scale}" V20="1" `;
    xml += `BoundingMin="${bMin}" BoundingMax="${bMax}">\n`;
    xml += modelsXml.join('\n') + '\n';
    xml += `</Models>`;

    return generateESO(xml, internalFileName);
}

// ==================== 核心编译器 ====================
class EdgeCompiler {
    constructor(logFn) {
        this.log = logFn || (() => {});
        this.pngs = {};
        this.idMap = {};
        this.blockEvents = [];
        this.errors = 0;
        this.warnings = 0;
        this.bitOrder = 'msb';
		this.phoneMode = false; // 新增
    }
    logOk(m) { this.log('ok', m); }
    logWarn(m) { this.log('warn', m); this.warnings++; }
    logErr(m) { this.log('err', m); this.errors++; }
    logInfo(m) { this.log('info', m); }

    async loadXml(file) {
        const text = await file.text();
        const parser = new DOMParser();
        this.xml = parser.parseFromString(text, 'application/xml');
        if (this.xml.querySelector('parsererror')) throw new Error('XML 解析失败');
        this.logOk(`已加载 XML: ${file.name}`);
    }

    async loadPng(file, z) {
        try {
            const img = await createImageBitmap(file);
            const c = document.createElement('canvas');
            c.width = img.width; c.height = img.height;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0);
            this.pngs[z] = ctx.getImageData(0, 0, img.width, img.height);
            this.logOk(`已加载 PNG 层 ${z}: ${file.name} (${img.width}×${img.height})`);
        } catch (e) {
            this.logErr(`PNG 加载失败: ${file.name} — ${e.message}`);
            throw e;
        }
    }

    getAttr(el, name, def) { return el.hasAttribute(name) ? el.getAttribute(name) : def; }
    parseBool(v) {
        if (v == null) return undefined;
        v = String(v).toLowerCase();
        if (v === 'true' || v === '1') return true;
        if (v === 'false' || v === '0') return false;
        if (v === 'null') return null;
        return undefined;
    }
    parseVec(str) {
        if (!str) return null;
        const p = str.split(/[x,]/).map(s => parseInt(s.trim(), 10));
        if (p.some(n => isNaN(n))) return null;
        return { x: p[0] || 0, y: p[1] || 0, z: p[2] || 0 };
    }
    parseIdList(str) {
        if (!str) return [];
        return str.split(',').map(s => {
            s = s.trim();
            if (!s) return null;
            const m = s.match(/^([^(]+)\(([^)]+)\)$/);
            if (m) return { id: m[1].trim(), data: parseInt(m[2], 10) || 0 };
            const n = s.match(/^([^:]+):(.+)$/);
            if (n) return { id: n[1].trim(), data: parseInt(n[2], 10) || 0 };
            return { id: s, data: 0 };
        }).filter(Boolean);
    }
    regId(id, type, idx) {
        if (id) {
            if (this.idMap[id]) this.logWarn(`ID "${id}" 重复`);
            this.idMap[id] = { type, index: idx };
        }
    }
    resolveId(id, type) {
        const e = this.idMap[id];
        if (!e) { this.logErr(`未找到 ID: "${id}" (期望 ${type})`); return -1; }
        if (type && e.type !== type) this.logWarn(`ID "${id}" 类型不匹配 (期望 ${type}, 实际 ${e.type})`);
        return e.index;
    }
    addEvent(type, blockId, payload) {
        const i = this.blockEvents.length;
        this.blockEvents.push({ type, blockId, payload });
        return i;
    }
    parseBtnEffects(el) {
        const ev = [];
        const mp = this.getAttrIgnoreCase(el, 'AffectMovingPlatforms');
        if (mp) for (const it of this.parseIdList(mp)) {
            const idx = this.resolveId(it.id, 'moving_platform');
            if (idx >= 0) ev.push(this.addEvent(0, idx, it.data));
        }
        const bp = this.getAttrIgnoreCase(el, 'AffectBumpers');
        if (bp) for (const it of this.parseIdList(bp)) {
            const idx = this.resolveId(it.id, 'bumper');
            if (idx >= 0) ev.push(this.addEvent(1, idx, it.data));
        }
        const ac = this.getAttrIgnoreCase(el, 'TriggerAchievements');
        if (ac) for (const it of this.parseIdList(ac)) ev.push(this.addEvent(2, parseInt(it.id, 10), it.data));
        const bt = this.getAttrIgnoreCase(el, 'AffectButtons');
        if (bt) for (const it of this.parseIdList(bt)) {
            const idx = this.resolveId(it.id, 'button');
            if (idx >= 0) ev.push(this.addEvent(3, idx, it.data));
        }
        return ev;
    }
	
	getAttrIgnoreCase(el, name, def) {
    const attrs = el.attributes;
    for (let i = 0; i < attrs.length; i++) {
        if (attrs[i].name.toLowerCase() === name.toLowerCase()) {
            return attrs[i].value;
        }
    }
    return def;
}

    // OtherCube 语法糖预处理
	preprocessOtherCubes(L) {
		const ocs = Array.from(L.children).filter(e => e.nodeName.toLowerCase() === 'othercube');
		const toInsert = [];
		for (const el of ocs) {
			// 尝试获取 Radius（不区分大小写）
			const radiusStr = this.getAttrIgnoreCase(el, 'Radius');
			if (radiusStr) {
				const parts = radiusStr.split(',').map(s => parseInt(s.trim(), 10));
				if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
					const [rx, ry] = parts;
					if (rx > 0 || ry > 0) {
						const ptStr = this.getAttrIgnoreCase(el, 'PositionTrigger');
						if (!ptStr) {
							this.logErr('OtherCube 缺少 PositionTrigger');
							continue;
						}
						const pt = this.parseVec(ptStr);
						if (!pt) {
							this.logErr('OtherCube PositionTrigger 格式错误');
							continue;
						}
						// 展开：遍历所有偏移
						for (let dx = -rx; dx <= rx; dx++) {
							for (let dy = -ry; dy <= ry; dy++) {
								// 原始元素保留（dx=0,dy=0）并移除 Radius
								if (dx === 0 && dy === 0) {
									el.removeAttribute('Radius');
									continue;
								}
								// 克隆元素
								const newEl = this.xml.createElement('OtherCube');
								// 复制除 Radius 和 PositionTrigger 外的所有属性
								for (const attr of el.attributes) {
									const name = attr.name;
									if (name.toLowerCase() !== 'radius' && name.toLowerCase() !== 'positiontrigger') {
										newEl.setAttribute(name, attr.value);
									}
								}
								newEl.setAttribute('PositionTrigger', `${pt.x + dx},${pt.y + dy},${pt.z}`);
								// 复制所有子节点（包括 keyEvents 等）
								for (const child of el.children) {
									const clone = child.cloneNode(true);
									newEl.appendChild(clone);
								}
								toInsert.push(newEl);
							}
						}
					}
				}
			}
		}
		// 将新元素添加到 L
		for (const newEl of toInsert) {
			L.appendChild(newEl);
		}
	}

    // RelatedTo 递归解析
    /*resolveRelatedTo(mp, mpData, resolving) {
        if (mp._resolved) return mp._resolvedWaypoints;
        if (resolving.has(mp)) {
            this.logErr(`循环引用检测到: ${this.getAttr(mp.el, 'ID') || '(匿名)'}`);
            mp._resolvedWaypoints = [];
            mp._resolved = true;
            return mp._resolvedWaypoints;
        }
        const related = this.getAttr(mp.el, 'RelatedTo');
        if (!related) {
            mp._resolvedWaypoints = mp.waypoints.slice();
            mp._resolved = true;
            return mp._resolvedWaypoints;
        }
        const target = mpData.find(m => this.getAttr(m.el, 'ID') === related);
        if (!target) {
            this.logErr(`RelatedTo 目标未找到: "${related}"`);
            mp._resolvedWaypoints = [];
            mp._resolved = true;
            return mp._resolvedWaypoints;
        }
        resolving.add(mp);
        const targetWps = this.resolveRelatedTo(target, mpData, resolving);
        resolving.delete(mp);
        const off = mp.offset || { x:0, y:0, z:0 };
        mp._resolvedWaypoints = targetWps.map(w => ({
            pos: { x: w.pos.x + off.x, y: w.pos.y + off.y, z: w.pos.z + off.z },
            tt: w.tt,
            pt: w.pt
        }));
        mp._resolved = true;
        this.logInfo(`MP ${this.getAttr(mp.el, 'ID') || '?'} RelatedTo="${related}" → 复制 ${targetWps.length} 个路点 + 偏移`);
        return mp._resolvedWaypoints;
    }*/

	// RelatedTo 递归解析（修改版）
	resolveRelatedTo(mp, mpData, resolving) {
		if (mp._resolved) return mp._resolvedWaypoints;
		if (resolving.has(mp)) {
			this.logErr(`循环引用检测到: ${this.getAttrIgnoreCase(mp.el, 'ID') || '(匿名)'}`);
			mp._resolvedWaypoints = [];
			mp._resolved = true;
			return mp._resolvedWaypoints;
		}
		const related = this.getAttrIgnoreCase(mp.el, 'RelatedTo');
		if (!related) {
			// 没有 RelatedTo，直接返回自己的路点
			mp._resolvedWaypoints = mp.waypoints.slice();
			mp._resolved = true;
			return mp._resolvedWaypoints;
		}
		const target = mpData.find(m => this.getAttrIgnoreCase(m.el, 'ID') === related);
		if (!target) {
			this.logErr(`RelatedTo 目标未找到: "${related}"`);
			mp._resolvedWaypoints = [];
			mp._resolved = true;
			return mp._resolvedWaypoints;
		}

		// ---- 新增：复制目标平台的 AutoStart 和 LoopStartIndex ----
		const targetAutoStart = this.getAttrIgnoreCase(target.el, 'AutoStart', 'True');
		const targetLoopStart = this.getAttrIgnoreCase(target.el, 'LoopStartIndex', '1');
		mp.el.setAttribute('AutoStart', targetAutoStart);
		mp.el.setAttribute('LoopStartIndex', targetLoopStart);

		resolving.add(mp);
		// 获取目标平台解析后的路点（递归，会处理目标自身的 RelatedTo）
		const targetWps = this.resolveRelatedTo(target, mpData, resolving);
		resolving.delete(mp);

		const off = mp.offset || { x:0, y:0, z:0 };
		// 将目标路点加上偏移，并插入到当前平台的路点之前
		const currentWps = mp.waypoints.slice(); // 复制当前路点
		const newWps = targetWps.map(w => ({
			pos: { x: w.pos.x + off.x, y: w.pos.y + off.y, z: w.pos.z + off.z },
			tt: w.tt,
			pt: w.pt
		}));
		// 合并：目标路点在前，当前路点在后
		mp._resolvedWaypoints = newWps.concat(currentWps);
		mp._resolved = true;
		this.logInfo(`MP ${this.getAttrIgnoreCase(mp.el, 'ID') || '?'} RelatedTo="${related}" → 插入 ${targetWps.length} 个路点（含偏移）到开头`);
		return mp._resolvedWaypoints;
	}
    
    // Trace部分开始
    // 从两个坐标生成"曼哈顿路径"：依次 x+1、y+1、z+1，直到到达终点
    buildManhattanPath(start, end) {
        const path = [{ x: start.x, y: start.y, z: start.z }];
        let cur = { x: start.x, y: start.y, z: start.z };
        let guard = 0;
        while ((cur.x !== end.x || cur.y !== end.y || cur.z !== end.z) && guard++ < 10000) {
            if (cur.x !== end.x) cur = { x: cur.x + Math.sign(end.x - cur.x), y: cur.y, z: cur.z };
            else if (cur.y !== end.y) cur = { x: cur.x, y: cur.y + Math.sign(end.y - cur.y), z: cur.z };
            else if (cur.z !== end.z) cur = { x: cur.x, y: cur.y, z: cur.z + Math.sign(end.z - cur.z) };
            path.push({ ...cur });
        }
        return path;
    }

    // 收集所有被 button / buttonsequence 通过 AffectMovingPlatforms 引用的 mp ID
    collectReferencedMpIds(rawBtns) {
        const set = new Set();
        const addFrom = (el) => {
            const attr = this.getAttrIgnoreCase(el, 'AffectMovingPlatforms', '');
            if (!attr) return;
            for (const item of this.parseIdList(attr)) set.add(item.id);
        };
        for (const b of rawBtns) {
            addFrom(b.el);
            if (b.seq) addFrom(b.seq);
        }
        return set;
    }
    
    // 计算 path 中 a 到 b 的曼哈顿长度
    pathLenBetween(path, a, b) {
        let len = 0;
        for (let i = a; i < b; i++) {
            len += Math.abs(path[i+1].x - path[i].x)
                 + Math.abs(path[i+1].y - path[i].y)
                 + Math.abs(path[i+1].z - path[i].z);
        }
        return len;
    }
    
    // 计算 wps 中从 a 到 b 的总时间（含每段的 travel + pause）
    pathTimeBetween(wps, a, b) {
        let t = 0;
        for (let i = a + 1; i <= b; i++) {
            t += (wps[i].tt || 0) + (wps[i].pt || 0);
        }
        return t;
    }
    
    // 建立主方块完整路径：每格一个坐标，记录到达时间
    buildFullPath(wps) {
        const path = [{ ...wps[0].pos }];
        const times = [0];
        const wpIndices = [0];

        let departTime = wps[0].pt || 0;

        for (let i = 1; i < wps.length; i++) {
            const segPath = this.buildManhattanPath(wps[i - 1].pos, wps[i].pos);
            const D = segPath.length - 1;
            const tt = wps[i].tt || 0;

            if (D <= 0) {
                wpIndices.push(path.length - 1);
                departTime += tt + (wps[i].pt || 0);
                continue;
            }

            for (let j = 1; j <= D; j++) {
                const t = departTime + (j * tt) / D;
                path.push({ ...segPath[j] });
                times.push(t);
            }
            wpIndices.push(path.length - 1);
            departTime += tt + (wps[i].pt || 0);
        }

        return { path, times, wpIndices };
    }

    // 判断 wps 从 lsi-1 到末尾是否回文
    isSymmetric(wps, lsi) {
        if (lsi <= 0 || lsi > wps.length) return false;
        const sub = wps.slice(lsi - 1);
        if (sub.length < 3) return false;
        for (let i = 0; i < Math.floor(sub.length / 2); i++) {
            const a = sub[i].pos;
            const b = sub[sub.length - 1 - i].pos;
            if (a.x !== b.x || a.y !== b.y || a.z !== b.z) return false;
        }
        return true;
    }

    // 对称结构的顶点索引
    findApexIdx(wps, lsi) {
        const sub = wps.slice(lsi - 1);
        const apexInSub = Math.floor((sub.length - 1) / 2);
        return (lsi - 1) + apexInSub;
    }

    // 找坐标 p 在主方块中"最后一次出现"的路点 pt
    getLastPt(wps, pos) {
        for (let j = wps.length - 1; j >= 0; j--) {
            const q = wps[j].pos;
            if (q.x === pos.x && q.y === pos.y && q.z === pos.z) return wps[j].pt || 0;
        }
        return 0;
    }

    // 找坐标 p 在主方块中"最后一次出现"的路点索引
    getLastWpIdx(wps, pos) {
        for (let j = wps.length - 1; j >= 0; j--) {
            const q = wps[j].pos;
            if (q.x === pos.x && q.y === pos.y && q.z === pos.z) return j;
        }
        return -1;
    }
    
    buildTrails(mp) {
        const wps = mp.waypoints || [];
        if (wps.length < 2) return [];

        const origId = this.getAttrIgnoreCase(mp.el, 'ID') || 'M';
        const fullBlock = this.getAttrIgnoreCase(mp.el, 'FullBlock', 'True');
        const parentAutoStart = this.getAttrIgnoreCase(mp.el, 'AutoStart', 'True');
        const lsiAttr = this.getAttrIgnoreCase(mp.el, 'LoopStartIndex', '1');
        let parentLsi = parseInt(lsiAttr, 10);
        if (isNaN(parentLsi)) parentLsi = 1;

        const { path, times, wpIndices } = this.buildFullPath(wps);
        const symmetric = this.isSymmetric(wps, parentLsi);

        // ---- 终点 ----
        const epindex = parseInt(this.getAttrIgnoreCase(mp.el, 'EPIndex', '0'), 10) || 0;
        let endWpIdx;
        if (epindex > 0) endWpIdx = Math.min(epindex, wps.length - 1);
        else if (parentLsi <= 0) endWpIdx = wps.length - 1;
        else if (symmetric) endWpIdx = this.findApexIdx(wps, parentLsi);
        else endWpIdx = wps.length - 1;
        const endPathIdx = wpIndices[endWpIdx];

        // ---- 模式：2/3 路点或对称 → extend；lsi<=0 → noloop；其余 → cycle ----
        let mode = (this.getAttrIgnoreCase(mp.el, 'TraceMode', '') || '').toLowerCase();
        if (mode !== 'extend' && mode !== 'cycle' && mode !== 'noloop') {
            if (parentLsi <= 0)             mode = 'noloop';
            else if (wps.length <= 3)       mode = 'extend';   // 短路径（≤3路点）默认 extend
            else if (symmetric)             mode = 'extend';   // 对称结构 extend
            else                            mode = 'cycle';    // 非对称长路径 cycle
        }

        const endPause = wps[endWpIdx].pt || 0;
        const tlAttr = this.getAttrIgnoreCase(mp.el, 'TraceLength', '');
        const tracelength = (tlAttr !== '' && !isNaN(parseInt(tlAttr, 10))) ? parseInt(tlAttr, 10) : -1;

        const trails = [];
        for (let j = 0; j < endPathIdx; j++) {
            const resolvedWps = this.buildOneTrailAt({
                wps, wpIndices, path, times,
                j, endWpIdx, endPathIdx,
                mode, lsi: parentLsi, symmetric, endPause, tracelength
            });
            if (!resolvedWps || resolvedWps.length === 0) continue;

            let trailLsi = parentLsi;
            if (resolvedWps.length <= trailLsi) trailLsi = 0;
            trails.push(this.makeTrailMp(origId, j, resolvedWps, parentAutoStart, String(trailLsi), fullBlock));
        }
        return trails;
    }

    // 生成位于 path[j] 处的尾迹方块
    // 继承规则：
    // - noloop（lsi<=0）: 继承 wps[0..endWpIdx]，中间插 path[j]，不补回程
    // - extend（lsi>0 且短或对称）: 继承 wps[0..n]，中间插 path[j]，回程 wps[n]..wps[0]
    // - cycle（lsi>0 且非对称）: 继承 wps[0..endWpIdx]，中间插 path[j]，不补回程
    buildOneTrailAt(opts) {
        const {
            wps, wpIndices, path, times,
            j, endWpIdx, endPathIdx,
            mode, lsi, symmetric, endPause, tracelength
        } = opts;

        if (j === 0) {
            return [{ pos: { ...wps[0].pos }, tt: 0, pt: wps[0].pt || 0 }];
        }

        // 定位 n：j 落在 (wpIndices[n], wpIndices[n+1]]
        let n = -1;
        for (let k = 0; k < wps.length - 1; k++) {
            if (j > wpIndices[k] && j <= wpIndices[k + 1]) { n = k; break; }
        }
        if (n < 0) return [];

        // 判断 j 是否正好落在主路点上
        let onWpIdx = -1;
        for (let k = 0; k <= endWpIdx; k++) {
            if (j === wpIndices[k]) { onWpIdx = k; break; }
        }

        // 计算从 wps[n] 到停留点的移动时间
        let ttStop = 0;
        if (onWpIdx < 0) {
            const depart = times[wpIndices[n]] + (wps[n].pt || 0);
            ttStop = Math.max(0, Math.round(times[j] - depart));
        }

        // 计算停留点的 PauseTime
        let ptStop = 0;
        if (mode === 'noloop') {
            ptStop = Math.max(0, Math.round(times[endPathIdx] + endPause - times[j]));
        } else if (mode === 'extend') {
            ptStop = Math.max(0, Math.round((times[endPathIdx] - times[j]) * 2 + endPause));
        } else { // cycle
            let aheadTime;
            if (tracelength < 0) {
                aheadTime = times[endPathIdx];
            } else if (j + tracelength < times.length) {
                aheadTime = times[j + tracelength];
            } else {
                const segLen = wpIndices[n + 1] - wpIndices[n];
                const segTT = wps[n + 1].tt || 0;
                const speed = segLen > 0 ? segTT / segLen : 0;
                aheadTime = times[j] + tracelength * speed;
            }
            ptStop = Math.max(0, Math.round(aheadTime - times[j]));
        }

        // ---- 组装 ----
        const out = [];

        // 添加 wps[0] 到 wps[n]
        for (let k = 0; k <= n; k++) {
            if (k === 0) {
                let tt0 = 0;
                if ((mode === 'extend' || mode === 'cycle') && n === 0) {
                    tt0 = ttStop; // n=0 时回程时间即为 ttStop
                } else {
                    tt0 = wps[0].tt || 0;
                }
                out.push({ pos: { ...wps[0].pos }, tt: tt0, pt: wps[0].pt || 0 });
            } else {
                out.push({ pos: { ...wps[k].pos }, tt: wps[k].tt || 0, pt: wps[k].pt || 0 });
            }
        }

        // 添加停留点
        if (onWpIdx < 0) {
            out.push({ pos: { ...path[j] }, tt: ttStop, pt: ptStop });
        } else {
            let found = false;
            for (let item of out) {
                if (item.pos.x === wps[onWpIdx].pos.x && item.pos.y === wps[onWpIdx].pos.y && item.pos.z === wps[onWpIdx].pos.z) {
                    item.pt = ptStop;
                    found = true;
                    break;
                }
            }
            if (!found) {
                out.push({ pos: { ...wps[onWpIdx].pos }, tt: wps[onWpIdx].tt || 0, pt: ptStop });
            }
        }

        // ---- extend 补回程（仅当 n > 0 时） ----
        if (mode === 'extend' && n > 0) {
            for (let k = n; k >= 1; k--) {
                out.push({
                    pos: { ...wps[k].pos },
                    tt: wps[k].tt || 0,
                    pt: this.getLastPt(wps, wps[k].pos)
                });
            }
            out.push({
                pos: { ...wps[0].pos },
                tt: wps[1].tt || 0,
                pt: this.getLastPt(wps, wps[0].pos)
            });
        }

        return out;
    }
    // 追加尾迹方块的"后半段"
    appendTail(out, opts) {
        const {
            wps, wpIndices, times, path,
            j, n, mode, lsi, time2, tracelength,
            isOnWp, ttStop, ptStop
        } = opts;

        if (mode === 'extend') {
            // 对称回程：从 wps[n-1] 倒序到 wps[0]
            for (let k = n - 1; k >= 0; k--) {
                out.push({
                    pos: { ...wps[k].pos },
                    tt: wps[k + 1].tt || 0,
                    pt: this.getLastPt(wps, wps[k].pos)
                });
            }
        } else {
            // cycle：继承 n+1..endWpIdx
            // 下一个路点
            if (n + 1 < wps.length) {
                const nextWp = wps[n + 1];
                const nextTime = times[wpIndices[n + 1]];
                // 移动时间 = nextTime - times[j] - (停留 pt)
                const pauseHere = isOnWp ? 0 : (ptStop || 0);
                const ttNext = Math.max(0, Math.round(nextTime - times[j] - pauseHere));
                out.push({
                    pos: { ...nextWp.pos },
                    tt: ttNext,
                    pt: nextWp.pt || 0
                });
                // 从 n+2 到末尾
                for (let k = n + 2; k < wps.length; k++) {
                    out.push({
                        pos: { ...wps[k].pos },
                        tt: wps[k].tt || 0,
                        pt: wps[k].pt || 0
                    });
                }
            }
        }
        return out;
    }
    
    // 主入口
    applyTraceSugar(L, mpData, rawBtns) {
        if (!mpData || mpData.length === 0) return;
        const referenced = this.collectReferencedMpIds(rawBtns);

        const originalCount = mpData.length;
        for (let i = 0; i < originalCount; i++) {
            const mp = mpData[i];
            const el = mp.el;

            const traceAttr = this.getAttrIgnoreCase(el, 'Trace', 'false');
            if (String(traceAttr).toLowerCase() !== 'true') continue;

            const mpId = this.getAttrIgnoreCase(el, 'ID');
            const autoStart = this.parseBool(this.getAttrIgnoreCase(el, 'AutoStart', 'True'));
            const isReferenced = referenced.has(mpId);
            if (!autoStart && !isReferenced) continue;

            const trails = this.buildTraceByLength(mp);
            if (!trails || trails.length === 0) continue;

            for (const t of trails) {
                const newIdx = mpData.length;
                mpData.push(t);
                const tId = this.getAttrIgnoreCase(t.el, 'ID');
                if (tId) this.regId(tId, 'moving_platform', newIdx);
            }
            if (isReferenced) this.addButtonRefsToTrails(rawBtns, mpId, trails);
        }
    }

    // ===== 生成单个尾迹方块 =====
    makeTrailMp(origId, idx, resolvedWps, parentAutoStart, parentLsi, fullBlock) {
        const trailEl = this.xml.createElement('MovingPlatform');
        const trailId = origId + '_T' + idx;
        trailEl.setAttribute('ID', trailId);
        trailEl.setAttribute('AutoStart', parentAutoStart);
        trailEl.setAttribute('LoopStartIndex', parentLsi);
        trailEl.setAttribute('FullBlock', fullBlock);

        for (const w of resolvedWps) {
            const wpEl = this.xml.createElement('Waypoint');
            wpEl.setAttribute('Position', `${w.pos.x},${w.pos.y},${w.pos.z}`);
            wpEl.setAttribute('TravelTime', String(w.tt));
            wpEl.setAttribute('PauseTime', String(w.pt));
            trailEl.appendChild(wpEl);
        }

        return {
            el: trailEl,
            waypoints: resolvedWps,
            offset: { x: 0, y: 0, z: 0 },
            relatedTo: '',
            _resolved: true,
            _resolvedWaypoints: resolvedWps
        };
    }


    // ===== 主入口 =====
    buildTraceByLength(mp) {
        return this.buildTrails(mp);
    }

    // 给引用了主方块的按钮/序列添加对所有尾迹方块的引用
    addButtonRefsToTrails(rawBtns, mpId, trails) {
        if (trails.length === 0) return;
        const trailIds = trails.map(t => this.getAttrIgnoreCase(t.el, 'ID')).filter(Boolean);
        if (trailIds.length === 0) return;

        const augmentAffectAttr = (el) => {
            const attr = this.getAttrIgnoreCase(el, 'AffectMovingPlatforms', '');
            if (!attr) return;
            const items = this.parseIdList(attr);
            const hasMp = items.some(x => x.id === mpId);
            if (!hasMp) return;
            // 保留原始数据，添加 trail ids
            const existing = new Set(items.map(x => x.id));
            const newItems = items.slice();
            for (const t of trailIds) {
                if (!existing.has(t)) newItems.push({ id: t, data: 0 });
            }
            const newVal = newItems.map(it => it.data === 0 ? it.id : `${it.id}(${it.data})`).join(',');
            el.setAttribute('AffectMovingPlatforms', newVal);
        };

        for (const b of rawBtns) {
            augmentAffectAttr(b.el);
            if (b.seq) augmentAffectAttr(b.seq);
        }
    }
    // Trace部分结束

	compile() {
		this.idMap = {};
		this.blockEvents = [];
		this.errors = 0;
		this.warnings = 0;
		const L = this.xml.documentElement;
		if (L.nodeName.toLowerCase() !== 'level') throw new Error('根元素必须是 <Level>');

		this.preprocessOtherCubes(L);

		const levelId = parseInt(this.getAttrIgnoreCase(L, 'ID'), 10);
		if (isNaN(levelId)) throw new Error('缺少有效 ID');
		const name = this.getAttrIgnoreCase(L, 'Name', '');
		const tt = (this.getAttrIgnoreCase(L, 'TimeThresholds', '1,2,3,4,5')).split(',').map(s => parseInt(s.trim(), 10));
		if (tt.length !== 5) throw new Error('TimeThresholds 需要 5 个数值');
		if (this.phoneMode) {
			for (let i = 0; i < tt.length; i++) {
				tt[i] = tt[i] * 100;
			}
		}
		const size = this.parseVec(this.getAttrIgnoreCase(L, 'Size')?.replace(/x/g, ','));
		if (!size) throw new Error('缺少 Size 属性 (格式: WxLxH)');
		const [sx, sy, sz] = [size.x, size.y, size.z];
		const spawn = this.parseVec(this.getAttrIgnoreCase(L, 'SpawnPoint'));
		if (!spawn) throw new Error('缺少 SpawnPoint');
		const exit = this.parseVec(this.getAttrIgnoreCase(L, 'ExitPoint'));
		if (!exit) throw new Error('缺少 ExitPoint');

		const theme = parseInt(this.getAttrIgnoreCase(L, 'Theme', '0'), 10);
		const musicJ2me = parseInt(this.getAttrIgnoreCase(L, 'MusicJava', '0'), 10);
		const music = parseInt(this.getAttrIgnoreCase(L, 'Music', '6'), 10);
		const zoom = parseInt(this.getAttrIgnoreCase(L, 'Zoom', '-1'), 10);
		let zVal = 0, zIsAng = false;
		if (zoom < 0) {
			const ang = this.getAttrIgnoreCase(L, 'Angle');
			if (ang != null && ang !== '') { zVal = parseInt(ang, 10); zIsAng = true; }
			else { zVal = parseInt(this.getAttrIgnoreCase(L, 'FieldOfView', '22'), 10); zIsAng = false; }
		}

		this.logInfo(`尺寸: ${sx}×${sy}×${sz} | 名称: "${name}" | ID: ${levelId}`);

		// ---- 收集 MovingPlatform ----
		const mpData = [];
		const mpEls = Array.from(L.children).filter(e => e.nodeName.toLowerCase() === 'movingplatform');
		for (const el of mpEls) {
			const id = this.getAttrIgnoreCase(el, 'ID');
			this.regId(id, 'moving_platform', mpData.length);
			const wps = Array.from(el.children).filter(c => c.nodeName.toLowerCase() === 'waypoint').map(w => {
				const p = this.parseVec(this.getAttrIgnoreCase(w, 'Position'));
				return { pos: p || {x:0,y:0,z:0}, tt: parseInt(this.getAttrIgnoreCase(w, 'TravelTime','0'),10), pt: parseInt(this.getAttrIgnoreCase(w, 'PauseTime','0'),10) };
			});
			const off = this.parseVec(this.getAttrIgnoreCase(el, 'Offset')) || {x:0,y:0,z:0};
			mpData.push({ el, waypoints: wps, offset: off, relatedTo: this.getAttrIgnoreCase(el, 'RelatedTo'), _resolved: false, _resolvedWaypoints: [] });
		}
		const resolving = new Set();
		for (const mp of mpData) this.resolveRelatedTo(mp, mpData, resolving);
		for (const mp of mpData) if (!mp._resolved) { this.logErr(`MP ${this.getAttrIgnoreCase(mp.el, 'ID')||'?'} 解析失败`); mp._resolvedWaypoints = mp.waypoints.slice(); }

		// ---- 为有 RelatedTo 但没有 ID 的移动平台生成 ID ----
		const usedIds = new Set();
		mpData.forEach(mp => {
			const id = this.getAttrIgnoreCase(mp.el, 'ID');
			if (id) usedIds.add(id);
		});
		let nzpvlCounter = 1;
		mpData.forEach((mp, idx) => {                       // ★ 加 idx
			const hasRelated = this.getAttrIgnoreCase(mp.el, 'RelatedTo') != null && this.getAttrIgnoreCase(mp.el, 'RelatedTo') !== '';
			if (hasRelated && !this.getAttrIgnoreCase(mp.el, 'ID')) {
				let newId;
				let attempts = 0;
				const useCrypto = typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function';
				if (useCrypto) {
					do {
						const bytes = new Uint8Array(3);
						crypto.getRandomValues(bytes);
						newId = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
						attempts++;
					} while (usedIds.has(newId) && attempts < 100);
				} else {
					do {
						newId = 'nzpvl' + nzpvlCounter;
						nzpvlCounter++;
						attempts++;
					} while (usedIds.has(newId) && attempts < 1000);
				}
				if (!usedIds.has(newId)) {
					mp.el.setAttribute('ID', newId);
					usedIds.add(newId);
					this.regId(newId, 'moving_platform', idx);   // ★ 关键：注册到 idMap
					this.logInfo(`为 RelatedTo 移动平台生成 ID: ${newId}`);
				} else {
					this.logErr(`无法为 RelatedTo 移动平台生成唯一 ID`);
				}
			}
		});

		// ---- 按钮收集 ----
		const rawBtns = [];
		for (const el of Array.from(L.children).filter(e => e.nodeName.toLowerCase() === 'button')) {
			rawBtns.push({ el, type: 'standalone' });
		}
		for (const seq of Array.from(L.children).filter(e => e.nodeName.toLowerCase() === 'buttonsequence')) {
			const ch = Array.from(seq.children).filter(e => e.nodeName.toLowerCase() === 'button');
			if (!ch.length) { this.logWarn('空的 ButtonSequence'); continue; }
			let pIdx = -1;
			for (let i = 0; i < ch.length; i++) {
				const idx = rawBtns.length;
				if (i === 0) { rawBtns.push({ el: ch[i], type: 'seq_parent', seq }); pIdx = idx; }
				else rawBtns.push({ el: ch[i], type: 'seq_child', pIdx, seq });
			}
		}
		for (let i = 0; i < rawBtns.length; i++) {
			this.regId(this.getAttrIgnoreCase(rawBtns[i].el, 'ID'), 'button', i);
		}
        
        // ---- Trace 语法糖预处理 ----
		this.applyTraceSugar(L, mpData, rawBtns);

		// ---- 构建反向映射：目标 ID -> 依赖它的平台 ID 列表 ----
		const relatedToTargetMap = {};
		mpData.forEach(mp => {
			const id = this.getAttrIgnoreCase(mp.el, 'ID');
			const related = this.getAttrIgnoreCase(mp.el, 'RelatedTo');
			if (id && related) {
				if (!relatedToTargetMap[related]) {
					relatedToTargetMap[related] = [];
				}
				if (!relatedToTargetMap[related].includes(id)) {
					relatedToTargetMap[related].push(id);
				}
			}
		});

		if (Object.keys(relatedToTargetMap).length > 0) {
			const allButtons = [];
			for (const b of rawBtns) {
				allButtons.push(b.el);
			}
			for (const seq of L.children) {
				if (seq.nodeName.toLowerCase() === 'buttonsequence') {
					allButtons.push(seq);
				}
			}

			for (const el of allButtons) {
				const attrName = 'AffectMovingPlatforms';
				const val = this.getAttrIgnoreCase(el, attrName, '');
				if (!val) continue;

				const items = this.parseIdList(val);
				let changed = false;
				const newItems = items.slice();

				for (const item of items) {
					const refId = item.id;
					if (relatedToTargetMap[refId]) {
						for (const depId of relatedToTargetMap[refId]) {
							const exists = newItems.some(it => it.id === depId);
							if (!exists) {
								newItems.push({ id: depId, data: item.data });
								changed = true;
							}
						}
					}
				}

				if (changed) {
					const newVal = newItems.map(it => `${it.id}(${it.data})`).join(',');
					el.setAttribute(attrName, newVal);
					this.logInfo(`更新 ${el.tagName} 的 AffectMovingPlatforms: ${newVal}`);
				}
			}
		}

		// ---- Bumpers ----
		const bps = [];
		for (const el of Array.from(L.children).filter(e => e.nodeName.toLowerCase() === 'bumper')) {
			this.regId(this.getAttrIgnoreCase(el, 'ID'), 'bumper', bps.length);
			bps.push({ el });
		}

		// ---- 其他元素 ----
		const fps = [], cps = [], cts = [], prs = [], ocs = [];
		const rzs = [];
		for (const el of Array.from(L.children)) {
			const tag = el.nodeName.toLowerCase();
			if (tag === 'fallingplatform') fps.push({ el });
			else if (tag === 'checkpoint') cps.push({ el });
			else if (tag === 'cameratrigger') cts.push({ el });
			else if (tag === 'prism') prs.push({ el });
			else if (tag === 'othercube') ocs.push({ el, kind: 'normal' });
			else if (tag === 'darkcube') ocs.push({ el, kind: 'dark' });
			else if (tag === 'resizergrow' || tag === 'resizershrink') {
				const p = this.parseVec(this.getAttrIgnoreCase(el, 'Position'));
				if (!p) { this.logErr('Resizer 缺少 Position'); continue; }
				const r = this.parseVec(this.getAttrIgnoreCase(el, 'Radius', '0,0')) || {x:0,y:0,z:0};
				const dir = tag === 'resizergrow' ? 1 : 0;
				const vis = this.parseBool(this.getAttrIgnoreCase(el, 'Visible', 'True')) !== false;
				let count = 0;
				for (let dx = -r.x; dx <= r.x; dx++) {
					for (let dy = -r.y; dy <= r.y; dy++) {
						rzs.push({ x: p.x + dx, y: p.y + dy, z: p.z, dir, visible: vis });
						count++;
					}
				}
				if (r.x > 0 || r.y > 0) {
					this.logInfo(`Resizer ${p.x},${p.y},${p.z} Radius=${r.x},${r.y} → 展开 ${count} 个`);
				}
			}
		}

		this.logInfo(`元素统计: MP=${mpData.length} BP=${bps.length} FP=${fps.length} CP=${cps.length} CT=${cts.length} PR=${prs.length} BT=${rawBtns.length} OC=${ocs.length} RZ=${rzs.length}`);

		const W = new BinWriter();

		// ---- Header ----
		W.writeInt32(levelId);
		W.writeString(name);
		for (let i = 0; i < 5; i++) W.writeInt16(tt[i] || 0);
		W.writeInt16(prs.length);

		// ---- Level Body ----
		W.writeInt8(sz);
		W.writeInt16(sx); W.writeInt16(sy);
		const u1 = sx + sy, u2 = sx + sy + 2*sz;
		const u3 = Math.floor((u1 + 9) / 10), u4 = Math.floor((u2 + 9) / 10);
		W.writeInt16(u1); W.writeInt16(u2); W.writeInt16(u3); W.writeInt16(u4);
		W.writeInt8(10);
		W.writeInt16(sy - 1); W.writeInt16(0);
		W.writeBytes(new Uint8Array(Math.floor((u3 * u4 + 7) / 8)));

		// ---- Collision map (MSB) ----
        const bytesPerLayer = Math.floor((sx * sy + 7) / 8);
        const cml = sz * bytesPerLayer;
        const cmap = new Uint8Array(cml);
        const autoMovingPlatforms = []; // 由 R 通道自动生成的移动平台

        for (let z = 0; z < sz; z++) {
            const png = this.pngs[z];
            if (!png) { this.logWarn(`缺少第 ${z} 层 PNG，该层碰撞地图为空`); continue; }
            if (png.width !== sx || png.height !== sy) this.logWarn(`第 ${z} 层 PNG 尺寸不匹配，将裁剪/填充`);
            const off = z * bytesPerLayer;
            const w = Math.min(png.width, sx);
            const h = Math.min(png.height, sy);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const pixIdx = (y * png.width + x) * 4;
                    const r = png.data[pixIdx];
                    // R >= 128 才写碰撞
                    if (r >= 128) {
                        const idx = y * sx + x;
                        const bi = off + Math.floor(idx / 8);
                        const bit = idx % 8;
                        if (bi < cmap.length) {
                            cmap[bi] |= (1 << (7 - bit));
                        }
                        // R < 255 → 自动移动平台
                        if (r < 255) {
                            let autoStart, fullBlock, loopStartIndex;
                            if (r >= 224) {          // 224-254 发光移动
                                autoStart = true;  fullBlock = true;  loopStartIndex = 1;
                            } else if (r >= 192) {    // 192-223 发光半移动
                                autoStart = true;  fullBlock = false; loopStartIndex = 1;
                            } else if (r >= 160) {    // 160-191 移动
                                autoStart = false; fullBlock = true;  loopStartIndex = 0;
                            } else {                  // 128-159 半移动
                                autoStart = false; fullBlock = false; loopStartIndex = 0;
                            }
                            autoMovingPlatforms.push({
                                x, y, z, autoStart, fullBlock, loopStartIndex
                            });
                        }
                    }
                }
            }
        }
        W.writeBytes(cmap);
        this.logInfo(`R 通道自动生成移动平台数: ${autoMovingPlatforms.length}`);
		this.logInfo(`碰撞地图写入: ${cml} 字节 (位顺序: msb)`);

		// spawn / zoom / exit
		W.writeVector(spawn.x, spawn.y, spawn.z);
		W.writeInt16(zoom);
		if (zoom < 0) { W.writeInt16(zVal); W.writeBool(zIsAng); }
		W.writeVector(exit.x, exit.y, exit.z);

        // ---- MovingPlatforms (用户定义 + R 通道自动生成) ----
        W.writeInt16(mpData.length + autoMovingPlatforms.length);
        // 用户定义
        for (const mp of mpData) {
            const e = mp.el;
            W.writeInt8(this.parseBool(this.getAttrIgnoreCase(e, 'AutoStart', 'True')) ? 2 : 0);
            W.writeInt8(parseInt(this.getAttrIgnoreCase(e, 'LoopStartIndex', '1'), 10));
            W.writeInt16(parseInt(this.getAttrIgnoreCase(e, 'Clones', '-1'), 10));
            W.writeBool(this.parseBool(this.getAttrIgnoreCase(e, 'FullBlock', 'True')) !== false);
            const wps = mp._resolvedWaypoints || [];
            W.writeInt8(wps.length);
            for (const w of wps) {
                W.writeVector(w.pos.x, w.pos.y, w.pos.z);
                W.writeInt16(w.tt);
                W.writeInt16(w.pt);
            }
        }
        // R 通道自动生成
        for (const ap of autoMovingPlatforms) {
            W.writeInt8(ap.autoStart ? 2 : 0);
            W.writeInt8(ap.loopStartIndex);
            W.writeInt16(-1);           // Clones
            W.writeBool(ap.fullBlock);
            W.writeInt8(1);             // 单个路点
            W.writeVector(ap.x, ap.y, ap.z + 1); // z + 1，与 XML 输出一致
            W.writeInt16(0);            // TravelTime
            W.writeInt16(0);            // PauseTime
        }

		// ---- Bumpers (缺失子元素写 -1) ----
		W.writeInt16(bps.length);
		for (const b of bps) {
			const e = b.el;
			W.writeBool(this.parseBool(this.getAttrIgnoreCase(e, 'Enabled', 'True')) !== false);
			const p = this.parseVec(this.getAttrIgnoreCase(e, 'Position'));
			if (!p) throw new Error('Bumper 缺少 Position');
			W.writeVector(p.x, p.y, p.z);
			for (const side of ['North', 'East', 'South', 'West']) {
				const s = Array.from(e.children).find(c => c.nodeName.toLowerCase() === side.toLowerCase());
				if (s) {
					W.writeInt16(parseInt(this.getAttrIgnoreCase(s, 'StartDelay', '0'), 10));
					W.writeInt16(parseInt(this.getAttrIgnoreCase(s, 'PulseRate', '0'), 10));
				} else {
					W.writeInt16(-1);
					W.writeInt16(-1);
				}
			}
		}

		// ---- FallingPlatforms ----
		W.writeInt16(fps.length);
		for (const f of fps) {
			const e = f.el, p = this.parseVec(this.getAttrIgnoreCase(e, 'Position'));
			if (!p) throw new Error('FallingPlatform 缺少 Position');
			W.writeVector(p.x, p.y, p.z);
			W.writeInt16(parseInt(this.getAttrIgnoreCase(e, 'FloatTime', '20'), 10));
		}

		// ---- Checkpoints ----
		W.writeInt16(cps.length);
		for (const c of cps) {
			const e = c.el, p = this.parseVec(this.getAttrIgnoreCase(e, 'Position'));
			if (!p) throw new Error('Checkpoint 缺少 Position');
			W.writeVector(p.x, p.y, p.z);
			// 如果 XML 中未指定 RespawnZ，则使用元素自身的 z 坐标
			const respawnAttr = this.getAttrIgnoreCase(e, 'RespawnZ');
			const respawnZ = (respawnAttr !== undefined && respawnAttr !== null && respawnAttr !== '')
				? parseInt(respawnAttr, 10)
				: p.z;
			W.writeInt16(respawnZ);
			const r = this.parseVec(this.getAttrIgnoreCase(e, 'Radius', '0,0')) || {x:0,y:0};
			W.writeInt8(r.x); W.writeInt8(r.y);
		}

		// ---- CameraTriggers ----
		W.writeInt16(cts.length);
		for (const c of cts) {
			const e = c.el, p = this.parseVec(this.getAttrIgnoreCase(e, 'Position'));
			if (!p) throw new Error('CameraTrigger 缺少 Position');
			W.writeVector(p.x, p.y, p.z);
			const z2 = parseInt(this.getAttrIgnoreCase(e, 'Zoom', '-1'), 10);
			W.writeInt16(z2);
			const r = this.parseVec(this.getAttrIgnoreCase(e, 'Radius', '0,0')) || {x:0,y:0};
			W.writeInt8(r.x); W.writeInt8(r.y);
			if (z2 === -1) {
				W.writeBool(this.parseBool(this.getAttrIgnoreCase(e, 'Reset')) === true);
				W.writeInt16(parseInt(this.getAttrIgnoreCase(e, 'StartDelay', '0'), 10));
				W.writeInt16(parseInt(this.getAttrIgnoreCase(e, 'Duration', '0'), 10));
				const a = this.getAttrIgnoreCase(e, 'Angle');
				let v = 0, ia = false;
				if (a != null && a !== '') { v = parseInt(a, 10); ia = true; }
				else { v = parseInt(this.getAttrIgnoreCase(e, 'FieldOfView', '22'), 10); ia = false; }
				W.writeInt16(v);
				W.writeBool(this.parseBool(this.getAttrIgnoreCase(e, 'SingleUse', 'False')) === true);
				W.writeBool(ia);
			}
		}

		// ---- Prisms ----
		W.writeInt16(prs.length);
		for (const p of prs) {
			const e = p.el, pos = this.parseVec(this.getAttrIgnoreCase(e, 'Position'));
			if (!pos) throw new Error('Prism 缺少 Position');
			W.writeVector(pos.x, pos.y, pos.z);
			W.writeInt8(parseInt(this.getAttrIgnoreCase(e, 'Energy', '1'), 10));
		}

		// ---- Fans (deprecated) ----
		W.writeInt16(0);

		// ---- Button 结构准备 ----
		const btnStructs = [];
		for (let i = 0; i < rawBtns.length; i++) {
			const b = rawBtns[i], e = b.el;
			let vis = 1;
			const vs = this.getAttrIgnoreCase(e, 'Visible', 'True').toLowerCase();
			if (vs === 'false') vis = 0;
			else if (vs === 'null') vis = 2;
			const ms = this.getAttrIgnoreCase(e, 'Mode', 'StayDown').toLowerCase();
			let mode = 2;
			if (ms === 'toggle') mode = 0;
			else if (ms === 'stayup') mode = 1;
			const mpIdStr = this.getAttrIgnoreCase(e, 'MovingPlatformID');
			const isM = mpIdStr != null && mpIdStr !== '';
			const mpId = isM ? this.resolveId(mpIdStr, 'moving_platform') : -1;
			const pos = this.parseVec(this.getAttrIgnoreCase(e, 'Position', '0,0,0')) || {x:0,y:0,z:0};
			let ev = [], pId = -1, sib = 0, sio = false;
			if (b.type === 'standalone') {
				ev = this.parseBtnEffects(e);
			} else if (b.type === 'seq_parent') {
				sio = this.parseBool(this.getAttrIgnoreCase(b.seq, 'SequenceInOrder', 'False')) === true;
				sib = Array.from(b.seq.children).filter(c => c.nodeName.toLowerCase() === 'button').length - 1;
				ev = this.parseBtnEffects(b.seq);
				mode = 2;
			} else if (b.type === 'seq_child') {
				pId = b.pIdx; mode = 2;
				sio = this.parseBool(this.getAttrIgnoreCase(b.seq, 'SequenceInOrder', 'False')) === true;
			}
			btnStructs.push({ vis, disable: parseInt(this.getAttrIgnoreCase(e, 'DisableCount','0'),10), mode, pId, sio, sib, isM, mpId, pos, ev });
		}

		// ---- BlockEvents ----
		W.writeInt16(this.blockEvents.length);
		for (const be of this.blockEvents) { W.writeInt8(be.type); W.writeInt16(be.blockId); W.writeInt16(be.payload); }

		// ---- Buttons ----
		W.writeInt16(rawBtns.length);
		for (const s of btnStructs) {
			W.writeInt8(s.vis);
			W.writeInt8(s.disable);
			W.writeInt8(s.mode);
			W.writeInt16(s.pId);
			W.writeBool(s.sio);
			W.writeInt8(s.sib);
			W.writeBool(s.isM);
			if (s.isM) W.writeInt16(s.mpId);
			else W.writeVector(s.pos.x, s.pos.y, s.pos.z);
			W.writeInt16(s.ev.length);
			for (const ei of s.ev) W.writeInt16(ei);
		}

		// ---- OtherCubes / DarkCubes ----
		W.writeInt16(ocs.length);
		for (const oc of ocs) {
			const e = oc.el, pt = this.parseVec(this.getAttrIgnoreCase(e, 'PositionTrigger'));
			if (!pt) throw new Error('OtherCube/DarkCube 缺少 PositionTrigger');
			W.writeVector(pt.x, pt.y, pt.z);
			if (oc.kind === 'dark') {
				W.writeInt16(-2);
				const r = this.parseVec(this.getAttrIgnoreCase(e, 'Radius', '0,0')) || {x:0,y:0};
				W.writeInt8(r.x); W.writeInt8(r.y);
				let dsync = -1;
				const ds = this.getAttrIgnoreCase(e, 'MovingBlockSync');
				if (ds && ds !== '' && ds !== '-2') { const idx = this.resolveId(ds, 'moving_platform'); if (idx>=0) dsync = idx; }
				W.writeInt16(dsync);
			} else {
				let sync = -1;
				const s = this.getAttrIgnoreCase(e, 'MovingBlockSync');
				if (s != null && s !== '') { const idx = this.resolveId(s, 'moving_platform'); if (idx>=0) sync = idx; }
				W.writeInt16(sync);
			}
			const kes = [];
			for (const c of e.children) {
				const m = c.nodeName.match(/^(West|East|North|South)(Down|Up)$/i);
				if (m) {
					const dir = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase(); // 标准化
					const type = m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase();
					const dmap = { West:0, East:1, North:2, South:3 };
					kes.push({ 
						to: parseInt(this.getAttrIgnoreCase(c, 'TimeOffset', '0'), 10), 
						dir: dmap[dir],          // 使用标准化的 dir
						typ: type === 'Down' ? 0 : 1  // 使用标准化的 type
					});
				}
			}
			W.writeInt16(kes.length);
			const pc = this.parseVec(this.getAttrIgnoreCase(e, 'PositionCube'));
			if (!pc) throw new Error('OtherCube/DarkCube 缺少 PositionCube');
			W.writeVector(pc.x, pc.y, pc.z);
			for (const k of kes) { W.writeInt16(k.to); W.writeInt8(k.dir); W.writeInt8(k.typ); }
		}

		// ---- Resizers ----
		W.writeInt16(rzs.length);
		for (const r of rzs) {
			W.writeVector(r.x, r.y, r.z);
			W.writeBool(r.visible);
			W.writeInt8(r.dir);
		}

		// ---- MiniBlocks ----
		W.writeInt16(0);
		W.writeInt8(theme);
		W.writeInt8(musicJ2me);
		W.writeInt8(music);

		this.logOk(`编译完成: ${W.offset} 字节 | 错误: ${this.errors} | 警告: ${this.warnings}`);
		return W.getBuffer();
	}

}


// ==================== 反编译器 ====================
class EdgeDecompiler {
    constructor(buffer) {
        this.buffer = buffer;
        this.view = new DataView(buffer);
        this.offset = 0;
        this.level = {};
        this.movingPlatforms = [];
        this.bumpers = [];
        this.fallingPlatforms = [];
        this.prisms = [];
        this.resizers = [];
        this.checkpoints = [];
        this.cameraTriggers = [];
        this.buttons = [];
        this.buttonSequences = [];
        this.otherCubes = [];
        this.darkCubes = [];
        this.pngs = {}; // { layer: ImageData }
        this.collisionMap = null;
        this.width = 0;
        this.length = 0;
        this.height = 0;
        // ID 重命名计数器
        this.idCounters = { MovingPlatform: 0, Bumper: 0, Button: 0 };
		this.platformRefs = new Set();   // 被引用的移动平台索引
		this.bumperRefs = new Set();     // 被引用的撞击器索引
		this.buttonRefs = new Set();     // 被引用的按钮索引（独立或序列内）
		this.idMap = { moving: {}, bumper: {}, button: {} }; // 索引 -> 新ID
		this.nextId = { moving: 0, bumper: 0, button: 0 };
		this._allButtons = []; // 存储所有按钮的原始数据（包括序列内）
        this.staticMovingToPng = false;
    }

    // 辅助读取函数
    readInt8() { const v = this.view.getInt8(this.offset); this.offset += 1; return v; }
    readUint8() { const v = this.view.getUint8(this.offset); this.offset += 1; return v; }
    readInt16() { const v = this.view.getInt16(this.offset, true); this.offset += 2; return v; }
    readUint16() { const v = this.view.getUint16(this.offset, true); this.offset += 2; return v; }
    readInt32() { const v = this.view.getInt32(this.offset, true); this.offset += 4; return v; }
    readString() {
        const len = this.readInt32();
        const bytes = new Uint8Array(this.buffer, this.offset, len);
        this.offset += len;
        return new TextDecoder().decode(bytes);
    }
    readVector() { return { x: this.readInt16(), y: this.readInt16(), z: this.readInt16() }; }

    // 主入口
    decompile() {
        this.parseLevelBody();
        this.parseCollisionMap();
        this.parseSpawnZoomExit();
        this.parseMovingPlatforms();
        this.parseBumpers();
        this.parseFallingPlatforms();
        this.parseCheckpoints();
        this.parseCameraTriggers();
        this.parsePrisms();
        this.parseFans();
        this.parseBlockEvents();
        this.parseButtons();
        this.parseOtherCubes();
        this.parseResizers();
        this.parseMiniBlocks();
        this.assignIds();

        // ---- 若开启，把静止移动方块提取为 PNG 像素覆盖 ----
        let extraPixels = null;
        if (this.staticMovingToPng) {
            extraPixels = this.extractStaticMovingToPixels();
        }

        this.generatePngs(extraPixels);

        const xml = this.generateXML();

        return {
            xml,
            pngs: this.pngs,
            levelName: this.level.name || 'level'
        };
    }

    parseLevelBody() {
        const levelId = this.readInt32();
        const name = this.readString();
        const thresholds = [];
        for (let i = 0; i < 5; i++) thresholds.push(this.readInt16());
        const prismCount = this.readInt16();

        const height = this.readUint8();
        const width = this.readInt16();
        const length = this.readInt16();
        const u1 = this.readInt16();
        const u2 = this.readInt16();
        const u3 = this.readInt16();
        const u4 = this.readInt16();
        const unknown1 = this.readUint8(); // 10
        const sy_minus_1 = this.readInt16();
        const unknown2 = this.readInt16(); // 0
        // 跳过一些字节
        const bitmapSize = Math.floor((u3 * u4 + 7) / 8);
        this.offset += bitmapSize;

        this.level = {
            id: levelId,
            name: name,
            timeThresholds: thresholds,
            size: { w: width, l: length, h: height },
            theme: 0, // 稍后从 MiniBlocks 读取
            musicJava: 0,
            music: 0,
            zoom: -1,
            spawn: null,
            exit: null
        };
        this.width = width;
        this.length = length;
        this.height = height;
        this.prisms = []; // 但 prismCount 是数量，后面会读取
    }

    parseCollisionMap() {
        const bytesPerLayer = Math.floor((this.width * this.length + 7) / 8);
        const totalBytes = this.height * bytesPerLayer;
        const cmap = new Uint8Array(this.buffer, this.offset, totalBytes);
        this.collisionMap = cmap;
        this.offset += totalBytes;
    }

    parseSpawnZoomExit() {
        const spawn = this.readVector();
        const zoom = this.readInt16();
        let zVal = 0, zIsAng = false;
        if (zoom < 0) {
            zVal = this.readInt16();
            zIsAng = this.readBool();
        }
        const exit = this.readVector();
        this.level.spawn = spawn;
        this.level.exit = exit;
        this.level.zoom = zoom;
        if (zoom < 0) {
            if (zIsAng) this.level.angle = zVal;
            else this.level.fov = zVal;
        }
    }

    readBool() { return this.readUint8() !== 0; }

	parseMovingPlatforms() {
		const count = this.readInt16();
		for (let i = 0; i < count; i++) {
			const autoStart = this.readUint8() === 2;
			const loopStartIndex = this.readUint8();
			const clones = this.readInt16();
			const fullBlock = this.readBool();
			const wpCount = this.readUint8();
			const waypoints = [];
			for (let j = 0; j < wpCount; j++) {
				const pos = this.readVector();
				const travelTime = this.readInt16();
				const pauseTime = this.readInt16();
				waypoints.push({ x: pos.x, y: pos.y, z: pos.z, travelTime, pauseTime });
			}
			this.movingPlatforms.push({
				id: '', // 稍后分配
				xmlId: '',
				autoStart,
				loopStartIndex,
				fullBlock,
				waypoints,
				relatedTo: '',
				offset: '',
				_origIdx: i
			});
		}
	}
	
    generateId(type) {
        this.idCounters[type] = (this.idCounters[type] || 0) + 1;
        return type + this.idCounters[type];
    }

	parseBumpers() {
		const count = this.readInt16();
		for (let i = 0; i < count; i++) {
			const enabled = this.readBool();
			const pos = this.readVector();
			const dirs = {};
			for (const side of ['North', 'East', 'South', 'West']) {
				const startDelay = this.readInt16();
				const pulseRate = this.readInt16();
				if (startDelay !== -1 || pulseRate !== -1) {
					dirs[side.toLowerCase()] = { enabled: true, startDelay, pulseRate };
				} else {
					dirs[side.toLowerCase()] = { enabled: false, startDelay: 0, pulseRate: 0 };
				}
			}
			this.bumpers.push({
				id: '',
				xmlId: '',
				x: pos.x,
				y: pos.y,
				z: pos.z,
				enabled,
				...dirs,
				_origIdx: i
			});
		}
	}

    parseFallingPlatforms() {
        const count = this.readInt16();
        for (let i = 0; i < count; i++) {
            const pos = this.readVector();
            const floatTime = this.readInt16();
            this.fallingPlatforms.push({ x: pos.x, y: pos.y, z: pos.z, floatTime });
        }
    }

    parseCheckpoints() {
        const count = this.readInt16();
        for (let i = 0; i < count; i++) {
            const pos = this.readVector();
            const respawnZ = this.readInt16();
            const rx = this.readUint8();
            const ry = this.readUint8();
            this.checkpoints.push({ x: pos.x, y: pos.y, z: pos.z, respawnZ, radiusX: rx, radiusY: ry });
        }
    }

    parseCameraTriggers() {
        const count = this.readInt16();
        for (let i = 0; i < count; i++) {
            const pos = this.readVector();
            const zoom = this.readInt16();
            const rx = this.readUint8();
            const ry = this.readUint8();
            const ct = { x: pos.x, y: pos.y, z: pos.z, zoom, radiusX: rx, radiusY: ry };
            if (zoom === -1) {
                const reset = this.readBool();
                const startDelay = this.readInt16();
                const duration = this.readInt16();
                const v = this.readInt16();
                const singleUse = this.readBool();
                const useAngle = this.readBool();
                ct.reset = reset;
                ct.startDelay = startDelay;
                ct.duration = duration;
                ct.singleUse = singleUse;
                ct.useAngle = useAngle;
                if (useAngle) ct.angle = v;
                else ct.fov = v;
            }
            this.cameraTriggers.push(ct);
        }
    }

    parsePrisms() {
        const count = this.readInt16();
        for (let i = 0; i < count; i++) {
            const pos = this.readVector();
            const energy = this.readUint8();
            this.prisms.push({ x: pos.x, y: pos.y, z: pos.z, energy });
        }
    }

    parseFans() {
        const count = this.readInt16(); // 总是 0
        // 跳过
    }

	parseBlockEvents() {
		const count = this.readInt16();
		this.blockEvents = [];
		for (let i = 0; i < count; i++) {
			const type = this.readUint8();
			const blockId = this.readInt16();
			const payload = this.readInt16();
			this.blockEvents.push({ type, blockId, payload });
		}
	}

	parseButtons() {
		const count = this.readInt16();
		const rawButtons = [];
		for (let i = 0; i < count; i++) {
			const vis = this.readUint8();
			const disable = this.readUint8();
			const modeVal = this.readUint8();
			const pId = this.readInt16();
			const sio = this.readBool();
			const sib = this.readUint8();
			const isM = this.readBool();
			let pos = null, mpId = -1;
			if (isM) {
				mpId = this.readInt16();
				// 记录移动平台引用
				if (mpId >= 0) this.platformRefs.add(mpId);
			} else {
				pos = this.readVector();
			}
			const evCount = this.readInt16();
			const events = [];
			for (let j = 0; j < evCount; j++) events.push(this.readInt16());

			const mode = ['Toggle', 'StayUp', 'StayDown'][modeVal] || 'StayDown';
			const visible = vis === 1 ? true : (vis === 0 ? false : null);

			// 解析事件并记录引用
			const affectMoving = [];
			const affectBumpers = [];
			const triggerAchievements = [];
			const affectButtonRefs = [];
			for (const evIdx of events) {
				const ev = this.blockEvents[evIdx];
				if (!ev) continue;
				const { type, blockId, payload } = ev;
				if (type === 0) {
					this.platformRefs.add(blockId);
					affectMoving.push({ idx: blockId, data: payload });
				} else if (type === 1) {
					this.bumperRefs.add(blockId);
					affectBumpers.push({ idx: blockId, data: payload });
				} else if (type === 2) {
					triggerAchievements.push({ id: blockId, data: payload });
				} else if (type === 3) {
					this.buttonRefs.add(blockId);
					affectButtonRefs.push({ idx: blockId, data: payload });
				}
			}

			const btn = {
				visible,
				disableCount: disable,
				mode,
				movingPlatformID: isM ? mpId : -1, // 存储原始索引
				x: pos ? pos.x : undefined,
				y: pos ? pos.y : undefined,
				z: pos ? pos.z : undefined,
				affectMoving,      // 存储 { idx, data } 数组
				affectBumpers,     // 存储 { idx, data } 数组
				triggerAchievements,
				affectButtonRefs,
				_seqParentIdx: pId !== -1 ? pId : undefined,
				_seqInOrder: sio,
				_seqSibling: sib,
				_origIdx: i
			};
			rawButtons.push(btn);
		}

		// ---- 重组按钮序列 ----
		this.buttons = [];
		this.buttonSequences = [];
		const seqMap = new Map();
		for (let i = 0; i < rawButtons.length; i++) {
			const btn = rawButtons[i];
			if (btn._seqParentIdx !== undefined && btn._seqParentIdx >= 0) {
				if (!seqMap.has(btn._seqParentIdx)) {
					seqMap.set(btn._seqParentIdx, []);
				}
				seqMap.get(btn._seqParentIdx).push(i);
			}
		}

		const usedIndices = new Set();
		for (const [parentIdx, childIndices] of seqMap) {
			const parentBtn = rawButtons[parentIdx];
			// 如果父按钮本身有 affectButtonRefs，它们引用的是全局按钮索引，我们保留
			const seq = {
				id: '',
				xmlId: '',
				sequenceInOrder: parentBtn._seqInOrder || false,
				affectMoving: parentBtn.affectMoving.slice(), // 复制
				affectBumpers: parentBtn.affectBumpers.slice(),
				triggerAchievements: parentBtn.triggerAchievements.slice(),
				affectButtonRefs: parentBtn.affectButtonRefs.slice(),
				buttons: []
			};
			const allIndices = [parentIdx, ...childIndices];
			for (const idx of allIndices) {
				const btn = rawButtons[idx];
				usedIndices.add(idx);
				// 子按钮的 movingPlatformID 引用也要记录
				if (btn.movingPlatformID >= 0) {
					this.platformRefs.add(btn.movingPlatformID);
				}
				const subBtn = {
					id: '',
					xmlId: '',
					visible: btn.visible,
					position: (btn.x !== undefined) ? { x: btn.x, y: btn.y, z: btn.z } : undefined,
					movingPlatformID: btn.movingPlatformID >= 0 ? btn.movingPlatformID : -1, // 存储索引
					_origIdx: idx
				};
				seq.buttons.push(subBtn);
			}
			this.buttonSequences.push(seq);
		}

		// 独立按钮
		for (let i = 0; i < rawButtons.length; i++) {
			if (!usedIndices.has(i)) {
				const btn = rawButtons[i];
				delete btn._seqParentIdx;
				delete btn._seqInOrder;
				delete btn._seqSibling;
				// 如果按钮引用了移动平台，记录
				if (btn.movingPlatformID >= 0) this.platformRefs.add(btn.movingPlatformID);
				this.buttons.push(btn);
			}
		}
		// 在 parseButtons 末尾
		this._rawButtons = rawButtons;
	}

	parseOtherCubes() {
		// 检查是否有足够字节读取 count
		if (this.offset + 2 > this.buffer.byteLength) {
			return;
		}
		const count = this.readInt16();
		if (count < 0 || count > 1000) {
			console.warn(`parseOtherCubes: 异常的 count=${count}，跳过解析 OtherCube/DarkCube`);
			return;
		}

		for (let i = 0; i < count; i++) {
			// 确保至少还有 PositionTrigger (6) + syncOrKind (2) 共 8 字节
			if (this.offset + 8 > this.buffer.byteLength) {
				console.warn(`parseOtherCubes: 第 ${i} 个元素数据不足，停止解析`);
				break;
			}
			const triggerPos = this.readVector();      // 6 bytes
			const syncOrKind = this.readInt16();       // 2 bytes
			const isDark = syncOrKind === -2;
			let syncIdx = -1;
			let radiusX = 0, radiusY = 0;

			if (isDark) {
				// DarkCube: 读取 radiusX (1), radiusY (1), sync (2)
				if (this.offset + 4 > this.buffer.byteLength) {
					console.warn(`parseOtherCubes: DarkCube 第 ${i} 个元素数据不足，停止解析`);
					break;
				}
				radiusX = this.readUint8();
				radiusY = this.readUint8();
				syncIdx = this.readInt16();
				if (syncIdx >= 0) this.platformRefs.add(syncIdx); // 新增
			} else {
				// OtherCube: syncOrKind 本身就是 sync 索引（-1 表示无同步）
				syncIdx = syncOrKind;
				if (syncIdx >= 0) this.platformRefs.add(syncIdx); // 新增
				// 注意：OtherCube 没有 radius 字段，所以不读取
			}

			// 接下来读取 keyEventsCount (2 bytes) 和 PositionCube (6 bytes)
			if (this.offset + 8 > this.buffer.byteLength) {
				console.warn(`parseOtherCubes: 第 ${i} 个元素 keyEventsCount/PositionCube 数据不足，停止解析`);
				break;
			}
			const keyEventsCount = this.readInt16();   // 2 bytes
			const cubePos = this.readVector();         // 6 bytes

			// 读取 keyEvents
			const keyEvents = [];
			for (let j = 0; j < keyEventsCount; j++) {
				if (this.offset + 4 > this.buffer.byteLength) {
					console.warn(`parseOtherCubes: 第 ${i} 个元素的 keyEvents 数据不足，停止解析`);
					break;
				}
				const timeOffset = this.readInt16();    // 2 bytes
				const dir = this.readUint8();           // 1 byte: 0=West,1=East,2=North,3=South
				const type = this.readUint8();          // 1 byte: 0=Down,1=Up
				const dirNames = ['West', 'East', 'North', 'South'];
				const typeNames = ['Down', 'Up'];
				keyEvents.push({
					dir: dirNames[dir],
					type: typeNames[type],
					timeOffset
				});
			}

			if (isDark) {
				this.darkCubes.push({
					triggerX: triggerPos.x,
					triggerY: triggerPos.y,
					triggerZ: triggerPos.z,
					cubeX: cubePos.x,
					cubeY: cubePos.y,
					cubeZ: cubePos.z,
					radiusX,
					radiusY,
					movingBlockSync: syncIdx,
					keyEvents
				});
			} else {
				this.otherCubes.push({
					triggerX: triggerPos.x,
					triggerY: triggerPos.y,
					triggerZ: triggerPos.z,
					cubeX: cubePos.x,
					cubeY: cubePos.y,
					cubeZ: cubePos.z,
					// OtherCube 没有半径，但我们在反编译时也不输出 Radius 属性，所以这里保持 0
					radiusX: 0,
					radiusY: 0,
					movingBlockSync: syncIdx,
					keyEvents
				});
			}
		}
	}

    parseResizers() {
        const count = this.readInt16();
        for (let i = 0; i < count; i++) {
            const pos = this.readVector();
            const visible = this.readBool();
            const dir = this.readUint8();
            this.resizers.push({
                x: pos.x,
                y: pos.y,
                z: pos.z,
                type: dir === 1 ? 'grow' : 'shrink',
                visible,
                radiusX: 0,
                radiusY: 0
            });
        }
    }

    parseMiniBlocks() {
        const count = this.readInt16(); // always 0
        const theme = this.readUint8();
        const musicJava = this.readUint8();
        const music = this.readUint8();
        this.level.theme = theme;
        this.level.musicJava = musicJava;
        this.level.music = music;
    }
	
	assignIds() {
		// ---- 1. 收集所有需要分配 ID 的元素 ----
		// 从 this._rawButtons 中收集所有按钮的索引（原始 rawButtons 已存储在 parseButtons 中）
		// 确保 this._rawButtons 已在 parseButtons 中设置
		
		// 为移动平台分配 ID（只针对被引用的）
		const movingIndices = Array.from(this.platformRefs).sort((a, b) => a - b);
		for (const idx of movingIndices) {
			this.nextId.moving++;
			//const newId = `MovingPlatform${this.nextId.moving}`;
            const newId = `Moving${this.nextId.moving}`;
			this.idMap.moving[idx] = newId;
			const mp = this.movingPlatforms.find(p => p._origIdx === idx);
			if (mp) {
				mp.id = newId;
				mp.xmlId = newId;
			}
		}

		// 为撞击器分配 ID（只针对被引用的）
		const bumperIndices = Array.from(this.bumperRefs).sort((a, b) => a - b);
		for (const idx of bumperIndices) {
			this.nextId.bumper++;
			const newId = `Bumper${this.nextId.bumper}`;
			this.idMap.bumper[idx] = newId;
			const b = this.bumpers.find(p => p._origIdx === idx);
			if (b) {
				b.id = newId;
				b.xmlId = newId;
			}
		}

		// 为按钮分配 ID（只针对被引用的）
		const buttonIndices = Array.from(this.buttonRefs).sort((a, b) => a - b);

		// 先建立一个从 _origIdx 到按钮对象引用的映射，方便快速查找
		const btnMap = new Map(); // 索引 -> 按钮对象引用（独立或序列内子按钮）
		for (const btn of this.buttons) {
			if (btn._origIdx !== undefined) {
				btnMap.set(btn._origIdx, { type: 'standalone', ref: btn });
			}
		}
		for (const seq of this.buttonSequences) {
			for (const sub of seq.buttons) {
				if (sub._origIdx !== undefined) {
					btnMap.set(sub._origIdx, { type: 'sequence', ref: sub, seq });
				}
			}
		}

		for (const idx of buttonIndices) {
			if (!this.idMap.button[idx]) {
				this.nextId.button++;
				const newId = `Button${this.nextId.button}`;
				this.idMap.button[idx] = newId;

				// 从 btnMap 中查找对应的按钮对象
				const entry = btnMap.get(idx);
				if (entry) {
					// 更新 ID
					entry.ref.id = newId;
					entry.ref.xmlId = newId;
				} else if (this._rawButtons && idx < this._rawButtons.length) {
					// 如果 btnMap 中没有，但 rawButtons 中有，说明该按钮可能在序列重组时被遗漏了（理论上不会发生）
					// 我们仍可以处理，但需要找到它实际在 buttons/sequences 中的位置
					// 由于这种情况极少，我们可以忽略或输出警告
					console.warn(`Button index ${idx} not found in btnMap, but exists in rawButtons`);
					// 可选：从 rawButtons 重新创建并添加到 buttons? 这里不处理
				}
			}
		}

		// ---- 2. 更新所有引用列表中的索引为 ID ----
		// 处理独立按钮
		for (const btn of this.buttons) {
			// 影响移动平台
			if (btn.affectMoving && btn.affectMoving.length > 0) {
				btn.affectMoving = btn.affectMoving.map(ref => {
					const id = this.idMap.moving[ref.idx];
					return id ? (ref.data === 0 ? id : `${id}(${ref.data})`) : null;
				}).filter(Boolean).join(',');
			} else {
				btn.affectMoving = '';
			}
			// 影响撞击器
			if (btn.affectBumpers && btn.affectBumpers.length > 0) {
				btn.affectBumpers = btn.affectBumpers.map(ref => {
					const id = this.idMap.bumper[ref.idx];
					return id ? (ref.data === 0 ? id : `${id}(${ref.data})`) : null;
				}).filter(Boolean).join(',');
			} else {
				btn.affectBumpers = '';
			}
			// 触发成就（不需要替换，保持原样）
			if (btn.triggerAchievements) {
				btn.triggerAchievements = btn.triggerAchievements.map(ref => {
					return ref.data === 0 ? `${ref.id}` : `${ref.id}(${ref.data})`;
				}).join(',');
			} else {
				btn.triggerAchievements = '';
			}
			// 影响按钮
			if (btn.affectButtonRefs && btn.affectButtonRefs.length > 0) {
				btn.affectButtons = btn.affectButtonRefs.map(ref => {
					const id = this.idMap.button[ref.idx];
					return id ? (ref.data === 0 ? id : `${id}(${ref.data})`) : null;
				}).filter(Boolean).join(',');
			} else {
				btn.affectButtons = '';
			}
			// 移动平台ID
			if (btn.movingPlatformID >= 0) {
				const id = this.idMap.moving[btn.movingPlatformID];
				btn.movingPlatformID = id || '';
			} else {
				btn.movingPlatformID = '';
			}
			// 删除临时字段
			delete btn._origIdx;
			delete btn.affectButtonRefs;
		}

		// 处理按钮序列
		for (const seq of this.buttonSequences) {
			// 序列自身的影响属性
			if (seq.affectMoving && seq.affectMoving.length > 0) {
				seq.affectMoving = seq.affectMoving.map(ref => {
					const id = this.idMap.moving[ref.idx];
					return id ? (ref.data === 0 ? id : `${id}(${ref.data})`) : null;
				}).filter(Boolean).join(',');
			} else {
				seq.affectMoving = '';
			}
			if (seq.affectBumpers && seq.affectBumpers.length > 0) {
				seq.affectBumpers = seq.affectBumpers.map(ref => {
					const id = this.idMap.bumper[ref.idx];
					return id ? (ref.data === 0 ? id : `${id}(${ref.data})`) : null;
				}).filter(Boolean).join(',');
			} else {
				seq.affectBumpers = '';
			}
			if (seq.triggerAchievements) {
				seq.triggerAchievements = seq.triggerAchievements.map(ref => {
					return ref.data === 0 ? `${ref.id}` : `${ref.id}(${ref.data})`;
				}).join(',');
			} else {
				seq.triggerAchievements = '';
			}
			// 影响按钮（序列自身的 affectButtons，如果有的话）
			if (seq.affectButtonRefs && seq.affectButtonRefs.length > 0) {
				seq.affectButtons = seq.affectButtonRefs.map(ref => {
					const id = this.idMap.button[ref.idx];
					return id ? (ref.data === 0 ? id : `${id}(${ref.data})`) : null;
				}).filter(Boolean).join(',');
			} else {
				seq.affectButtons = '';
			}
			delete seq.affectButtonRefs;

			// 处理序列内子按钮
			for (const sub of seq.buttons) {
				// 子按钮的 movingPlatformID
				if (sub.movingPlatformID >= 0) {
					const id = this.idMap.moving[sub.movingPlatformID];
					sub.movingPlatformID = id || '';
				} else {
					sub.movingPlatformID = '';
				}
				// 子按钮的 ID 已经在上面分配过，如果没有被引用，id 仍为空。
				// 删除临时字段
				delete sub._origIdx;
			}
			// 序列本身没有 ID 属性，但如果我们想给序列一个 ID（其实不应该），可以忽略。
			// 但序列可能作为某个按钮的 affectButtons 目标？实际上 affectButtons 只能引用按钮，不能引用序列。
			// 所以序列不需要 ID。
			seq.id = '';
			seq.xmlId = '';
		}
		
		// 在 assignIds 方法末尾，清理 _origIdx 之前添加：
		// 更新 OtherCube 和 DarkCube 的 movingBlockSync
		for (const oc of this.otherCubes) {
			if (oc.movingBlockSync !== undefined && oc.movingBlockSync >= 0) {
				const id = this.idMap.moving[oc.movingBlockSync];
				oc.movingBlockSync = id || '';
			} else {
				oc.movingBlockSync = '';
			}
		}
		for (const dc of this.darkCubes) {
			if (dc.movingBlockSync !== undefined && dc.movingBlockSync >= 0) {
				const id = this.idMap.moving[dc.movingBlockSync];
				dc.movingBlockSync = id || '';
			} else {
				dc.movingBlockSync = '';
			}
		}

		// 清理移动平台和撞击器的临时字段
		for (const mp of this.movingPlatforms) {
			delete mp._origIdx;
		}
		for (const b of this.bumpers) {
			delete b._origIdx;
		}
	}
    
    // 把符合 R 通道规律的单路点移动平台转成 PNG 像素覆盖
    // 返回 { "x,y,z": rValue }（z 是 PNG 层号），并从 this.movingPlatforms 中移除这些元素
    extractStaticMovingToPixels() {
        const map = {};
        const remaining = [];

        for (const mp of this.movingPlatforms) {
            // 判据：单路点、TravelTime=0、PauseTime=0
            if (!mp.waypoints || mp.waypoints.length !== 1) { remaining.push(mp); continue; }
            const wp = mp.waypoints[0];
            if (wp.travelTime !== 0 || wp.pauseTime !== 0) { remaining.push(mp); continue; }

            // 判断 R 值
            let r;
            if (mp.autoStart && mp.fullBlock && mp.loopStartIndex === 1) r = 224;       // 发光移动
            else if (mp.autoStart && !mp.fullBlock && mp.loopStartIndex === 1) r = 192; // 发光半移动
            else if (!mp.autoStart && mp.fullBlock && mp.loopStartIndex === 0) r = 160; // 移动
            else if (!mp.autoStart && !mp.fullBlock && mp.loopStartIndex === 0) r = 128; // 半移动
            else { remaining.push(mp); continue; }

            // 位置校验：wp.z 是二进制里的值（原坐标 + 1）
            const z = wp.z - 1;
            if (z < 0 || z >= this.height) { remaining.push(mp); continue; }
            if (wp.x < 0 || wp.x >= this.width || wp.y < 0 || wp.y >= this.length) {
                remaining.push(mp); continue;
            }

            map[`${wp.x},${wp.y},${z}`] = r;
        }

        this.movingPlatforms = remaining;
        return map;
    }
    
    // 生成 PNG（从碰撞地图还原）
    generatePngs(extraPixels) {
        if (!this.collisionMap) return;
        const { w, l, h } = this.level.size;
        const bytesPerLayer = Math.floor((w * l + 7) / 8);
        for (let z = 0; z < h; z++) {
            const layerData = new Uint8ClampedArray(w * l * 4);
            const off = z * bytesPerLayer;
            for (let y = 0; y < l; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = y * w + x;
                    const byteIdx = off + Math.floor(idx / 8);
                    const bit = idx % 8;
                    const hasBlock = (this.collisionMap[byteIdx] & (1 << (7 - bit))) !== 0;
                    const pixelIdx = (y * w + x) * 4;

                    // ---- 额外像素覆盖（静止移动方块）----
                    const key = `${x},${y},${z}`;
                    if (extraPixels && extraPixels[key] !== undefined) {
                        layerData[pixelIdx]     = extraPixels[key];  // R
                        layerData[pixelIdx + 1] = 255;               // G：默认主题
                        layerData[pixelIdx + 2] = (z === 0 ? 128 : 255); // B：默认满高
                        layerData[pixelIdx + 3] = 255;
                        continue;
                    }

                    if (hasBlock) {
                        if (z === 0) {
                            layerData[pixelIdx]     = 255;
                            layerData[pixelIdx + 1] = 255;
                            layerData[pixelIdx + 2] = 128;
                        } else {
                            layerData[pixelIdx]     = 255;
                            layerData[pixelIdx + 1] = 255;
                            layerData[pixelIdx + 2] = 255;
                        }
                        layerData[pixelIdx + 3] = 255;
                    } else {
                        layerData[pixelIdx]     = 0;
                        layerData[pixelIdx + 1] = 0;
                        layerData[pixelIdx + 2] = 0;
                        layerData[pixelIdx + 3] = 255;
                    }
                }
            }
            // 原逻辑：检查是否有任意非零像素
            let hasAny = false;
            for (let i = 0; i < layerData.length; i += 4) {
                if (layerData[i] > 10 || layerData[i + 1] > 10 || layerData[i + 2] > 10) {
                    hasAny = true;
                    break;
                }
            }
            if (hasAny) {
                this.pngs[z] = new ImageData(layerData, w, l);
            }
        }
    }

    // 生成 XML
    generateXML() {
        const lv = this.level;
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        let levelAttrs = ` ID="${lv.id}" Name="${lv.name}" TimeThresholds="${lv.timeThresholds.join(',')}"\n`;
        levelAttrs += `       Size="${lv.size.w}x${lv.size.l}x${lv.size.h}" SpawnPoint="${lv.spawn.x},${lv.spawn.y},${lv.spawn.z}" ExitPoint="${lv.exit.x},${lv.exit.y},${lv.exit.z}"\n`;
        levelAttrs += `       Theme="${lv.theme}" MusicJava="${lv.musicJava}" Music="${lv.music}" Zoom="${lv.zoom}"`;
        if (lv.angle !== undefined) levelAttrs += ` Angle="${lv.angle}"`;
        if (lv.fov !== undefined) levelAttrs += ` FieldOfView="${lv.fov}"`;
        xml += `<Level${levelAttrs}>\n`;

        // 移动平台
        for (const m of this.movingPlatforms) {
			let attrs = '';
			if (m.id) attrs += ` ID="${m.id}"`;
			// AutoStart, LoopStartIndex, FullBlock 始终输出（即使没有 ID）
			attrs += ` AutoStart="${m.autoStart}" LoopStartIndex="${m.loopStartIndex}" FullBlock="${m.fullBlock}"`;
            xml += `  <MovingPlatform${attrs}>\n`;
            if (m.waypoints) {
                for (const wp of m.waypoints) {
                    const exportZ = wp.z;
                    let wpAttrs = ` Position="${wp.x},${wp.y},${exportZ}" TravelTime="${wp.travelTime}" PauseTime="${wp.pauseTime}"`;
                    xml += `    <Waypoint${wpAttrs} />\n`;
                }
            }
            xml += `  </MovingPlatform>\n`;
        }

        // 撞击器
        for (const b of this.bumpers) {
			let attrs = '';
			if (b.id) attrs += ` ID="${b.id}"`;
			attrs += ` Position="${b.x},${b.y},${b.z}" Enabled="${b.enabled}"`;
            xml += `  <Bumper${attrs}>\n`;
            for (const dir of ['north','east','south','west']) {
                const d = b[dir];
                if (d && d.enabled) {
                    const tag = dir.charAt(0).toUpperCase() + dir.slice(1);
                    xml += `    <${tag} StartDelay="${d.startDelay}" PulseRate="${d.pulseRate}" />\n`;
                }
            }
            xml += `  </Bumper>\n`;
        }

        // 掉落平台
        for (const f of this.fallingPlatforms) {
            xml += `  <FallingPlatform Position="${f.x},${f.y},${f.z}" FloatTime="${f.floatTime}" />\n`;
        }

        // 棱柱
        for (const p of this.prisms) {
            xml += `  <Prism Position="${p.x},${p.y},${p.z}" Energy="${p.energy}" />\n`;
        }

        // 尺寸调整器
        for (const r of this.resizers) {
            const tag = r.type === 'grow' ? 'ResizerGrow' : 'ResizerShrink';
            let attrs = ` Position="${r.x},${r.y},${r.z}" Visible="${r.visible}"`;
            if (r.radiusX > 0 || r.radiusY > 0) attrs += ` Radius="${r.radiusX},${r.radiusY}"`;
            xml += `  <${tag}${attrs} />\n`;
        }

        // 存档点
        for (const c of this.checkpoints) {
            let attrs = ` Position="${c.x},${c.y},${c.z}" RespawnZ="${c.respawnZ}" Radius="${c.radiusX},${c.radiusY}"`;
            xml += `  <Checkpoint${attrs} />\n`;
        }

        // 相机触发器
        for (const c of this.cameraTriggers) {
            let attrs = ` Position="${c.x},${c.y},${c.z}" Radius="${c.radiusX},${c.radiusY}" Zoom="${c.zoom}"`;
            if (c.zoom === -1) {
                if (c.useAngle) attrs += ` Angle="${c.angle}"`;
                else attrs += ` FieldOfView="${c.fov}"`;
                attrs += ` StartDelay="${c.startDelay}" Duration="${c.duration}" SingleUse="${c.singleUse}"`;
            }
            xml += `  <CameraTrigger${attrs} />\n`;
        }

        // 按钮序列和独立按钮
		for (const seq of this.buttonSequences) {
			let attrs = ` SequenceInOrder="${seq.sequenceInOrder}"`; // 没有 ID
			if (seq.affectMoving) attrs += ` AffectMovingPlatforms="${seq.affectMoving}"`;
			if (seq.affectBumpers) attrs += ` AffectBumpers="${seq.affectBumpers}"`;
			if (seq.triggerAchievements) attrs += ` TriggerAchievements="${seq.triggerAchievements}"`;
			if (seq.affectButtons) attrs += ` AffectButtons="${seq.affectButtons}"`;
			xml += `  <ButtonSequence${attrs}>\n`;
			for (const sub of seq.buttons) {
				let subAttrs = '';
				if (sub.id) subAttrs += ` ID="${sub.id}"`;
				subAttrs += ` Visible="${sub.visible !== null ? sub.visible : 'null'}"`;
				if (sub.movingPlatformID) {
					subAttrs += ` MovingPlatformID="${sub.movingPlatformID}"`;
				} else if (sub.position) {
					subAttrs += ` Position="${sub.position.x},${sub.position.y},${sub.position.z}"`;
				}
				xml += `    <Button${subAttrs} />\n`;
			}
			xml += `  </ButtonSequence>\n`;
		}

		// 在独立按钮循环中
		for (const btn of this.buttons) {
			let attrs = '';
			if (btn.id) attrs += ` ID="${btn.id}"`;
			attrs += ` Visible="${btn.visible !== null ? btn.visible : 'null'}" DisableCount="${btn.disableCount}" Mode="${btn.mode}"`;
			if (btn.movingPlatformID) {
				attrs += ` MovingPlatformID="${btn.movingPlatformID}"`;
			} else if (btn.x !== undefined && btn.y !== undefined && btn.z !== undefined) {
				attrs += ` Position="${btn.x},${btn.y},${btn.z}"`;
			}
			if (btn.affectMoving) attrs += ` AffectMovingPlatforms="${btn.affectMoving}"`;
			if (btn.affectBumpers) attrs += ` AffectBumpers="${btn.affectBumpers}"`;
			if (btn.triggerAchievements) attrs += ` TriggerAchievements="${btn.triggerAchievements}"`;
			if (btn.affectButtons) attrs += ` AffectButtons="${btn.affectButtons}"`;
			xml += `  <Button${attrs} />\n`;
		}

        // OtherCube 输出
		for (const oc of this.otherCubes) {
			let attrs = ` PositionTrigger="${oc.triggerX},${oc.triggerY},${oc.triggerZ}" PositionCube="${oc.cubeX},${oc.cubeY},${oc.cubeZ}"`;
			if (oc.radiusX > 0 || oc.radiusY > 0) attrs += ` Radius="${oc.radiusX},${oc.radiusY}"`;
			if (oc.movingBlockSync) attrs += ` MovingBlockSync="${oc.movingBlockSync}"`;
			// 注意：Mode 属性在二进制中不存在，因此不会输出（符合“空/默认不输出”原则）
			xml += `  <OtherCube${attrs}>\n`;
			for (const ke of oc.keyEvents) {
				xml += `    <${ke.dir}${ke.type} TimeOffset="${ke.timeOffset}" />\n`;
			}
			xml += `  </OtherCube>\n`;
		}

		// DarkCube 输出（相同结构）
		for (const dc of this.darkCubes) {
			let attrs = ` PositionTrigger="${dc.triggerX},${dc.triggerY},${dc.triggerZ}" PositionCube="${dc.cubeX},${dc.cubeY},${dc.cubeZ}"`;
			if (dc.radiusX > 0 || dc.radiusY > 0) attrs += ` Radius="${dc.radiusX},${dc.radiusY}"`;
			if (dc.movingBlockSync) attrs += ` MovingBlockSync="${dc.movingBlockSync}"`;
			xml += `  <DarkCube${attrs}>\n`;
			for (const ke of dc.keyEvents) {
				xml += `    <${ke.dir}${ke.type} TimeOffset="${ke.timeOffset}" />\n`;
			}
			xml += `  </DarkCube>\n`;
		}

        xml += `</Level>`;
        return xml;
    }
}

// 导出反编译函数
function decompileBin(buffer, baseName, options) {
    const decompiler = new EdgeDecompiler(buffer);
    if (options) {
        if (options.staticMovingToPng !== undefined) {
            decompiler.staticMovingToPng = !!options.staticMovingToPng;
        }
    }
    const result = decompiler.decompile();
    return result;
}