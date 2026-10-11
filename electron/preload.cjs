// 预加载脚本：把安全的桌面能力暴露给渲染进程
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  platform: process.platform,

  // 键值存储（落在 exe 旁边 data/*.json）
  get: (key, fallback = null) => ipcRenderer.invoke('store:get', key, fallback),
  set: (key, value) => ipcRenderer.invoke('store:set', key, value),
  getAll: () => ipcRenderer.invoke('store:all'),
  replaceAll: (obj) => ipcRenderer.invoke('store:replaceAll', obj),
  dataDir: () => ipcRenderer.invoke('store:dir'),
  openDataDir: () => ipcRenderer.invoke('store:openDir'),

  // 备份
  exportBackup: (payload) => ipcRenderer.invoke('backup:export', payload),
  importBackup: () => ipcRenderer.invoke('backup:import'),

  // 饮食照片
  photo: {
    save: (dataUrl, dateKey, ext) => ipcRenderer.invoke('photo:save', { dataUrl, dateKey, ext }),
    pick: (dateKey) => ipcRenderer.invoke('photo:pick', { dateKey }),
    read: (relPath) => ipcRenderer.invoke('photo:read', relPath),
    remove: (relPath) => ipcRenderer.invoke('photo:delete', relPath),
    open: (relPath) => ipcRenderer.invoke('photo:open', relPath),
    openDir: () => ipcRenderer.invoke('photo:openDir'),
    usage: () => ipcRenderer.invoke('photo:usage'),
  },

  // 图片识别（课表 / 校历共用同一套本地 OCR）
  calendar: {
    pick: () => ipcRenderer.invoke('calendar:pick'),
    importPath: (srcPath) => ipcRenderer.invoke('calendar:import', { srcPath }),
    ocr: (relPath, scale) => ipcRenderer.invoke('calendar:ocr', { relPath, scale }),
    read: (relPath) => ipcRenderer.invoke('calendar:read', relPath),
    openDir: () => ipcRenderer.invoke('calendar:openDir'),
    // 课表专用：从图片里抽出结构化的课程候选；periods 是用户自定义作息时间表
    timetable: (relPath, scale, periods) => ipcRenderer.invoke('calendar:timetable', { relPath, scale, periods }),
  },

  // 系统能力
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),
  minimize: () => ipcRenderer.invoke('win:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('win:toggleMaximize'),
  hideToTray: () => ipcRenderer.invoke('win:hide'),
  appInfo: () => ipcRenderer.invoke('app:info'),

  // 启动耗时测量（仅 UD_MEASURE=1 时有接收方）
  reportMeasure: (payload) => ipcRenderer.send('measure:report', payload),
});
