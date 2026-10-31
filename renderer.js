'use strict';

/* ==========================================================================
   GUSketch — точка входа (ES-модуль).
   Собирает модули: холст, инструменты, вкладки, хранение, экспорт, настройки.
   ========================================================================== */

import { app, activeDoc, emit, on, setSelection, clearSelection, markModified } from './src/state.js';
import { board } from './src/board.js';
import * as settings from './src/settings.js';
import { initRangeInputs } from './src/settings.js';
import * as history from './src/history.js';
import * as tools from './src/tools.js';
import * as tabs from './src/tabs.js';
import * as storage from './src/storage.js';
import * as exporter from './src/export.js';
import * as images from './src/images.js';
import * as selection from './src/selection.js';
import * as panel from './src/panel.js';
import { initUI, showConfirm, updateStatus } from './src/ui.js';
import { debounce } from './src/util.js';
import { initI18n } from './src/i18n.js';

/* =========================================================================
   Сетка (кастомный выпадающий список в шапке)
   ========================================================================= */
function syncGridUI() {
  const doc = activeDoc();
  const mode = doc ? doc.grid.mode : 'none';
  const size = doc ? doc.grid.size : 25;

  const menu = document.getElementById('gridMenu');
  if (menu) {
    for (const b of menu.querySelectorAll('.dropdown__item')) {
      b.classList.toggle('is-active', b.dataset.grid === mode);
    }
  }
  const gridBtn = document.getElementById('gridBtn');
  if (gridBtn) gridBtn.classList.toggle('is-active', mode !== 'none');
  const wrap = document.getElementById('gridSizeWrap');
  if (wrap) wrap.hidden = mode === 'none';
  const range = document.getElementById('gridSize');
  if (range) range.value = String(size);
  const out = document.getElementById('gridSizeValue');
  if (out) out.textContent = `${size} px`;
}

function toggleGridMenu(force) {
  const menu = document.getElementById('gridMenu');
  if (!menu) return;
  const open = force != null ? force : menu.hidden;
  menu.hidden = !open;
  const dd = document.getElementById('gridDropdown');
  if (dd) dd.classList.toggle('is-open', open);
}

function setGridMode(mode) {
  const doc = activeDoc();
  if (!doc) return;
  doc.grid.mode = mode;
  markModified(doc);
  emit('doc-changed', doc);
  board.requestRender();
  syncGridUI();
}

/* =========================================================================
   Кнопки интерфейса
   ========================================================================= */
function bindControls() {
  // Полоса вкладок
  const addBtn = document.getElementById('addTabBtn');
  if (addBtn) addBtn.addEventListener('click', () => tabs.newTab());

  // Сетка — выпадающий список
  const gridBtn = document.getElementById('gridBtn');
  if (gridBtn) {
    gridBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleGridMenu();
    });
  }
  const gridMenu = document.getElementById('gridMenu');
  if (gridMenu) {
    gridMenu.addEventListener('click', (e) => {
      const item = e.target.closest('.dropdown__item');
      if (!item) return;
      setGridMode(item.dataset.grid);
    });
  }
  const gridSize = document.getElementById('gridSize');
  if (gridSize) {
    gridSize.addEventListener('input', () => {
      const doc = activeDoc();
      if (!doc) return;
      doc.grid.size = Number(gridSize.value);
      const out = document.getElementById('gridSizeValue');
      if (out) out.textContent = `${doc.grid.size} px`;
      board.requestRender();
    });
  }
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('#gridDropdown')) toggleGridMenu(false);
  });

  // Фото
  const imageBtn = document.getElementById('imageBtn');
  if (imageBtn) imageBtn.addEventListener('click', insertImage);

  // Настройки
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) settingsBtn.addEventListener('click', settings.openSettingsModal);

  // Тема (шапка)
  const themeSeg = document.getElementById('themeSeg');
  if (themeSeg) {
    themeSeg.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg__btn');
      if (btn) settings.setTheme(btn.dataset.themeValue);
    });
  }

  // История
  const undoBtn = document.getElementById('undoBtn');
  if (undoBtn) undoBtn.addEventListener('click', () => history.undo());
  const redoBtn = document.getElementById('redoBtn');
  if (redoBtn) redoBtn.addEventListener('click', () => history.redo());

  // Двойной клик по холсту — редактирование текстового блока.
  const boardCanvas = document.getElementById('board');
  if (boardCanvas) boardCanvas.addEventListener('dblclick', onBoardDblClick);
}

function onBoardDblClick(e) {
  const doc = activeDoc();
  if (!doc) return;
  const r = e.target.getBoundingClientRect ? e.target.getBoundingClientRect() : { left: 0, top: 0 };
  const screen = { x: e.clientX - r.left, y: e.clientY - r.top };
  const world = board.toWorld(screen.x, screen.y);
  tools.editTextAt(screen, world);
  emit('tool-changed', app.tool);
}

async function insertImage() {
  const res = await window.gusketch.openImageDialog();
  if (!res || res.canceled || !res.file) {
    if (res && res.error) emit('toast', { text: res.error, type: 'error' });
    return;
  }
  const doc = activeDoc();
  if (!doc) return;
  const obj = await images.createImageObject(res.file, 600);
  const cx = board.cssW / 2;
  const cy = board.cssH / 2;
  const center = board.toWorld(cx, cy);
  obj.x = center.x - obj.width / 2;
  obj.y = center.y - obj.height / 2;

  history.pushHistory(doc);
  doc.strokes.push(obj);
  setSelection(doc, [obj.id]);
  emit('doc-changed', doc);
  tools.setTool('move');
  board.requestRender();
  emit('toast', { text: 'Фото добавлено' });
}

/** Импорт новых файлов из системной папки (слежение за папкой). */
async function syncProjectsFromDisk() {
  try {
    const files = await storage.listProjectFiles();
    if (!files || !files.length) return;
    const known = new Set(app.docs.map((d) => d.filePath).filter(Boolean));
    const added = [];
    for (const f of files) {
      if (known.has(f.path)) continue;
      // eslint-disable-next-line no-await-in-loop
      const tab = await storage.loadTabByPath(f.path, f.title).catch(() => null);
      if (!tab) continue;
      app.docs.push(tab);
      added.push(tab);
      known.add(f.path);
    }
    if (added.length) {
      tabs.render();
      storage.saveTabOrder();
      emit('toast', { text: `Добавлено разделов: ${added.length}` });
      board.requestRender();
    }
  } catch (_) {
    /* noop */
  }
}

/* =========================================================================
   Меню приложения
   ========================================================================= */
async function handleCloseRequest() {
  if (storage.hasUnsaved()) {
    const choice = await showConfirm({
      title: 'Несохранённые изменения',
      message: 'Сохранить изменения перед выходом?',
      buttons: [
        { label: 'Сохранить всё', value: 'save', primary: true },
        { label: 'Не сохранять', value: 'discard', danger: true },
        { label: 'Отмена', value: 'cancel' },
      ],
    });
    if (!choice || choice === 'cancel') {
      window.gusketch.cancelClose();
      return;
    }
    if (choice === 'save') {
      const ok = await storage.saveAll();
      if (!ok) {
        window.gusketch.cancelClose();
        return;
      }
    }
  } else {
    await storage.saveAll();
  }
  await storage.saveTabOrder();
  window.gusketch.confirmClose();
}

function handleMenuAction(action) {
  switch (action) {
    case 'new-tab':
      tabs.newTab();
      break;
    case 'new-sheet':
      tabs.addSheet();
      break;
    case 'next-sheet':
      tabs.nextSheet(1);
      break;
    case 'prev-sheet':
      tabs.nextSheet(-1);
      break;
    case 'open':
      // «Открыть» убрано из меню: импорт идёт через системную папку проектов.
      break;
    case 'save':
      storage.saveTab();
      break;
    case 'save-as':
      storage.saveTab();
      break;
    case 'save-all':
      storage.saveAll();
      break;
    case 'close-tab':
      if (app.activeId) tabs.closeTab(app.activeId);
      break;
    case 'undo':
      history.undo();
      break;
    case 'redo':
      history.redo();
      break;
    case 'cut-selection':
      selection.cutSelection();
      break;
    case 'copy-selection':
      selection.copySelection();
      break;
    case 'paste':
      void handlePaste();
      break;
    case 'duplicate-selection':
      selection.duplicateSelection();
      break;
    case 'delete-selection':
      selection.deleteSelection();
      break;
    case 'select-all':
      selection.selectAll();
      break;
    case 'theme-dark':
      settings.setTheme('dark');
      break;
    case 'theme-light':
      settings.setTheme('light');
      break;
    case 'zoom-reset':
      tools.zoomReset();
      break;
    case 'zoom-in':
      tools.zoomBy(1.2);
      break;
    case 'zoom-out':
      tools.zoomBy(1 / 1.2);
      break;
    case 'export-png':
      exporter.exportPNG();
      break;
    case 'export-pdf':
      exporter.exportPDF();
      break;
    case 'export-pdf-all':
      exporter.exportPDFAll();
      break;
    case 'copy-image':
      exporter.copyImage();
      break;
    case 'app-close-request':
      handleCloseRequest();
      break;
    default:
      break;
  }
}

/* =========================================================================
   Горячие клавиши (по event.code — не зависит от раскладки)
   ========================================================================= */
const CODE_TOOLS = {
  KeyB: 'brush',
  KeyM: 'marker',
  KeyE: 'eraser',
  KeyL: 'line',
  KeyA: 'arrow',
  KeyT: 'text',
  KeyV: 'move',
  KeyQ: 'lasso',
  KeyH: 'hand',
};

/** Выбрать фигуру и активировать инструмент «Фигуры» (клавиши R/O/S). */
function setShapeKind(kind) {
  app.shapeKind = kind;
  settings.getToolSettings('shape').kind = kind;
  settings.save();
  emit('shape-changed', kind);
  tools.setTool('shape');
}

function bindKeyboard() {
  window.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName ? e.target.tagName : '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    const mod = e.ctrlKey || e.metaKey;

    // Пробел — временная рука (панорама).
    if (e.code === 'Space' && !mod) {
      if (!e.repeat) tools.setSpaceDown(true);
      e.preventDefault();
      return;
    }

    if (mod) {
      // Переключение вкладок.
      if (e.code === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) tabs.prev();
        else tabs.next();
        return;
      }
      if (e.code === 'KeyN' && e.shiftKey) {
        e.preventDefault();
        tabs.addSheet();
        return;
      }
      if (e.code === 'KeyN') {
        e.preventDefault();
        tabs.newTab();
        return;
      }
      if (e.code === 'KeyT' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        tabs.newTab();
        return;
      }
      if (e.code === 'KeyO') {
        e.preventDefault();
        return;
      }
      if (e.code === 'KeyW') {
        e.preventDefault();
        if (app.activeId) tabs.closeTab(app.activeId);
        return;
      }
      if (e.code === 'KeyS') {
        e.preventDefault();
        if (e.altKey) storage.saveAll();
        else storage.saveTab();
        return;
      }
      if (e.code === 'KeyE') {
        e.preventDefault();
        exporter.exportPNG();
        return;
      }
      // Зум: Equal(+), Minus(-), Digit0/Numpad0.
      if (e.code === 'Equal' || e.code === 'NumpadAdd') {
        e.preventDefault();
        tools.zoomBy(1.2);
        return;
      }
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
        e.preventDefault();
        tools.zoomBy(1 / 1.2);
        return;
      }
      if (e.code === 'Digit0' || e.code === 'Numpad0') {
        e.preventDefault();
        tools.zoomReset();
        return;
      }
      // Undo/Redo.
      if (e.code === 'KeyZ') {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
        return;
      }
      if (e.code === 'KeyY') {
        e.preventDefault();
        history.redo();
        return;
      }
      // Буфер обмена и операции над выделением.
      if (e.code === 'KeyC') {
        e.preventDefault();
        if (e.shiftKey) exporter.copyImage();
        else selection.copySelection();
        return;
      }
      if (e.code === 'KeyX') {
        e.preventDefault();
        selection.cutSelection();
        return;
      }
      if (e.code === 'KeyV') {
        e.preventDefault();
        handlePaste();
        return;
      }
      if (e.code === 'KeyD') {
        e.preventDefault();
        selection.duplicateSelection();
        return;
      }
      if (e.code === 'KeyA') {
        e.preventDefault();
        selection.selectAll();
        return;
      }
      if (e.code === 'Delete' || e.code === 'Backspace') {
        e.preventDefault();
        selection.deleteSelection();
        return;
      }
      return;
    }

    // Одиночные клавиши инструментов (по физической клавише).
    if (e.code === 'KeyR') {
      setShapeKind('rect');
      return;
    }
    if (e.code === 'KeyO') {
      setShapeKind('circle');
      return;
    }
    if (e.code === 'KeyS') {
      tools.setTool('shape');
      return;
    }
    if (CODE_TOOLS[e.code]) {
      tools.setTool(CODE_TOOLS[e.code]);
      return;
    }
    if (e.code === 'KeyG') {
      const doc = activeDoc();
      if (doc) setGridMode(doc.grid.mode === 'none' ? 'squares' : 'none');
      return;
    }
    if (e.code === 'Delete' || e.code === 'Backspace') {
      selection.deleteSelection();
      return;
    }
    if (e.code === 'Escape') {
      toggleGridMenu(false);
      clearSelection(activeDoc());
      emit('doc-changed', activeDoc());
      board.requestRender();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') tools.setSpaceDown(false);
  });

  window.addEventListener('blur', () => {
    tools.setSpaceDown(false);
  });
}

/* =========================================================================
   Инициализация
   ========================================================================= */
async function boot() {
  // Инициализация i18n (должно быть до применения настроек)
  initI18n();

  // 1. Настройки
  await settings.load();
  settings.initSettingsUI();
  settings.apply();

  // Инициализация range-инпутов (закраска трека до thumb'а)
  initRangeInputs();

  // 2. Холст и инструменты
  board.init();
  tools.initTools();
  initUI();
  tabs.initTabs();

  app.shapeKind = settings.getToolSettings('shape').kind || 'rect';
  app.width = settings.toolWidth('brush');
  tools.setTool('brush');

  // 3. Контролы
  bindControls();
  panel.initToolPanels();

  // 4. Проекты из системной папки (все .gusketch открываются вкладками)
  let restored = false;
  if (settings.settings.restoreTabs) {
    const loaded = await storage.loadAllTabs();
    if (loaded && loaded.length) {
      app.docs = loaded;
      const preferred = settings.activeTabName;
      const found = preferred ? loaded.find((d) => d.title === preferred) : null;
      app.activeId = found ? found.id : loaded[0].id;
      tabs.render();
      emit('active-doc-changed', activeDoc());
      restored = true;
    }
  }
  if (!restored) tabs.newTab();

  // Наблюдение за системной папкой: новый .gusketch → новая вкладка справа.
  storage.startProjectsWatch();
  window.gusketch.onProjectsChanged(syncProjectsFromDisk);

  panel.updateToolUI();
  panel.showInitialPanel();
  syncGridUI();

  // 5. Реакции
  on('tool-changed', (tool) => {
    panel.onToolChanged(tool);
    panel.updateToolUI();
  });
  on('shape-changed', () => panel.updateShapeIcon());
  on('active-doc-changed', () => {
    syncGridUI();
    board.requestRender();
    updateStatus();
  });
  on('settings-changed', () => {
    board.requestRender();
  });
  on('history-changed', () => updateStatus());

  const saveOrderDebounced = debounce(() => storage.saveTabOrder(), 800);
  on('tabs-changed', saveOrderDebounced);

  // 6. Автосохранение
  storage.configureAutosave();
  on('settings-changed', () => storage.configureAutosave());

  // 7. Меню
  async function handlePaste() {
    // 1. Пробуем системный буфер обмена (изображение).
    try {
      const res = await window.gusketch.pasteImage();
      if (res && res.ok && res.dataUrl) {
        const doc = activeDoc();
        if (!doc) return;
        const file = { dataUrl: res.dataUrl, name: 'pasted.png', mime: 'image/png' };
        const obj = await images.createImageObject(file, 600);
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const w = board.toWorld(cx, cy);
        obj.x = w.x - obj.width / 2;
        obj.y = w.y - obj.height / 2;
        if (!Array.isArray(doc.strokes)) doc.strokes = [];
        doc.strokes.push(obj);
        markModified();
        setSelection([obj.id]);
        emit('doc-changed', doc);
        board.requestRender();
        return;
      }
    } catch (err) {
      console.warn('paste image failed:', err);
    }
    // 2. Fallback — вставка внутренних объектов (если есть).
    selection.pasteClipboard();
  }

  window.gusketch.onMenuAction(handleMenuAction);

  /* Глобальный Ctrl+V — вставка изображений из системного буфера. */
  function globalPasteHandler(e) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      void handlePaste();
    }
  }
  document.addEventListener('keydown', globalPasteHandler);
  window.__gusGlobalPasteHandler = globalPasteHandler;

  // 8. Горячие клавиши
  bindKeyboard();

  board.requestRender();
  updateStatus();

  console.log('GUSketch готов. Версия Electron:', window.gusketch.versions.electron);
}

boot().catch((err) => {
  console.error('Ошибка запуска GUSketch:', err);
});
