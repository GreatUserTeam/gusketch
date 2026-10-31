'use strict';

/* ==========================================================================
   GUSketch — preload.
   Мост contextBridge. Renderer не имеет прямого доступа к Node/fs —
   все файловые операции идут через IPC.
   ========================================================================== */

const { contextBridge, ipcRenderer } = require('electron');

const api = {
  platform: (typeof process !== 'undefined' && process.platform) || 'unknown',
  versions: {
    electron: typeof process !== 'undefined' && process.versions ? process.versions.electron : undefined,
    chrome: typeof process !== 'undefined' && process.versions ? process.versions.chrome : undefined,
    node: typeof process !== 'undefined' && process.versions ? process.versions.node : undefined,
  },

  /* --- Файлы --- */
  saveFile: (filePath, arrayBuffer) => ipcRenderer.invoke('save-file', filePath, arrayBuffer),
  saveFileDialog: (opts) => ipcRenderer.invoke('save-file-dialog', opts),
  openFileDialog: (opts) => ipcRenderer.invoke('open-file-dialog', opts),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  openImageDialog: () => ipcRenderer.invoke('open-image-dialog'),
  chooseDirectory: (defaultPath) => ipcRenderer.invoke('choose-directory', defaultPath),

  /* --- Проекты (системная папка) --- */
  projectsDir: () => ipcRenderer.invoke('projects-dir'),
  projectsList: () => ipcRenderer.invoke('projects-list'),
  projectsFileExists: (name) => ipcRenderer.invoke('projects-file-exists', name),
  projectsRename: (oldPath, newName) => ipcRenderer.invoke('projects-rename', oldPath, newName),
  projectsDelete: (target) => ipcRenderer.invoke('projects-delete', target),
  showInFolder: (target) => ipcRenderer.invoke('show-in-folder', target),
  tabsOrderLoad: () => ipcRenderer.invoke('tabs-order-load'),
  tabsOrderSave: (order) => ipcRenderer.invoke('tabs-order-save', order),
  projectsWatchStart: () => ipcRenderer.invoke('projects-watch-start'),
  onProjectsChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('projects-changed', listener);
    return () => ipcRenderer.removeListener('projects-changed', listener);
  },

  /* --- Прочее --- */
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  copyImage: (dataUrl) => ipcRenderer.invoke('copy-image', dataUrl),
  pasteImage: () => ipcRenderer.invoke('paste-image'),
  setTitle: (title) => ipcRenderer.send('set-title', title),
  setTheme: (theme) => ipcRenderer.send('set-theme', theme),
  setCloseBehavior: (value) => ipcRenderer.send('set-close-behavior', value),
  confirmClose: () => ipcRenderer.send('confirm-close'),
  cancelClose: () => ipcRenderer.send('cancel-close'),

  /* --- Сессия / настройки --- */
  sessionSave: (json) => ipcRenderer.invoke('session-save', json),
  sessionLoad: () => ipcRenderer.invoke('session-load'),
  settingsSave: (json) => ipcRenderer.invoke('settings-save', json),
  settingsLoad: () => ipcRenderer.invoke('settings-load'),

  /* --- Меню --- */
  onMenuAction: (callback) => {
    const listener = (_e, action) => callback(action);
    ipcRenderer.on('menu-action', listener);
    return () => ipcRenderer.removeListener('menu-action', listener);
  },
};

contextBridge.exposeInMainWorld('gusketch', api);
