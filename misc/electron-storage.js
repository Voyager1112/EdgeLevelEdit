// electron-storage.js
try {
    const fs = require('fs');
    const path = require('path');
    
    // 获取系统专属的数据存储目录 (例如 C:\Users\名字\AppData\Roaming\你的应用)
    // 如果你没打包，它会存到当前项目目录下的 .data 文件夹里
    const isPackaged = typeof process !== 'undefined' && process.type === 'browser';
    const userDataPath = isPackaged ? process.env.APPDATA : __dirname;
    // 使用软件当前运行目录 (process.cwd()) 或者 main.js 所在目录
    const dataDir = path.join(process.cwd(), 'EdgeEditor_Data'); 
    const dbFile = path.join(dataDir, 'localStorage.json');
    // 确保文件夹存在
    if (!fs.existsSync(dataDir)) {
        try { fs.mkdirSync(dataDir, { recursive: true }); } catch(e) { console.error(e); }
    }

    // 读取本地文件并加载到内存
    let storageData = {};
    if (fs.existsSync(dbFile)) {
        try {
            storageData = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
        } catch (e) {
            console.error('读取本地存储文件失败:', e);
        }
    }

    // 写入文件的方法
    function saveToFile() {
        try {
            fs.writeFileSync(dbFile, JSON.stringify(storageData), 'utf-8');
        } catch (e) {
            console.error('保存本地文件失败:', e);
        }
    }

    // ★ 核心：劫持原生的 localStorage 对象
    Object.defineProperty(window, 'localStorage', {
        value: {
            getItem: function(key) {
                return storageData[key] !== undefined ? storageData[key] : null;
            },
            setItem: function(key, value) {
                storageData[key] = String(value);
                saveToFile();
            },
            removeItem: function(key) {
                delete storageData[key];
                saveToFile();
            },
            clear: function() {
                storageData = {};
                saveToFile();
            },
            key: function(index) {
                return Object.keys(storageData)[index] || null;
            },
            get length() {
                return Object.keys(storageData).length;
            }
        },
        writable: false,
        configurable: false
    });

    console.log('✅ Electron 本地大容量存储劫持成功！');
} catch (e) {
    console.log('⚠️ 非 Electron 环境，继续使用浏览器原生 localStorage。');
}