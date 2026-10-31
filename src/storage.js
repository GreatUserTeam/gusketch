'use strict';

/* ==========================================================================
   GUSketch — файлы .gusketch (ZIP через JSZip), автосохранение.
   Одна вкладка = один ученик = один файл в системной папке проектов.
   Все подвкладки (листы) вкладки хранятся в этом же файле.
   Формат ZIP: document.json (листы), images/, preview.png, meta.json.
   ========================================================================== */

import { app, activeTab, activeDoc, emit } from './state.js';
import { board } from './board.js';
import { settings } from './settings.js';
import { uid, clamp, parseDataUrl } from './util.js';

const FORMAT_VERSION = '1.0';
const APP_NAME = 'GUSketch';

/* ------------------------------ Утилиты ------------------------------ */
function newFileId() {
  return uid('obj');
}

/** Лист -> обычный объект. embed=true — картинки как data URL. */
function sheetToPlain(sheet, opts = {}) {
  const out = {
    id: sheet.id || uid('sheet'),
    name: sheet.name || 'Лист 1',
    strokes: [],
    view: { scale: 1, offsetX: 0, offsetY: 0, ...(sheet.view || {}) },
    grid: { mode: (sheet.grid && sheet.grid.mode) || 'none', size: (sheet.grid && sheet.grid.size) || 25 },
    meta: { created: (sheet.meta && sheet.meta.created) || Date.now(), updated: Date.now() },
  };

  for (const obj of sheet.strokes || []) {
    if (obj.kind === 'image' && obj.src) {
      if (opts.embed) {
        out.strokes.push({ ...obj });
      } else if (opts.imagesFolder) {
        const { ext, base64, mime } = parseDataUrl(obj.src);
        const name = `${obj.id || newFileId()}.${ext}`;
        opts.imagesFolder.file(name, base64, { base64: true });
        out.strokes.push({ ...obj, src: null, imageFile: `images/${name}`, mime });
      } else {
        out.strokes.push({ ...obj });
      }
    } else {
      out.strokes.push({ ...obj });
    }
  }
  return out;
}

/** Вкладка -> обычный объект (структура вкладка -> листы). */
function tabToPlain(tab, opts = {}) {
  const sheets = tab.sheets && tab.sheets.length ? tab.sheets : [tab];
  const out = {
    id: tab.id || uid('doc'),
    title: tab.title || 'Без имени',
    filePath: null,
    modified: false,
    activeSheetId: tab.activeSheetId || (sheets[0] && sheets[0].id) || null,
    sheets: sheets.map((s) => sheetToPlain(s, opts)),
    meta: { created: (tab.meta && tab.meta.created) || Date.now(), updated: Date.now() },
  };
  return out;
}

/**
 * Совместимость: старые «дырки» хранились в мировых координатах (поле points).
 * Переводим их в локальные нормированные координаты (поле pts), чтобы маска
 * корректно следовала за объектом при перемещении/масштабе/повороте.
 */
function migrateHoles(obj) {
  if (!obj || !Array.isArray(obj.holes) || !obj.holes.length) return obj;
  if (obj.holes.every((h) => h && h.pts)) return obj;
  const box = board.objectLocalBox(obj);
  if (!box || box.width <= 0 || box.height <= 0) return obj;
  const bw = box.width;
  const bh = box.height;
  const denom = Math.max(bw, bh, 1);
  const holes = obj.holes.map((h) => {
    if (h && h.pts) return h;
    const pts = (h.points || []).map((p) => {
      const q = board.worldToLocalPoint(obj, p);
      return { u: (q.x - box.x) / bw, v: (q.y - box.y) / bh };
    });
    return { nw: (h.width || 1) / denom, pts };
  });
  return { ...obj, holes };
}

async function normalizeSheet(plain, zip) {
  const strokes = [];
  for (const obj of plain.strokes || []) {
    if (obj.kind === 'image' && !obj.src && obj.imageFile && zip) {
      const file = zip.file(obj.imageFile);
      if (file) {
        const b64 = await file.async('base64');
        const mime = obj.mime || 'image/png';
        strokes.push(migrateHoles({ ...obj, src: `data:${mime};base64,${b64}` }));
        continue;
      }
      continue; // файл картинки потерян — пропускаем
    }
    strokes.push(migrateHoles({ ...obj }));
  }

  return {
    id: plain.id || uid('sheet'),
    name: plain.name || 'Лист 1',
    strokes,
    view: { scale: 1, offsetX: 0, offsetY: 0, ...(plain.view || {}) },
    undoStack: [],
    redoStack: [],
    grid: { mode: (plain.grid && plain.grid.mode) || 'none', size: (plain.grid && plain.grid.size) || 25 },
    selection: [],
    meta: { created: (plain.meta && plain.meta.created) || Date.now(), updated: (plain.meta && plain.meta.updated) || Date.now() },
  };
}

/** Поддержка старого формата (когда на верхнем уровне лежали strokes). */
async function normalizeTab(plain, zip, fallbackPath) {
  const sheetsPlain = Array.isArray(plain.sheets) && plain.sheets.length ? plain.sheets : [plain];
  const sheets = [];
  for (const sp of sheetsPlain) {
    // eslint-disable-next-line no-await-in-loop
    sheets.push(await normalizeSheet(sp, zip));
  }
  const activeSheetId =
    plain.activeSheetId && sheets.some((s) => s.id === plain.activeSheetId)
      ? plain.activeSheetId
      : sheets[0].id;
  return {
    id: plain.id || uid('doc'),
    title: plain.title || 'Без имени',
    filePath: fallbackPath || null,
    modified: false,
    sheets,
    activeSheetId,
    meta: { created: (plain.meta && plain.meta.created) || Date.now(), updated: (plain.meta && plain.meta.updated) || Date.now() },
  };
}

/* ------------------------------ Превью ------------------------------ */
function firstSheet(doc) {
  if (!doc) return null;
  if (doc.sheets && doc.sheets.length) return doc.sheets[0];
  return doc;
}

function makePreview(doc) {
  const sheet = firstSheet(doc);
  if (!sheet) return null;
  try {
    const src = board.renderToCanvas(sheet, { padding: 20, scale: 1, maxSize: 256 });
    const size = 128;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = app.theme === 'light' ? '#ffffff' : '#0b0b0b';
    ctx.fillRect(0, 0, size, size);
    const k = Math.min(size / src.width, size / src.height);
    const w = src.width * k;
    const h = src.height * k;
    ctx.drawImage(src, (size - w) / 2, (size - h) / 2, w, h);
    return c.toDataURL('image/png');
  } catch (err) {
    return null;
  }
}

/* ------------------------------ Сериализация одного файла ------------------------------ */
/** Одна вкладка (со всеми листами) -> ZIP-буфер .gusketch. */
export async function serializeTab(tab) {
  const JSZip = window.JSZip;
  if (!JSZip) throw new Error('JSZip не загружен');
  const zip = new JSZip();
  const imagesFolder = zip.folder('images');

  const plain = tabToPlain(tab, { imagesFolder });
  zip.file(
    'document.json',
    JSON.stringify(
      {
        version: FORMAT_VERSION,
        title: plain.title,
        activeSheetId: plain.activeSheetId,
        sheets: plain.sheets,
      },
      null,
      2
    )
  );

  const now = Date.now();
  zip.file(
    'meta.json',
    JSON.stringify(
      {
        version: FORMAT_VERSION,
        app: APP_NAME,
        created: now,
        updated: now,
        author: '',
      },
      null,
      2
    )
  );

  const preview = makePreview(tab);
  if (preview) {
    const { base64 } = parseDataUrl(preview);
    zip.file('preview.png', base64, { base64: true });
  }

  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

/** ZIP-буфер .gusketch -> одна вкладка. */
export async function deserializeTab(arrayBuffer, fallbackPath) {
  const JSZip = window.JSZip;
  if (!JSZip) throw new Error('JSZip не загружен');
  const zip = await JSZip.loadAsync(arrayBuffer);
  const docFile = zip.file('document.json');
  if (!docFile) throw new Error('Файл повреждён: нет document.json');
  const parsed = JSON.parse(await docFile.async('string'));
  return normalizeTab(parsed, zip, fallbackPath || null);
}

/* ------------------------------ Сохранение ------------------------------ */
/** У вкладки есть содержимое (её нужно записывать на диск). */
export function tabHasContent(tab) {
  if (!tab) return false;
  const sheets = tab.sheets && tab.sheets.length ? tab.sheets : [tab];
  return sheets.some((s) => s.strokes && s.strokes.length);
}

/**
 * Сохранить одну вкладку в её файл. Если файла ещё нет — вычислить путь
 * в системной папке проектов по имени вкладки и создать файл.
 */
export async function saveTab(tab, opts = {}) {
  const t = tab || activeTab();
  if (!t) return false;

  emit('status', { state: 'saving', text: 'Сохранение…' });
  try {
    const buf = await serializeTab(t);
    let filePath = t.filePath;
    if (!filePath) {
      const info = await window.gusketch.projectsFileExists(t.title);
      if (!info || !info.ok || !info.path) throw new Error('Не удалось определить путь файла');
      filePath = info.path;
    }
    const res = await window.gusketch.saveFile(filePath, buf);
    if (!res || !res.ok) throw new Error((res && res.error) || 'Ошибка записи');

    t.filePath = filePath;
    t.modified = false;
    t.meta.updated = Date.now();
    if (!opts.silent) emit('status', { state: 'saved', text: 'Сохранено' });
    emit('tab-saved', t);
    return true;
  } catch (err) {
    emit('status', { state: 'modified', text: 'Ошибка сохранения' });
    if (!opts.silent) emit('toast', { text: `Не удалось сохранить: ${err.message}`, type: 'error' });
    return false;
  }
}

/** Сохранить все изменённые вкладки. */
export async function saveAll() {
  const targets = app.docs.filter((d) => d.modified && (tabHasContent(d) || d.filePath));
  if (!targets.length) {
    emit('status', { state: 'saved', text: 'Сохранено' });
    return true;
  }
  let ok = true;
  for (const d of targets) {
    // eslint-disable-next-line no-await-in-loop
    const r = await saveTab(d, { silent: true });
    if (!r) ok = false;
  }
  emit('status', { state: ok ? 'saved' : 'modified', text: ok ? 'Сохранено' : 'Ошибка сохранения' });
  if (ok) emit('toast', { text: 'Все вкладки сохранены' });
  return ok;
}

/* ------------------------------ Переименование / удаление ------------------------------ */
/** Проверить, занято ли имя другим файлом. */
export async function isNameOccupied(title, ownPath) {
  const info = await window.gusketch.projectsFileExists(title);
  if (!info || !info.ok) return false;
  if (!info.exists) return false;
  if (ownPath && info.path === ownPath) return false;
  return true;
}

/** Переименовать файл вкладки под новое имя. */
export async function renameTabFile(tab, newTitle) {
  if (!tab) return { ok: false, error: 'no-tab' };
  if (tab.filePath) {
    const res = await window.gusketch.projectsRename(tab.filePath, newTitle);
    if (!res || !res.ok) return { ok: false, error: (res && res.error) || 'rename-failed' };
    tab.filePath = res.path;
    return { ok: true };
  }
  return { ok: true };
}

/** Удалить файл вкладки. */
export async function deleteTabFile(tab) {
  if (!tab || !tab.filePath) return { ok: true };
  return window.gusketch.projectsDelete(tab.filePath);
}

/* ------------------------------ Загрузка с диска ------------------------------ */
export async function loadTabOrder() {
  try {
    const res = await window.gusketch.tabsOrderLoad();
    return res && res.ok && Array.isArray(res.order) ? res.order : [];
  } catch {
    return [];
  }
}

export async function saveTabOrder() {
  try {
    await window.gusketch.tabsOrderSave(app.docs.map((d) => d.title));
  } catch (err) {
    console.warn('Не удалось сохранить порядок вкладок', err);
  }
}

/** Отсортировать записи файлов по сохранённому порядку, затем по алфавиту. */
function sortByOrder(files, order) {
  const index = new Map();
  order.forEach((title, i) => index.set(title, i));
  return files.slice().sort((a, b) => {
    const ia = index.has(a.title) ? index.get(a.title) : Infinity;
    const ib = index.has(b.title) ? index.get(b.title) : Infinity;
    if (ia !== ib) return ia - ib;
    return a.title.localeCompare(b.title, 'ru');
  });
}

/** Загрузить все вкладки из системной папки проектов (в сохранённом порядке). */
export async function loadAllTabs() {
  const res = await window.gusketch.projectsList();
  if (!res || !res.ok) return [];
  const order = await loadTabOrder();
  const files = sortByOrder(res.files || [], order);
  const tabs = [];
  for (const f of files) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const buf = await window.gusketch.readFile(f.path);
      if (!buf || !buf.ok) continue;
      // eslint-disable-next-line no-await-in-loop
      const tab = await deserializeTab(buf.data, f.path);
      tab.title = f.title || tab.title;
      tabs.push(tab);
    } catch (err) {
      console.warn('Не удалось открыть проект', f.path, err);
    }
  }
  return tabs;
}

/** Загрузить один файл проекта (для наблюдения за папкой). */
export async function loadTabByPath(filePath, title) {
  const buf = await window.gusketch.readFile(filePath);
  if (!buf || !buf.ok) throw new Error((buf && buf.error) || 'Не удалось прочитать файл');
  const tab = await deserializeTab(buf.data, filePath);
  if (title) tab.title = title;
  return tab;
}

export async function listProjectFiles() {
  const res = await window.gusketch.projectsList();
  return res && res.ok ? res.files || [] : [];
}

export async function getProjectsDir() {
  const res = await window.gusketch.projectsDir();
  return res && res.ok ? res.dir : '';
}

export function startProjectsWatch() {
  try {
    window.gusketch.projectsWatchStart();
  } catch (err) {
    console.warn('Не удалось запустить наблюдение за папкой проектов', err);
  }
}

/* ------------------------------ Автосохранение ------------------------------ */
let autosaveTimer = null;

export function configureAutosave() {
  if (autosaveTimer) {
    clearInterval(autosaveTimer);
    autosaveTimer = null;
  }
  if (!settings.autosave) return;
  const ms = clamp(Number(settings.autosaveInterval) || 5, 1, 300) * 1000;
  autosaveTimer = setInterval(runAutosave, ms);
}

export async function runAutosave() {
  const targets = app.docs.filter((d) => d.modified && (tabHasContent(d) || d.filePath));
  if (!targets.length) return;
  for (const d of targets) {
    // eslint-disable-next-line no-await-in-loop
    await saveTab(d, { silent: true });
  }
  emit('status', { state: 'saved', text: 'Автосохранено' });
}

export function hasUnsaved() {
  return app.docs.some((d) => d.modified && tabHasContent(d));
}
