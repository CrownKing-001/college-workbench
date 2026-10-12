// 大学日程 · 桌面工作台 —— Electron 主进程（绿色便携版）
// 数据以 JSON 文件保存在便携 exe 同级的 data 目录，方便备份 / 拷贝 / U 盘随身带。
const { app, BrowserWindow, ipcMain, Tray, Menu, Notification, shell, dialog, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// 禁用 GPU 硬件加速：在无独显 / 虚拟机 / 远程桌面 / 显卡驱动异常的环境里，
// Chromium 的 GPU 进程可能无法启动，直接以「GPU process isn't usable. Goodbye.」退出。
// 本应用是工具类界面，软件渲染完全够用，禁用后启动更稳，也避免 GPU 缓存被争用报错。
//
// 说明：这一组开关是「先保证能开」的保守设置。曾试过按 1.6.1 的做法把它们全部去掉
// （改用硬件加速），结果用户在部分机器上表现为「打不开」。启动可靠性优先于渲染性能，
// 所以恢复为默认关闭硬件加速。确实想试硬件加速：set UD_HW_ACCEL=1 再启动。
if (process.env.UD_HW_ACCEL !== '1') {
  app.disableHardwareAcceleration();
  // 光 disableHardwareAcceleration 还不够：Electron 44 的 Dawn/WebGPU 后端仍会拉起 GPU 进程。
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
}

// ── 早期初始化：userData 与缓存目录 ────────────────────────
// 必须在 app ready 之前设定。
//
// 注意：这里**不能**用便携 exe 同级的 data 目录当 userData ——
// Chromium 会往 userData 里塞 Cache / GPUCache / Local Storage / Preferences 等
// 一大堆 profile 文件，混进 data/ 会把用户真正要备份的 JSON 淹掉。
// 所以 profile 统一放 data/profile/ 子目录，data/ 根下只留可读的 JSON 与照片。
function earlyUserDataDir() {
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  const base = portableDir
    ? path.join(portableDir, 'data', 'profile')
    : path.join(process.env.APPDATA || os.homedir(), '大学日程', 'profile');
  const candidates = [base, path.join(os.tmpdir(), 'university-desk-profile')];
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const probe = path.join(dir, '.probe');
      fs.writeFileSync(probe, 'ok');
      fs.unlinkSync(probe);
      return dir;
    } catch {
      /* 试下一个 */
    }
  }
  return path.join(os.tmpdir(), 'university-desk-profile');
}

const USER_DATA = earlyUserDataDir();
app.setPath('userData', USER_DATA);
app.setPath('cache', path.join(USER_DATA, 'cache'));
app.commandLine.appendSwitch('disk-cache-dir', path.join(USER_DATA, 'cache'));

// ── 便携模式：数据目录固定在「真正的 exe」旁边 ──────────────
// electron-builder 的 portable 目标会把程序解压到 %TEMP% 下的随机目录再运行，
// 此时 app.getPath('exe') 指向的是临时副本——数据放那儿一退出就没了。
// 它会注入 PORTABLE_EXECUTABLE_DIR（便携 exe 所在的真实目录），优先用它。
function resolveDataDir() {
  const candidates = [];
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (portableDir) candidates.push(path.join(portableDir, 'data'));
  if (app.isPackaged) candidates.push(path.join(path.dirname(app.getPath('exe')), 'data'));
  candidates.push(path.resolve(__dirname, '..', 'data'));

  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      // 真正验证可写：目录存在但只读（U 盘写保护 / 光盘）时要换地方
      const probe = path.join(dir, '.write-probe');
      fs.writeFileSync(probe, 'ok');
      fs.unlinkSync(probe);
      return dir;
    } catch {
      /* 试下一个 */
    }
  }

  // 全都不行：退回用户数据目录，至少保证能存
  const fallback = path.join(app.getPath('userData'), 'data');
  try {
    fs.mkdirSync(fallback, { recursive: true });
  } catch {
    /* ignore */
  }
  return fallback;
}

const DATA_DIR = resolveDataDir();

function ensureDataDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('[data] 无法创建数据目录:', err);
  }
}

const storeFile = (key) => path.join(DATA_DIR, `${String(key).replace(/[^\w.-]/g, '_')}.json`);

function readKey(key, fallback) {
  try {
    const raw = fs.readFileSync(storeFile(key), 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeKey(key, value) {
  ensureDataDir();
  const target = storeFile(key);
  const tmp = `${target}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(tmp, target); // 原子写入，防止断电损坏
    return true;
  } catch (err) {
    console.error('[data] 写入失败:', key, err);
    return false;
  }
}

// ── 窗口 ────────────────────────────────────────────────
let mainWindow = null;
let tray = null;
let isQuitting = false;

const ICON_PATH = path.join(__dirname, 'build', 'icon.ico');
const PNG_PATH = path.join(__dirname, 'build', 'icon.png');

function iconImage() {
  for (const p of [ICON_PATH, PNG_PATH]) {
    if (fs.existsSync(p)) {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) return img;
    }
  }
  return undefined;
}

function createWindow() {
  const t0 = Date.now();
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#12161d',
    title: '大学日程 · 桌面工作台',
    icon: iconImage(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      // 启动优化：窗口加载期间不可见时，后台节流会把首屏渲染拖慢，显式关掉
      backgroundThrottling: false,
    },
  });

  const marks = { 窗口创建: `${Date.now() - t0} ms` };

  mainWindow.once('ready-to-show', () => {
    marks.窗口可见 = `${Date.now() - t0} ms`;
    mainWindow.show();
    if (process.env.UD_DEVTOOLS === '1') mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  mainWindow.webContents.once('did-finish-load', () => {
    marks.页面加载完成 = `${Date.now() - t0} ms`;
  });

  // 关闭 = 收进托盘，不退出（工作台常驻）
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  const devUrl = process.env.UD_DEV_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // 测量模式：等渲染进程把首屏可用时间回传后写文件退出
  if (process.env.UD_MEASURE === '1') {
    ipcMain.once('measure:report', (_e, payload) => {
      marks.首屏可用 = `${payload.ready} ms（渲染进程自测）`;
      try {
        fs.writeFileSync(
          path.join(__dirname, '..', '.startup.json'),
          JSON.stringify(marks, null, 2),
          'utf8'
        );
      } catch { /* ignore */ }
      setTimeout(() => app.exit(0), 200);
    });
  }

  // 外部链接交给系统浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // 内容安全策略：只允许加载本地打包资源，禁止 eval 与远程脚本
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; " +
          "base-uri 'none'; form-action 'none'",
        ],
      },
    });
  });
}

function showWindow() {
  if (!mainWindow) return createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  const img = iconImage();
  if (!img) return;
  tray = new Tray(img.resize({ width: 16, height: 16 }));
  tray.setToolTip('大学日程 · 桌面工作台');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开工作台', click: showWindow },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on('double-click', showWindow);
}

// ── IPC：数据读写 ────────────────────────────────────────
ipcMain.handle('store:get', (_e, key, fallback) => readKey(key, fallback));
ipcMain.handle('store:set', (_e, key, value) => writeKey(key, value));
ipcMain.handle('store:all', () => {
  ensureDataDir();
  const out = {};
  try {
    for (const f of fs.readdirSync(DATA_DIR)) {
      if (!f.endsWith('.json')) continue;
      const key = f.replace(/\.json$/, '');
      out[key] = readKey(key, null);
    }
  } catch {
    /* 目录还不存在 */
  }
  return out;
});
ipcMain.handle('store:replaceAll', (_e, obj) => {
  if (!obj || typeof obj !== 'object') return false;
  ensureDataDir();
  for (const [key, value] of Object.entries(obj)) writeKey(key, value);
  return true;
});
ipcMain.handle('store:dir', () => DATA_DIR);
ipcMain.handle('store:openDir', async () => {
  ensureDataDir();
  await shell.openPath(DATA_DIR);
  return DATA_DIR;
});

// ── IPC：饮食照片 ─────────────────────────────────────────
// 照片按 YYYY-MM 分文件夹存在 data/photos 下，文件名带日期与时间戳。
const PHOTO_DIR = path.join(DATA_DIR, 'photos');

function ensurePhotoDir(sub) {
  const dir = sub ? path.join(PHOTO_DIR, sub) : PHOTO_DIR;
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    console.error('[photo] 无法创建目录:', err);
  }
  return dir;
}

/** 把 dataURL 或文件路径的图片存进 data/photos，返回相对路径 */
ipcMain.handle('photo:save', async (_e, { dataUrl, dateKey, ext }) => {
  try {
    if (typeof dataUrl !== 'string') return { ok: false, error: '无效的图片数据' };
    const m = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!m) return { ok: false, error: '只支持 dataURL 格式的图片' };
    const realExt = (ext || m[1] || 'jpg').replace('jpeg', 'jpg');
    const month = (dateKey || new Date().toISOString().slice(0, 10)).slice(0, 7);
    const dir = ensurePhotoDir(month);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `${dateKey || 'photo'}_${stamp}.${realExt}`;
    const full = path.join(dir, name);
    fs.writeFileSync(full, Buffer.from(m[2], 'base64'));
    // 返回相对于 data 的路径，便于随 data 一起搬走
    return { ok: true, relPath: path.join('photos', month, name), size: fs.statSync(full).size };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

/** 选图片文件（可多选），拷进 data/photos */
ipcMain.handle('photo:pick', async (_e, { dateKey } = {}) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: '选择饮食照片',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic'] }],
  });
  if (canceled || !filePaths?.length) return { ok: false, canceled: true };

  const month = (dateKey || new Date().toISOString().slice(0, 10)).slice(0, 7);
  const dir = ensurePhotoDir(month);
  const saved = [];
  for (const src of filePaths) {
    try {
      const ext = (path.extname(src).slice(1) || 'jpg').toLowerCase();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const base = path.basename(src, path.extname(src)).replace(/[^\w\u4e00-\u9fff-]/g, '_').slice(0, 40);
      const name = `${dateKey || 'photo'}_${stamp}_${base}.${ext}`;
      const full = path.join(dir, name);
      fs.copyFileSync(src, full);
      saved.push({ relPath: path.join('photos', month, name), size: fs.statSync(full).size });
    } catch (err) {
      console.error('[photo] 拷贝失败:', src, err);
    }
  }
  return saved.length ? { ok: true, files: saved } : { ok: false, error: '没有成功保存任何图片' };
});

/** 读回照片为 dataURL，供界面预览 */
ipcMain.handle('photo:read', async (_e, relPath) => {
  try {
    const full = path.join(DATA_DIR, relPath);
    // 防目录穿越：解析后必须仍在 data 目录内
    if (!path.resolve(full).startsWith(path.resolve(DATA_DIR))) {
      return { ok: false, error: '非法路径' };
    }
    if (!fs.existsSync(full)) return { ok: false, error: '文件不存在' };
    const ext = path.extname(full).slice(1).toLowerCase() || 'jpeg';
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    const b64 = fs.readFileSync(full).toString('base64');
    return { ok: true, dataUrl: `data:image/${mime};base64,${b64}` };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('photo:delete', async (_e, relPath) => {
  try {
    const full = path.join(DATA_DIR, relPath);
    if (!path.resolve(full).startsWith(path.resolve(DATA_DIR))) return false;
    if (fs.existsSync(full)) fs.unlinkSync(full);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('photo:openDir', async () => {
  ensurePhotoDir();
  await shell.openPath(PHOTO_DIR);
  return PHOTO_DIR;
});

/** 用系统看图程序打开某张照片 */
ipcMain.handle('photo:open', async (_e, relPath) => {
  const full = path.join(DATA_DIR, relPath);
  if (!path.resolve(full).startsWith(path.resolve(DATA_DIR))) return false;
  if (!fs.existsSync(full)) return false;
  await shell.openPath(full);
  return true;
});

/** 统计照片占用空间 */
ipcMain.handle('photo:usage', () => {
  try {
    let count = 0;
    let bytes = 0;
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else {
          count++;
          bytes += fs.statSync(p).size;
        }
      }
    };
    if (fs.existsSync(PHOTO_DIR)) walk(PHOTO_DIR);
    return { count, bytes };
  } catch {
    return { count: 0, bytes: 0 };
  }
});

// ── IPC：导入 / 导出 ─────────────────────────────────────
ipcMain.handle('backup:export', async (_e, payload) => {
  const stamp = new Date().toISOString().slice(0, 10);
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: '导出工作台数据',
    defaultPath: path.join(app.getPath('documents'), `大学日程备份-${stamp}.json`),
    filters: [{ name: 'JSON 备份', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  try {
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    return { ok: true, filePath };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('backup:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: '选择备份文件',
    properties: ['openFile'],
    filters: [{ name: 'JSON 备份', extensions: ['json'] }],
  });
  if (canceled || !filePaths?.length) return { ok: false, canceled: true };
  try {
    const data = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
    return { ok: true, data, filePath: filePaths[0] };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// ── IPC：校历图片识别 ─────────────────────────────────────
// 图片先拷进 data/calendars，再交给 Windows 内置 OCR 识别，
// 这样识别结果和原图都能随 data 目录一起备份 / 搬走。
const CALENDAR_DIR = path.join(DATA_DIR, 'calendars');

function ensureCalendarDir() {
  try {
    fs.mkdirSync(CALENDAR_DIR, { recursive: true });
  } catch (err) {
    console.error('[calendar] 无法创建目录:', err);
  }
  return CALENDAR_DIR;
}

/** 把一张图片存进 data/calendars，返回相对路径 */
function storeCalendarImage(src) {
  const dir = ensureCalendarDir();
  const ext = (path.extname(src).slice(1) || 'jpg').toLowerCase();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const base = path
    .basename(src, path.extname(src))
    .replace(/[^\w\u4e00-\u9fff-]/g, '_')
    .slice(0, 30);
  const name = `calendar_${stamp}_${base}.${ext}`;
  const full = path.join(dir, name);
  fs.copyFileSync(src, full);
  return { relPath: path.join('calendars', name), absPath: full, size: fs.statSync(full).size };
}

/** 弹框选一张校历图片 */
ipcMain.handle('calendar:pick', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: '选择校历图片',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }],
  });
  if (canceled || !filePaths?.length) return { ok: false, canceled: true };
  try {
    return { ok: true, ...storeCalendarImage(filePaths[0]) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

/** 导入拖拽进来的图片路径 */
ipcMain.handle('calendar:import', async (_e, { srcPath } = {}) => {
  try {
    if (!srcPath || !fs.existsSync(srcPath)) return { ok: false, error: '文件不存在' };
    return { ok: true, ...storeCalendarImage(srcPath) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

/** 对已保存的校历图片跑 OCR */
ipcMain.handle('calendar:ocr', async (_e, { relPath, scale } = {}) => {
  try {
    const abs = path.isAbsolute(relPath || '') ? relPath : path.join(DATA_DIR, relPath || '');
    if (!fs.existsSync(abs)) return { ok: false, error: '图片不存在：' + abs };
    const { runOcr } = require('./ocr.cjs');
    const result = runOcr(abs, { scale: scale || 3 });
    return { ...result, relPath };
  } catch (err) {
    console.error('[calendar] OCR 失败:', err);
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

/** 读回校历图片本身（前端展示用） */
ipcMain.handle('calendar:read', async (_e, relPath) => {
  try {
    const abs = path.isAbsolute(relPath || '') ? relPath : path.join(DATA_DIR, relPath || '');
    if (!fs.existsSync(abs)) return { ok: false, error: '图片不存在' };
    const ext = path.extname(abs).slice(1).toLowerCase();
    const mime =
      ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'bmp' ? 'image/bmp' : 'image/jpeg';
    const buf = fs.readFileSync(abs);
    return { ok: true, dataUrl: `data:${mime};base64,${buf.toString('base64')}` };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('calendar:openDir', async () => {
  ensureCalendarDir();
  const err = await shell.openPath(CALENDAR_DIR);
  return { ok: !err, error: err || null };
});

/**
 * 课表图片识别：同一张图，换一套抽取规则，产出结构化的课程候选。
 * 与 calendar:ocr 共用底层 Windows.Media.Ocr，只是后处理不同
 * （校历抽「关键日期」，课表抽「网格里的课程」）。
 * periods 是用户自定义的作息时间表（每节课上下课时间），缺省时用内置通用作息。
 */
ipcMain.handle('calendar:timetable', async (_e, { relPath, scale, periods } = {}) => {
  try {
    const abs = path.isAbsolute(relPath || '') ? relPath : path.join(DATA_DIR, relPath || '');
    if (!fs.existsSync(abs)) return { ok: false, error: '图片不存在：' + abs };
    const { runTimetableOcr } = require('./timetable.cjs');
    const result = runTimetableOcr(abs, { scale: scale || 3, periods });
    return { ...result, relPath };
  } catch (err) {
    console.error('[timetable] OCR 失败:', err);
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

// ── IPC：系统通知 / 窗口控制 ─────────────────────────────
ipcMain.handle('notify', (_e, { title, body } = {}) => {
  if (!Notification.isSupported()) return false;
  const n = new Notification({
    title: title || '大学日程',
    body: body || '',
    icon: iconImage(),
    silent: false,
  });
  n.on('click', showWindow);
  n.show();
  return true;
});

ipcMain.handle('win:minimize', () => mainWindow?.minimize());
ipcMain.handle('win:toggleMaximize', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return mainWindow.isMaximized();
});
ipcMain.handle('win:hide', () => mainWindow?.hide());
ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  dataDir: DATA_DIR,
  portable: app.isPackaged,
}));

// ── 生命周期 ────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.whenReady().then(async () => {
    ensureDataDir();
    app.setAppUserModelId('com.collegedesk.app');

    // 冒烟测试模式：跑完自动退出，不创建托盘
    if (process.env.UD_SMOKE === '1') {
      try {
        const { runSmoke } = require('./smoke.cjs');
        const code = await runSmoke(app, BrowserWindow);
        app.exit(code);
      } catch (err) {
        console.error('冒烟测试异常:', err);
        app.exit(2);
      }
      return;
    }

    // 暗色主题校验模式：确认配色真的生效、对比度达标
    if (process.env.UD_DARKCHECK === '1') {
      try {
        const { runDarkCheck } = require('./dark-check.cjs');
        const code = await runDarkCheck(app, BrowserWindow);
        app.exit(code);
      } catch (err) {
        console.error('暗色校验异常:', err);
        app.exit(3);
      }
      return;
    }

    // 逐页截图模式：给每个视图在深/浅主题下各截一张，用于人工检查 UI
    if (process.env.UD_SHOTS === '1') {
      try {
        const { runShots } = require('./shots.cjs');
        const code = await runShots(app, BrowserWindow);
        app.exit(code);
      } catch (err) {
        console.error('截图异常:', err);
        app.exit(4);
      }
      return;
    }

    createWindow();
    createTray();
  });

  app.on('window-all-closed', () => {
    // 常驻托盘：不随窗口关闭而退出
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.on('activate', showWindow);
}
