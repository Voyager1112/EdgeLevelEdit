// ─────────────────────────────────────────────────────────────
// append-only WAL + 快照 compaction
// + 多窗口适配：主窗口 WAL / 同源子窗口代理 / 跨域子窗口原生
//
// 窗口角色：
//   main     无 window.opener → 完整 WAL 模式
//   child    有 opener 且同源 → 动态代理到 opener.localStorage
//            （getter 惰性取，避免主窗口尚未劫持完成时的 race）
//   cross    有 opener 但访问抛 SecurityError → 保留原生 localStorage
//
// 前提假设：子窗口通过 window.open / <a target=_blank> 打开。
// 若子窗口是 webContents.setWindowOpenHandler 里新建且未保留
// opener 关系的 BrowserWindow，会被误判为 main → 各自独立 WAL，
// 数据不共享。此时应在 setWindowOpenHandler 中保留 opener，
// 或改用"主进程唯一写入者 + IPC 广播"。
// ─────────────────────────────────────────────────────────────

(function () {
    'use strict';

    if (window.__electronStorageInstalled) {
        console.warn('[electron-storage] 已安装，跳过重复初始化');
        return;
    }

    // ==================== 1. 窗口角色检测 ====================
    let isChild = false;
    let openerAccessible = false;
    try {
        if (window.opener && window.opener !== window) {
            isChild = true;
            // 试访问，跨域会抛 SecurityError
            void window.opener.localStorage;
            openerAccessible = true;
        }
    } catch (_) {
        isChild = true;
        openerAccessible = false;
    }

    // ---- 1a. 跨域子窗口：保留原生 localStorage ----
    if (isChild && !openerAccessible) {
        console.log('[electron-storage] 跨域子窗口，使用原生 localStorage');
        return;
    }

    // ---- 1b. 同源子窗口：动态代理到 opener.localStorage ----
    if (isChild) {
        // 提前保存原生引用作为 opener 消失后的 fallback
        let nativeLS = null;
        try { nativeLS = window.localStorage; } catch (_) { nativeLS = null; }

        // 内存兜底（原生不可用时）
        const memMap = Object.create(null);
        const memFallback = {
            getItem(k) {
                k = String(k);
                return Object.prototype.hasOwnProperty.call(memMap, k) ? memMap[k] : null;
            },
            setItem(k, v) { memMap[String(k)] = String(v); },
            removeItem(k) { delete memMap[String(k)]; },
            clear() { for (const k in memMap) delete memMap[k]; },
            key(i) {
                const keys = Object.keys(memMap);
                i = Number(i);
                if (!Number.isInteger(i) || i < 0 || i >= keys.length) return null;
                return keys[i];
            },
            get length() { return Object.keys(memMap).length; },
        };

        try {
            Object.defineProperty(window, 'localStorage', {
                // 用 getter 而不是固定引用：主窗口可能晚于子窗口完成劫持，
                // 每次访问都取最新的 opener.localStorage
                get() {
                    try {
                        const s = window.opener && window.opener.localStorage;
                        if (s) return s;
                    } catch (_) { /* 跨域 / opener 已销毁 */ }
                    // 主窗口已关闭 → fallback
                    return nativeLS || memFallback;
                },
                configurable: true,
            });
            window.__electronStorageInstalled = true;
            console.log('[electron-storage] 同源子窗口，代理到主窗口 localStorage');
        } catch (e) {
            console.error('[electron-storage] 子窗口代理失败:', e);
        }
        return; // 子窗口到此结束，不维护 WAL
    }

    // ==================== 2. 主窗口：WAL 模式 ====================
    let fs, path;
    try {
        fs = require('fs');
        path = require('path');
    } catch (e) {
        console.log('⚠️ 非 Electron / 无 Node 环境，继续使用浏览器原生 localStorage。');
        return;
    }

    // ---- 配置 ----
    const CONFIG = {
        dirName: 'EdgeEditor_Data',
        snapshotName: 'localStorage.json',
        walName: 'localStorage.wal.jsonl',
        walCompactBytes: 2 * 1024 * 1024,
        flushDebounceMs: 150,
        debug: false,
    };

    function log(...args) {
        if (CONFIG.debug) console.log('[electron-storage]', ...args);
    }

    // ---- 数据目录 ----
    let dataDir;
    try {
        const base = (typeof window.__ELECTRON_USER_DATA__ === 'string'
                && window.__ELECTRON_USER_DATA__)
            || process.cwd();
        if (!window.__ELECTRON_USER_DATA__) {
            console.warn('[electron-storage] 未注入 __ELECTRON_USER_DATA__，'
                + '回退到 process.cwd()，打包后数据目录可能漂移');
        }
        dataDir = path.join(base, CONFIG.dirName);
    } catch (e) {
        console.error('[electron-storage] 解析数据目录失败:', e);
        return;
    }

    try {
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
    } catch (e) {
        console.error('[electron-storage] 创建数据目录失败，放弃劫持:', e);
        return;
    }

    const snapshotFile    = path.join(dataDir, CONFIG.snapshotName);
    const snapshotTmpFile = snapshotFile + '.tmp';
    const snapshotBakFile = snapshotFile + '.bak';
    const walFile         = path.join(dataDir, CONFIG.walName);

    // ---- 内存数据（无原型，避免 __proto__ 污染） ----
    let storageData = Object.create(null);

    // ---- 原子写快照：tmp + fsync + rename ----
    function atomicWriteSnapshot(data) {
        const json = JSON.stringify(data);
        const fd = fs.openSync(snapshotTmpFile, 'w');
        try {
            fs.writeFileSync(fd, json, 'utf-8');
            fs.fsyncSync(fd);
        } finally {
            fs.closeSync(fd);
        }
        try {
            if (fs.existsSync(snapshotFile)) {
                fs.copyFileSync(snapshotFile, snapshotBakFile);
            }
        } catch (e) {
            log('备份快照失败（忽略）:', e.message);
        }
        fs.renameSync(snapshotTmpFile, snapshotFile);
    }

    // ---- 加载快照（主文件损坏回退 .bak） ----
    function tryLoadSnapshotFile(file) {
        if (!fs.existsSync(file)) return null;
        try {
            const text = fs.readFileSync(file, 'utf-8');
            if (!text.trim()) return Object.create(null);
            const parsed = JSON.parse(text);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error('快照格式不是普通对象');
            }
            const out = Object.create(null);
            for (const k of Object.keys(parsed)) out[k] = String(parsed[k]);
            return out;
        } catch (e) {
            console.error('[electron-storage] 快照解析失败:', file, e.message);
            return null;
        }
    }

    function loadSnapshot() {
        let data = tryLoadSnapshotFile(snapshotFile);
        if (data === null) {
            console.warn('[electron-storage] 主快照损坏，尝试 .bak');
            data = tryLoadSnapshotFile(snapshotBakFile);
            if (data !== null) {
                console.warn('[electron-storage] 已从 .bak 恢复');
            } else {
                console.warn('[electron-storage] .bak 不可用，从空数据开始');
                data = Object.create(null);
            }
            try {
                if (fs.existsSync(snapshotFile)) {
                    fs.renameSync(snapshotFile,
                        snapshotFile + '.corrupt.' + Date.now());
                }
            } catch (_) { /* ignore */ }
        }
        storageData = data;
    }

    // ---- 重放 WAL（末尾半行自动丢弃） ----
    function replayWal(applyFn) {
        if (!fs.existsSync(walFile)) return;
        let text;
        try {
            text = fs.readFileSync(walFile, 'utf-8');
        } catch (e) {
            console.error('[electron-storage] 读取 WAL 失败:', e);
            return;
        }
        let start = 0, count = 0, skipped = 0;
        for (let i = 0; i < text.length; i++) {
            if (text.charCodeAt(i) !== 10) continue;
            const line = text.slice(start, i);
            start = i + 1;
            if (!line) continue;
            let rec;
            try { rec = JSON.parse(line); } catch (_) { skipped++; continue; }
            if (Array.isArray(rec) && rec.length === 2 && typeof rec[0] === 'string') {
                applyFn(rec[0], rec[1]);
                count++;
            } else {
                skipped++;
            }
        }
        log('重放 WAL：应用', count, '条，跳过', skipped, '条');
    }

    loadSnapshot();
    replayWal((k, v) => {
        if (v === null) delete storageData[k];
        else storageData[k] = String(v);
    });

    // ---- WAL 写入（微批 append） ----
    let pendingOps = [];
    let flushTimer = null;
    let compactScheduled = false;
    let compacting = false;

    function dropPendingOp(key) {
        for (let i = pendingOps.length - 1; i >= 0; i--) {
            if (pendingOps[i][0] === key) pendingOps.splice(i, 1);
        }
    }

    function enqueueOp(key, value) {
        dropPendingOp(key);
        pendingOps.push([key, value]);
        scheduleFlush();
    }

    function scheduleFlush() {
        if (flushTimer) return;
        flushTimer = setTimeout(() => {
            flushTimer = null;
            flushNow();
        }, CONFIG.flushDebounceMs);
    }

    function flushNow() {
        if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
        }
        if (pendingOps.length === 0) return;

        const ops = pendingOps;
        pendingOps = [];

        let chunk = '';
        for (let i = 0; i < ops.length; i++) {
            chunk += JSON.stringify([ops[i][0], ops[i][1]]) + '\n';
        }

        try {
            fs.appendFileSync(walFile, chunk, 'utf-8');
        } catch (e) {
            console.error('[electron-storage] WAL 写入失败，回滚并重试:', e);
            pendingOps = ops.concat(pendingOps);
            setTimeout(scheduleFlush, 500);
            return;
        }

        maybeCompact();
    }

    // ---- Compaction ----
    function truncateWal() {
        const fd = fs.openSync(walFile, 'w');
        try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    }

    function maybeCompact() {
        if (compacting || compactScheduled) return;
        let size;
        try { size = fs.statSync(walFile).size; } catch (_) { return; }
        if (size < CONFIG.walCompactBytes) return;

        compactScheduled = true;
        setTimeout(() => {
            compactScheduled = false;
            doCompact();
        }, 0);
    }

    function doCompact() {
        if (compacting) return;
        compacting = true;
        try {
            flushNow();
            atomicWriteSnapshot(storageData);
            truncateWal();
            log('compaction 完成，条目数:', Object.keys(storageData).length);
        } catch (e) {
            console.error('[electron-storage] compaction 失败:', e);
        } finally {
            compacting = false;
        }
    }

    // ---- localStorage API ----
    const api = {
        getItem(key) {
            key = String(key);
            return Object.prototype.hasOwnProperty.call(storageData, key)
                ? storageData[key]
                : null;
        },
        setItem(key, value) {
            key = String(key);
            const sv = String(value);
            if (Object.prototype.hasOwnProperty.call(storageData, key)
                && storageData[key] === sv) return;
            storageData[key] = sv;
            enqueueOp(key, sv);
        },
        removeItem(key) {
            key = String(key);
            if (!Object.prototype.hasOwnProperty.call(storageData, key)) return;
            delete storageData[key];
            enqueueOp(key, null);
        },
        clear() {
            if (flushTimer) {
                clearTimeout(flushTimer);
                flushTimer = null;
            }
            pendingOps = [];
            storageData = Object.create(null);
            try {
                atomicWriteSnapshot(storageData);
                truncateWal();
            } catch (e) {
                console.error('[electron-storage] clear 失败:', e);
            }
        },
        key(index) {
            const keys = Object.keys(storageData);
            const i = Number(index);
            if (!Number.isInteger(i) || i < 0 || i >= keys.length) return null;
            return keys[i];
        },
        get length() {
            return Object.keys(storageData).length;
        },
        flushNow,
    };

    // ---- 劫持 ----
    try {
        Object.defineProperty(window, 'localStorage', {
            value: api,
            writable: false,
            configurable: true,
        });
        window.__electronStorageInstalled = true;
    } catch (e) {
        console.error('[electron-storage] 劫持 localStorage 失败:', e);
        return;
    }

    // ---- 退出前 flush ----
    //window.addEventListener('beforeunload', flushNow);
    window.addEventListener('beforeunload', () => {
        if(_saveTimer){
            clearTimeout(_saveTimer);
            _saveTimer = null;
            doRealSaveCache();
        }
        // 同时调用storage层flushNow，把storage内部pendingOps立刻写入wal
        if(window.localStorage && typeof window.localStorage.flushNow === 'function'){
            window.localStorage.flushNow();
        }
        if (window.PM && window.PM.sync) window.PM.sync();
    });

    window.addEventListener('pagehide', flushNow);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushNow();
    });

    log('✅ Electron 本地存储已就绪（WAL 模式）');
    log('   数据目录:', dataDir);
    log('   WAL 阈值:', (CONFIG.walCompactBytes / 1024 / 1024).toFixed(1), 'MB');
})();