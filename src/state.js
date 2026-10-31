'use strict';

/* ==========================================================================
   GUSketch — глобальное состояние приложения и шина событий.
   ========================================================================== */

import { uid } from './util.js';

/* ------------------------------- Шина событий ------------------------------- */
const listeners = new Map();

export function on(name, cb) {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name).add(cb);
  return () => {
    const set = listeners.get(name);
    if (set) set.delete(cb);
  };
}

export function emit(name, detail) {
  const set = listeners.get(name);
  if (!set) return;
  for (const cb of Array.from(set)) {
    try {
      cb(detail);
    } catch (err) {
      console.error(`[bus:${name}]`, err);
    }
  }
}

/* ----------------------------- Состояние ----------------------------- */
export const app = {
  docs: [],
  activeId: null,
  tool: 'brush',
  width: 10,
  settings: null,
  theme: 'dark',
  accent: '#ff4d30',
  ink: '#f0f0f0',
  // Текущая выбранная фигура для составного инструмента «Фигуры».
  shapeKind: 'rect',
  // Настройки инструментов (заполняются из settings.js).
  toolSettings: null,
  // Внутренний буфер копирования объектов.
  clipboard: [],
};

export const DEFAULT_VIEW = { scale: 1, offsetX: 0, offsetY: 0 };

export const MAX_SHEETS = 5;

/**
 * Лист (подвкладка) — самостоятельное полотно со своими штрихами, камерой,
 * историей и выделением. Именно лист возвращает activeDoc(), поэтому весь
 * код рисования работает с листом без изменений.
 */
export function createSheet(name) {
  const now = Date.now();
  return {
    id: uid('sheet'),
    name: name || 'Лист 1',
    strokes: [],
    view: { ...DEFAULT_VIEW },
    undoStack: [],
    redoStack: [],
    grid: { mode: 'none', size: 25 },
    // Множественное выделение: массив id объектов.
    selection: [],
    meta: { created: now, updated: now },
  };
}

/**
 * Вкладка — контейнер листов. Хранит имя, путь к файлу и признак изменений.
 */
export function createDoc(title) {
  const sheet = createSheet('Лист 1');
  const now = Date.now();
  return {
    id: uid('doc'),
    title: title || 'Без имени',
    filePath: null,
    modified: false,
    sheets: [sheet],
    activeSheetId: sheet.id,
    meta: { created: now, updated: now },
  };
}

/** Активная вкладка (не лист). */
export function activeTab() {
  return app.docs.find((d) => d.id === app.activeId) || null;
}

/** Активный лист активной вкладки. Используется как «документ» везде. */
export function activeDoc() {
  const t = activeTab();
  if (!t || !Array.isArray(t.sheets) || !t.sheets.length) return null;
  return t.sheets.find((s) => s.id === t.activeSheetId) || t.sheets[0];
}

/** Вкладка по id. */
export function getDocById(id) {
  return app.docs.find((d) => d.id === id) || null;
}

/** Вкладка, которой принадлежит лист. */
export function tabOf(sheet) {
  if (!sheet) return null;
  for (const t of app.docs) {
    if (t.sheets && t.sheets.indexOf(sheet) !== -1) return t;
  }
  return null;
}

/** Пометить лист и его вкладку изменёнными. */
export function markModified(doc) {
  const d = doc || activeDoc();
  if (!d) return;
  d.meta.updated = Date.now();
  const t = tabOf(d);
  if (t) {
    t.modified = true;
    t.meta.updated = Date.now();
    emit('doc-changed', d);
  } else {
    d.modified = true;
    emit('doc-changed', d);
  }
}

/** Цвет чернил текущей темы. */
export function inkColor() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--ink');
  return (v && v.trim()) || '#f0f0f0';
}

/** Цвет сетки текущей темы. */
export function gridColor() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--grid');
  return (v && v.trim()) || 'rgba(255,255,255,0.08)';
}

/* --------------------------- Выделение (хелперы) --------------------------- */
export function selectedObjects(doc) {
  const d = doc || activeDoc();
  if (!d || !Array.isArray(d.selection) || !d.selection.length) return [];
  return d.strokes.filter((s) => d.selection.includes(s.id));
}

export function isSelected(doc, id) {
  const d = doc || activeDoc();
  return !!(d && Array.isArray(d.selection) && d.selection.includes(id));
}

export function setSelection(doc, ids) {
  const d = doc || activeDoc();
  if (!d) return;
  d.selection = Array.from(new Set(ids || []));
  emit('selection-changed', d.selection);
}

export function clearSelection(doc) {
  setSelection(doc, []);
}
