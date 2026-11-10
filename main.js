const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
// 允许 V8 使用最多 4GB 的堆内存
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');
let win = null;

// ★ 核心代码：强制把数据存到 exe 所在目录的 Data 文件夹
const exeDir = path.dirname(app.getPath('exe'));
const portableDataPath = path.join(exeDir, 'Editor_Data');

// 如果目录不存在则创建
if (!fs.existsSync(portableDataPath)) {
    fs.mkdirSync(portableDataPath, { recursive: true });
}

// 覆盖 Electron 的默认数据路径（必须在 app.whenReady() 之前调用）
app.setPath('userData', portableDataPath);

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.setMenuBarVisibility(false);
  win.loadFile('index.html');

  win.on('closed', () => {
    win = null;
  });

}

// 用于记录管理器窗口
let managerWin = null;

// 打开管理器
ipcMain.on('open-manager', () => {
    if (managerWin) { managerWin.focus(); return; }
    managerWin = new BrowserWindow({
        width: 900, height: 750, title: 'EDGE 关卡管理器',
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    managerWin.setMenuBarVisibility(false);
    managerWin.loadFile('./misc/level_manager.html');
    managerWin.on('closed', () => { managerWin = null; });
});

// 检查游戏目录合法性并返回 mapping 内容
ipcMain.handle('read-mapping', async (e, gameDir) => {
    const mappingPath = path.join(gameDir, 'levels', 'mapping.xml');
    if (!fs.existsSync(mappingPath)) return { success: false, msg: '未找到 mapping.xml' };
    try {
        return { success: true, content: fs.readFileSync(mappingPath, 'utf-8') };
    } catch (err) { return { success: false, msg: err.message }; }
});

// 保存 mapping 并清理/复制文件
ipcMain.handle('save-mapping', async (e, gameDir, content) => {
    const mappingPath = path.join(gameDir, 'levels', 'mapping.xml');
    try {
        fs.writeFileSync(mappingPath, content, 'utf-8');
        return { success: true };
    } catch (err) { return { success: false, msg: err.message }; }
});

// 在 main.js 的顶部引入 Buffer
// 之前已有的引用不需要动，把下面的 IPC 替换/新增进去

// ★ 新增：计算 ESO 文件名（与编译器完全一致的 CRC 算法）
// ★ 新增：计算 ESO 文件名（与编译器完全一致的 CRC 算法）
function generateEsoName(filename) {
    // ★ 极其安全：强制剔除可能带有的扩展名
    let pureName = filename.replace(/\.(bin|eso)$/i, '');

    const poly = 0xEDB88320;
    let crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let crc = i;
        for (let j = 0; j < 8; j++) crc = (crc & 1) ? ((crc >>> 1) ^ poly) : (crc >>> 1);
        crcTable[i] = crc;
    }
    const bytes = Buffer.from(pureName, 'utf-8');
    const reversed = Buffer.alloc(bytes.length);
    for (let i = 0; i < bytes.length; i++) reversed[i] = bytes[bytes.length - 1 - i];
    
    let crc = 0;
    for (let b of reversed) crc = (crc >>> 8) ^ crcTable[(crc ^ b) & 0xFF];
    
    // ★ 关键修复：使用 >>> 0 强制转为无符号32位正整数，避免出现负数
    crc = crc >>> 0;
    
    return crc.toString(16).toUpperCase().padStart(8, '0') + '050DB82A' + '.eso';
}

// 读取 BIN 文件头部的关卡名和 ID（极快，仅读前几十字节）
ipcMain.handle('read-bin-metadata', async (e, binPath) => {
    try {
        if (!fs.existsSync(binPath)) return null;
        const fd = fs.openSync(binPath, 'r');
        const buf = Buffer.alloc(8);
        fs.readSync(fd, buf, 0, 8, 0);
        const levelId = buf.readInt32LE(0);
        const nameLen = buf.readInt32LE(4);
        
        // 防止长度异常
        if (nameLen < 0 || nameLen > 1024) {
            fs.closeSync(fd);
            return { levelId, name: '未知(解析异常)' };
        }

        const nameBuf = Buffer.alloc(nameLen);
        fs.readSync(fd, nameBuf, 0, nameLen, 8);
        fs.closeSync(fd);
        return { levelId, name: nameBuf.toString('utf-8') };
    } catch (err) {
        return null;
    }
});

// ★ 修改：删除物理文件（自动处理对应的 ESO 文件名）
ipcMain.handle('delete-level-files', async (e, gameDir, filename) => {
    try {
        const binPath = path.join(gameDir, 'levels', filename + '.bin');
        const esoName = generateEsoName(filename);
        const esoPath = path.join(gameDir, 'models', esoName);
        
        if (fs.existsSync(binPath)) fs.unlinkSync(binPath);
        if (fs.existsSync(esoPath)) fs.unlinkSync(esoPath);
        return { success: true };
    } catch (err) { return { success: false, msg: err.message }; }
});

// ★ 从编辑器/管理器接收编译好的文件并保存到游戏目录
ipcMain.handle('install-level-to-game', async (e, gameDir, filename, binData, esoData) => {
    try {
        const binPath = path.join(gameDir, 'levels', filename + '.bin');
        const binDir = path.dirname(binPath);
        if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });
        fs.writeFileSync(binPath, Buffer.from(binData));
        
        if (esoData && esoData.length > 0) {
            // ★ 使用计算出的正确 CRC 文件名
            const esoName = generateEsoName(filename);
            const esoPath = path.join(gameDir, 'models', esoName);
            const esoDir = path.dirname(esoPath);
            if (!fs.existsSync(esoDir)) fs.mkdirSync(esoDir, { recursive: true });
            fs.writeFileSync(esoPath, Buffer.from(esoData));
        }
        return { success: true };
    } catch (err) { return { success: false, msg: err.message }; }
});

// 读取 bin 文件并发送给主编辑器
ipcMain.handle('read-bin-file', async (e, gameDir, filename) => {
    try {
        const binPath = path.join(gameDir, 'levels', filename + '.bin');
        return { success: true, buffer: fs.readFileSync(binPath) };
    } catch (err) { return { success: false, msg: err.message }; }
});


app.whenReady().then(() => {
  createWindow();
  
  // 拦截所有浏览器默认下载
  session.defaultSession.on('will-download', (event, item, webContents) => {
    const fs = require('fs');
    const path = require('path');
    
    // 获取当前 exe 所在目录
    const exeDir = path.dirname(app.getPath('exe'));
    const exportDir = path.join(exeDir, 'Export_Data');
    
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    const filename = item.getFilename();
    const savePath = path.join(exportDir, filename);
    
    // 强制设置保存路径
    item.setSavePath(savePath);
    
    item.once('done', (event, state) => {
      if (state === 'completed') {
        console.log(`✅ 文件已自动保存至: ${savePath}`);
        // ★ 新增：通知前端下载完成
        if (win && !win.isDestroyed()) {
          win.webContents.send('download-finished', filename, savePath);
        }
      }
    });
  });
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 文件选择与保存 IPC
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog(win, { properties: ['openFile'] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('save-file', async (event, { defaultName, customDir, buffer }) => {
  try {
    let filePath;
    if (customDir && fs.existsSync(customDir)) {
      filePath = path.join(customDir, defaultName);
    } else {
      const result = await dialog.showSaveDialog(win, { defaultPath: defaultName });
      if (result.canceled) return { success: false, error: 'canceled' };
      filePath = result.filePath;
    }
    fs.writeFileSync(filePath, Buffer.from(buffer));
    return { success: true, path: filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.on('launch-game', async (event, exePath) => {
  shell.openPath(exePath);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});


// ★ 新增：启动外部 Python 录制器的 IPC
ipcMain.on('launch-python-recorder', (event) => {
    try {
        // 判断是否为打包环境，正确获取 exe 路径
        const isPackaged = app.isPackaged;
        // 开发环境在根目录，打包后一般放在 resources 里
        const exePath = isPackaged 
            ? path.join(process.resourcesPath, './misc/KeyEvent_recorder.exe') 
            : path.join(__dirname, './misc/KeyEvent_recorder.exe');

        // 启动外部程序
        spawn(exePath, [], { 
            detached: true, 
            stdio: 'ignore',
            cwd: path.dirname(exePath) // 确保它能在自己目录下找到所需文件
        }).unref();
        
        console.log('✅ Python 录制器已启动');
    } catch (err) {
        console.error('启动 Python 录制器失败:', err);
    }
});

// 编辑器 -> 管理器
ipcMain.on('push-level-to-manager', (e, filename, binData, esoData) => {
    if (!managerWin) {
        // 如果管理器没打开，就先打开它
        ipcMain.emit('open-manager');
        // 等待窗口加载完成后再发送
        managerWin.webContents.on('did-finish-load', () => {
            managerWin.webContents.send('install-from-editor', filename, binData, esoData);
        });
    } else {
        managerWin.focus();
        managerWin.webContents.send('install-from-editor', filename, binData, esoData);
    }
});

// 管理器 -> 编辑器 (反编译)
ipcMain.on('trigger-decompile-in-editor', (e, buffer, filename) => {
    if (win && !win.isDestroyed()) {
        win.focus();
        win.webContents.send('receive-decompile-request', Array.from(new Uint8Array(buffer)), filename);
    }
});