'use strict';

/* ==========================================================================
   GUSketch — Electron main process.
   Этапы 1–4: окно, нативное меню, IPC для файлов/настроек/сессии,
   кастомный протокол app:// (нужен для ES-модулей в renderer).
   Продукт команды GUTeam — https://guteam.net
   ========================================================================== */

const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  protocol,
  shell,
  clipboard,
  nativeImage,
  nativeTheme,
  Tray,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const APP_SCHEME = 'app';
const APP_HOST = 'gusketch';
const ROOT = __dirname;

app.setName('GUSketch');

/* --------------------------------------------------------------------------
   Кастомный протокол app:// — отдаёт файлы приложения.
   Это нужно, чтобы работали ES-модули (file:// их блокирует из-за CORS).
   -------------------------------------------------------------------------- */
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function mimeFor(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function registerAppProtocol() {
  protocol.handle(APP_SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      let rel = decodeURIComponent(url.pathname || '/');
      if (!rel || rel === '/') rel = '/index.html';
      rel = rel.replace(/^\/+/, '');
      const full = path.normalize(path.join(ROOT, rel));
      // Защита от выхода за пределы каталога приложения.
      if (full !== ROOT && !full.startsWith(ROOT + path.sep)) {
        return new Response('Forbidden', { status: 403 });
      }
      const data = await fs.promises.readFile(full);
      return new Response(data, { headers: { 'content-type': mimeFor(full) } });
    } catch (err) {
      return new Response('Not found', { status: 404 });
    }
  });
}

/* --------------------------------------------------------------------------
   Пути пользовательских данных
   -------------------------------------------------------------------------- */
const userDataDir = () => app.getPath('userData');
const sessionPath = () => path.join(userDataDir(), 'session.json');
const settingsPath = () => path.join(userDataDir(), 'settings.json');
const tabsOrderPath = () => path.join(userDataDir(), 'tabs_order.json');

/* --------------------------------------------------------------------------
   Системная папка проектов.
   Одна папка на приложение, создаётся автоматически при первом запуске.
   Linux:   ~/.local/share/GUSketch/Projects
   Windows: %APPDATA%/GUSketch/Projects
   macOS:   ~/Library/Application Support/GUSketch/Projects
   Переменная окружения GUSKETCH_PROJECTS_DIR переопределяет путь
   (используется для тестового/изолированного профиля).
   -------------------------------------------------------------------------- */
function projectsDir() {
  const override = process.env.GUSKETCH_PROJECTS_DIR;
  if (override) return path.resolve(override);
  if (process.platform === 'linux') {
    const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
    return path.join(base, 'GUSketch', 'Projects');
  }
  return path.join(app.getPath('appData'), 'GUSketch', 'Projects');
}

function ensureProjectsDir() {
  const dir = projectsDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const GUS_EXT = '.gusketch';

/** Убрать недопустимые в имени файла символы. */
function safeFileName(name) {
  return String(name == null ? '' : name)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\.+$/, '')
    .trim() || 'Без имени';
}

/** Полный путь к файлу проекта по имени. name может быть без расширения. */
function projectFilePath(name) {
  const base = String(name || '').toLowerCase().endsWith(GUS_EXT)
    ? String(name).slice(0, -GUS_EXT.length)
    : String(name || '');
  const safe = safeFileName(base);
  return path.join(projectsDir(), safe + GUS_EXT);
}

async function pathExists(p) {
  try {
    await fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Проверка, что путь лежит внутри папки проектов. */
function insideProjects(p) {
  const dir = path.resolve(projectsDir()) + path.sep;
  return path.resolve(p).startsWith(dir);
}


/* --------------------------------------------------------------------------
   Состояние окна
   -------------------------------------------------------------------------- */
let mainWindow = null;
let allowClose = false;
let appQuitting = false;
let currentTheme = 'dark';
let tray = null;
let closeBehavior = 'quit';
const CLOSE_BEHAVIORS = new Set(['quit', 'tray', 'nothing']);

function loadCloseBehavior() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    if (CLOSE_BEHAVIORS.has(saved.closeBehavior)) {
      closeBehavior = saved.closeBehavior;
    }
  } catch {
    /* файла ещё нет — остаётся значение по умолчанию */
  }
}

function createTray() {
  if (tray) return;
  const iconPath = path.join(__dirname, 'build', 'icons', '64x64.png');
  // fs читает файлы из app.asar, поэтому иконка доступна и в собранном пакете.
  const icon = nativeImage.createFromBuffer(fs.readFileSync(iconPath));
  if (icon.isEmpty()) throw new Error(`Не удалось загрузить значок трея: ${iconPath}`);
  tray = new Tray(icon);
  tray.setToolTip('GUSketch');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Открыть GUSketch', click: showMainWindow },
      { type: 'separator' },
      { label: 'Выход', click: requestAppQuit },
    ])
  );
  tray.on('click', showMainWindow);
  tray.on('double-click', showMainWindow);
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function requestAppQuit() {
  if (mainWindow && !mainWindow.webContents.isDestroyed()) {
    // Если окно скрыто в трее — показать его, чтобы диалог сохранения был виден.
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('menu-action', 'app-close-request');
  } else {
    appQuitting = true;
    app.quit();
  }
}

/* --------------------------------------------------------------------------
   Создание окна
   -------------------------------------------------------------------------- */
function createWindow() {
  allowClose = false;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'GUSketch',
    backgroundColor: '#0b0b0b',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Перехват закрытия: поведение зависит от настройки closeBehavior.
  mainWindow.on('close', (e) => {
    if (allowClose || appQuitting) return;
    if (closeBehavior === 'tray') {
      e.preventDefault();
      try {
        createTray();
        mainWindow.hide();
      } catch (err) {
        console.warn('Не удалось свернуть в трей:', err);
      }
      return;
    }
    if (closeBehavior === 'nothing') {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    // «Закрыть программу»: сначала штатное сохранение, затем app.quit().
    requestAppQuit();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Внешние ссылки — в системный браузер.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL(`${APP_SCHEME}://${APP_HOST}/index.html`);
}

/* --------------------------------------------------------------------------
   Нативное меню
   -------------------------------------------------------------------------- */
function send(action) {
  if (mainWindow && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('menu-action', action);
  }
}

function buildMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac
      ? [
          {
            label: 'GUSketch',
            submenu: [
              { label: 'О программе GUSketch', click: () => showAbout() },
              { type: 'separator' },
              { role: 'hide', label: 'Скрыть' },
              { role: 'hideOthers', label: 'Скрыть остальные' },
              { role: 'unhide', label: 'Показать все' },
              { type: 'separator' },
              {
                label: 'Выход',
                accelerator: 'Cmd+Q',
                click: () => {
                  requestAppQuit();
                },
              },
            ],
          },
        ]
      : []),
    {
      label: 'Файл',
      submenu: [
        { label: 'Новый', accelerator: 'CmdOrCtrl+N', click: () => send('new-tab') },
        { type: 'separator' },
        { label: 'Сохранить', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: 'Сохранить всё', accelerator: 'CmdOrCtrl+Alt+S', click: () => send('save-all') },
        { type: 'separator' },
        { label: 'Новый лист', accelerator: 'CmdOrCtrl+Shift+N', click: () => send('new-sheet') },
        { label: 'Следующий лист', click: () => send('next-sheet') },
        { label: 'Предыдущий лист', click: () => send('prev-sheet') },
        { type: 'separator' },
        {
          label: 'Экспорт',
          submenu: [
            { label: 'В PNG…', click: () => send('export-png') },
            { label: 'В PDF…', click: () => send('export-pdf') },
            { label: 'Все вкладки в PDF…', click: () => send('export-pdf-all') },
            { type: 'separator' },
            {
              label: 'Копировать как изображение',
              click: () => send('copy-image'),
            },
          ],
        },
        { type: 'separator' },
        { label: 'Удалить текущую вкладку', accelerator: 'CmdOrCtrl+W', click: () => send('close-tab') },
        { type: 'separator' },
        {
          label: 'Выход',
          accelerator: isMac ? 'Cmd+Q' : undefined,
          click: () => {
            requestAppQuit();
          },
        },
      ],
    },
    {
      label: 'Правка',
      submenu: [
        { label: 'Отменить', click: () => send('undo') },
        { label: 'Повторить', click: () => send('redo') },
        { type: 'separator' },
        { label: 'Вырезать', click: () => send('cut-selection') },
        { label: 'Копировать', click: () => send('copy-selection') },
        { label: 'Вставить', accelerator: 'CmdOrCtrl+V', click: () => send('paste') },
        { label: 'Дублировать', click: () => send('duplicate-selection') },
        { label: 'Удалить', click: () => send('delete-selection') },
        { label: 'Выделить всё', click: () => send('select-all') },
      ],
    },
    {
      label: 'Вид',
      submenu: [
        {
          label: 'Тёмная тема',
          type: 'radio',
          checked: currentTheme === 'dark',
          click: () => send('theme-dark'),
        },
        {
          label: 'Светлая тема',
          type: 'radio',
          checked: currentTheme === 'light',
          click: () => send('theme-light'),
        },
        { type: 'separator' },
        { label: 'Полный экран', role: 'togglefullscreen', accelerator: 'F11' },
        { type: 'separator' },
        { label: 'Масштаб 100%', click: () => send('zoom-reset') },
        { label: 'Увеличить', click: () => send('zoom-in') },
        { label: 'Уменьшить', click: () => send('zoom-out') },
      ],
    },
    {
      label: 'Помощь',
      submenu: [
        { label: 'О программе GUSketch', click: () => showAbout() },
        { type: 'separator' },
        { label: 'guteam.net', click: () => shell.openExternal('https://guteam.net') },
        { label: 'GitHub', click: () => shell.openExternal('https://github.com/GreatUserTeam/') },
        { label: 'Telegram', click: () => shell.openExternal('https://t.me/GreatUserTeam') },
        { label: 'Форум', click: () => shell.openExternal('https://t.me/GreatUserTeamForum') },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function showAbout() {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'О программе GUSketch',
    message: 'GUSketch — Great User Sketch',
    detail:
      `Версия ${app.getVersion()}\n` +
      `Electron ${process.versions.electron}\n` +
      `Chromium ${process.versions.chrome}\n` +
      `Node ${process.versions.node}\n\n` +
      'Десктопное приложение для рисования и заметок.\n' +
      'Команда GUTeam — https://guteam.net',
    buttons: ['OK'],
    noLink: true,
  });
}

/* --------------------------------------------------------------------------
   IPC: файлы
   -------------------------------------------------------------------------- */
ipcMain.handle('save-file', async (_e, filePath, arrayBuffer) => {
  try {
    if (!filePath) return { ok: false, error: 'Пустой путь' };
    await fs.promises.writeFile(filePath, Buffer.from(arrayBuffer));
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

ipcMain.handle('read-file', async (_e, filePath) => {
  try {
    const buf = await fs.promises.readFile(filePath);
    const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return { ok: true, data, path: filePath };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

ipcMain.handle('save-file-dialog', async (_e, opts = {}) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: opts.title || 'Сохранить',
    defaultPath: opts.defaultPath || 'Без имени.gusketch',
    filters: opts.filters || [{ name: 'GUSketch', extensions: ['gusketch'] }],
  });
  return { canceled: res.canceled, filePath: res.filePath };
});

ipcMain.handle('open-file-dialog', async (_e, opts = {}) => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: opts.title || 'Открыть',
    properties: ['openFile'],
    filters: opts.filters || [{ name: 'GUSketch', extensions: ['gusketch'] }],
  });
  return { canceled: res.canceled, filePaths: res.filePaths };
});

ipcMain.handle('open-image-dialog', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Загрузить изображение',
    properties: ['openFile'],
    filters: [
      { name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] },
      { name: 'Все файлы', extensions: ['*'] },
    ],
  });
  if (res.canceled || !res.filePaths[0]) return { canceled: true };
  try {
    const p = res.filePaths[0];
    const buf = await fs.promises.readFile(p);
    const mime = mimeFor(p);
    return {
      canceled: false,
      file: {
        name: path.basename(p),
        mime,
        path: p,
        dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
      },
    };
  } catch (err) {
    return { canceled: false, error: String((err && err.message) || err) };
  }
});

ipcMain.handle('choose-directory', async (_e, defaultPath) => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Папка по умолчанию',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: defaultPath || undefined,
  });
  return { canceled: res.canceled, dirPath: res.filePaths && res.filePaths[0] };
});

/* --------------------------------------------------------------------------
   IPC: прочее
   -------------------------------------------------------------------------- */
ipcMain.handle('open-external', async (_e, url) => {
  if (/^https?:/i.test(url)) await shell.openExternal(url);
  return true;
});

ipcMain.handle('copy-image', async (_e, dataUrl) => {
  try {
    const match = /^data:([^;]+);base64,(.+)$/.exec(String(dataUrl || ''));
    if (!match) return { ok: false, error: 'invalid dataUrl' };
    const mime = match[1];
    const buf = Buffer.from(match[2], 'base64');
    const blob = new Blob([buf], { type: mime });
    const item = new ClipboardItem({ [mime]: blob });
    await clipboard.write([item]);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

ipcMain.handle('paste-image', async () => {
  try {
    // Electron 44+ API: has(mime) -> Promise<boolean>, read() -> Promise<ClipboardItem[]>
    const hasPng = await clipboard.has('image/png');
    const hasJpg = await clipboard.has('image/jpeg');
    const hasWebp = await clipboard.has('image/webp');
    console.log('=== HAS IMAGE ===', { hasPng, hasJpg, hasWebp });

    if (!hasPng && !hasJpg && !hasWebp) {
      return { ok: false, reason: 'no image in clipboard' };
    }

    const items = await clipboard.read();
    console.log('items count:', items.length);

    for (const item of items) {
      const types = item.types || [];
      console.log('item types:', types);
      for (const type of types) {
        if (type.startsWith('image/')) {
          const blob = await item.getType(type);
          const arrayBuffer = await blob.arrayBuffer();
          const buf = Buffer.from(arrayBuffer);
          console.log('image type:', type, 'size:', buf.length);
          return {
            ok: true,
            dataUrl: 'data:' + type + ';base64,' + buf.toString('base64'),
          };
        }
      }
    }

    return { ok: false, reason: 'no image in items' };
  } catch (err) {
    console.error('paste-image error:', err);
    return { ok: false, error: String((err && err.message) || err) };
  }
});

ipcMain.on('set-title', (_e, title) => {
  if (mainWindow && !mainWindow.webContents.isDestroyed()) {
    mainWindow.setTitle(String(title || 'GUSketch'));
  }
});

ipcMain.on('set-theme', (_e, theme) => {
  currentTheme = theme === 'light' ? 'light' : theme === 'system' ? 'system' : 'dark';
  nativeTheme.themeSource = currentTheme;
  buildMenu();
});

ipcMain.on('confirm-close', () => {
  allowClose = true;
  appQuitting = true;
  app.quit();
});

ipcMain.on('cancel-close', () => {
  allowClose = false;
});

ipcMain.on('set-close-behavior', async (_e, value) => {
  if (!CLOSE_BEHAVIORS.has(value)) return;
  closeBehavior = value;
  try {
    let saved = {};
    try {
      saved = JSON.parse(await fs.promises.readFile(settingsPath(), 'utf8'));
    } catch {
      /* файла ещё нет */
    }
    saved.closeBehavior = value;
    await fs.promises.writeFile(settingsPath(), JSON.stringify(saved, null, 2), 'utf8');
  } catch (err) {
    console.warn('Не удалось сохранить поведение при закрытии:', err);
  }
});

/* --------------------------------------------------------------------------
   IPC: сессия и настройки
   -------------------------------------------------------------------------- */
ipcMain.handle('session-save', async (_e, json) => {
  try {
    await fs.promises.writeFile(sessionPath(), json, 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

ipcMain.handle('session-load', async () => {
  try {
    const raw = await fs.promises.readFile(sessionPath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
});

ipcMain.handle('settings-save', async (_e, json) => {
  try {
    await fs.promises.writeFile(settingsPath(), json, 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

ipcMain.handle('settings-load', async () => {
  try {
    const raw = await fs.promises.readFile(settingsPath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
});

/* --------------------------------------------------------------------------
   IPC: системная папка проектов, порядок вкладок, наблюдение за папкой
   -------------------------------------------------------------------------- */
ipcMain.handle('projects-dir', async () => {
  try {
    return { ok: true, dir: ensureProjectsDir() };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

ipcMain.handle('projects-list', async () => {
  try {
    const dir = ensureProjectsDir();
    const names = await fs.promises.readdir(dir);
    const files = [];
    for (const name of names) {
      if (!name.toLowerCase().endsWith(GUS_EXT)) continue;
      const full = path.join(dir, name);
      let st = null;
      try {
        st = await fs.promises.stat(full);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      files.push({
        name,
        title: name.slice(0, -GUS_EXT.length),
        path: full,
        mtime: st.mtimeMs,
        size: st.size,
      });
    }
    return { ok: true, dir, files };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

ipcMain.handle('projects-file-exists', async (_e, name) => {
  try {
    const full = projectFilePath(name);
    return { ok: true, exists: await pathExists(full), path: full };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

ipcMain.handle('projects-rename', async (_e, oldPath, newName) => {
  try {
    const dir = ensureProjectsDir();
    const from = path.resolve(String(oldPath || ''));
    if (!insideProjects(from) || !(await pathExists(from))) {
      return { ok: false, error: 'Исходный файл не найден' };
    }
    const to = projectFilePath(newName);
    if (path.resolve(to) === from) return { ok: true, path: to };
    if (await pathExists(to)) return { ok: false, error: 'occupied' };
    await fs.promises.rename(from, to);
    return { ok: true, path: to };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

ipcMain.handle('projects-delete', async (_e, target) => {
  try {
    const dir = ensureProjectsDir();
    const full = path.isAbsolute(String(target || ''))
      ? path.resolve(String(target))
      : projectFilePath(target);
    if (!insideProjects(full)) return { ok: false, error: 'Путь вне папки проектов' };
    await fs.promises.unlink(full);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

ipcMain.handle('show-in-folder', async (_e, target) => {
  try {
    const full = target ? path.resolve(String(target)) : projectsDir();
    const st = await fs.promises.stat(full).catch(() => null);
    if (st && st.isDirectory()) await shell.openPath(full);
    else if (st) shell.showItemInFolder(full);
    else await shell.openPath(ensureProjectsDir());
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

ipcMain.handle('tabs-order-load', async () => {
  try {
    const raw = await fs.promises.readFile(tabsOrderPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return { ok: true, order: Array.isArray(parsed && parsed.order) ? parsed.order : [] };
  } catch {
    return { ok: true, order: [] };
  }
});

ipcMain.handle('tabs-order-save', async (_e, order) => {
  try {
    const data = JSON.stringify({ order: Array.isArray(order) ? order : [] }, null, 2);
    await fs.promises.writeFile(tabsOrderPath(), data, 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

/* Наблюдение за папкой проектов: новый .gusketch → событие в renderer. */
let projectsWatcher = null;
let projectsWatchTimer = null;

function startProjectsWatch() {
  if (projectsWatcher) return;
  try {
    const dir = ensureProjectsDir();
    projectsWatcher = fs.watch(dir, { persistent: false }, () => {
      clearTimeout(projectsWatchTimer);
      projectsWatchTimer = setTimeout(() => {
        if (mainWindow && !mainWindow.webContents.isDestroyed()) {
          mainWindow.webContents.send('projects-changed');
        }
      }, 300);
    });
  } catch (err) {
    console.warn('Не удалось следить за папкой проектов:', err);
  }
}

ipcMain.handle('projects-watch-start', async () => {
  startProjectsWatch();
  return { ok: true };
});

/* --------------------------------------------------------------------------
   Жизненный цикл
   -------------------------------------------------------------------------- */
app.whenReady().then(() => {
  registerAppProtocol();
  nativeTheme.themeSource = 'dark';
  loadCloseBehavior();
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  appQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
