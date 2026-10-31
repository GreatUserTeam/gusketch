'use strict';

/* ==========================================================================
   GUSketch — вкладки (документы) и подвкладки (листы).
   Каждая вкладка содержит до 5 листов, у каждого — своё полотно, камера,
   выделение и история. Полоса листов показывается под вкладками для активной.
   ========================================================================== */

import { app, activeDoc, activeTab, getDocById, createDoc, createSheet, MAX_SHEETS, emit, on } from './state.js';
import { board } from './board.js';
import * as storage from './storage.js';
import { settings, save } from './settings.js';
import { showConfirm } from './ui.js';

let listEl = null;
let addBtn = null;
let sheetBar = null;
let sheetList = null;
let addSheetBtn = null;
let bound = false;

/* Идентификатор вкладки, для которой развёрнута полоса листов. */
let sheetsOpenFor = null;

/* ------------------------------- Заголовки ------------------------------- */
function nextUntitledTitle() {
  const titles = new Set(app.docs.map((d) => d.title));
  let n = 1;
  while (titles.has(`Без имени ${n}`)) n += 1;
  return `Без имени ${n}`;
}

function nextSheetName(tab) {
  const names = new Set((tab.sheets || []).map((s) => s.name));
  let n = 1;
  while (names.has(`Лист ${n}`)) n += 1;
  return `Лист ${n}`;
}

/* ------------------------------- DOM вкладки ------------------------------- */
function buildTab(doc) {
  const el = document.createElement('div');
  el.className = 'tab' + (doc.id === app.activeId ? ' is-active' : '') + (doc.modified ? ' is-modified' : '');
  el.dataset.id = doc.id;
  el.draggable = true;
  el.setAttribute('role', 'tab');
  el.title = doc.filePath || doc.title;

  const title = document.createElement('span');
  title.className = 'tab__title';
  title.textContent = doc.title;

  const dot = document.createElement('span');
  dot.className = 'tab__dot';
  dot.setAttribute('aria-hidden', 'true');

  const caret = document.createElement('button');
  caret.className = 'tab__caret' + (sheetsOpenFor === doc.id ? ' is-open' : '');
  caret.type = 'button';
  caret.title = 'Листы вкладки';
  caret.setAttribute('aria-label', 'Показать листы вкладки');
  caret.innerHTML =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

  const close = document.createElement('button');
  close.className = 'tab__close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Закрыть вкладку');
  close.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  el.append(title, dot, caret, close);

  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.tab__close') || e.target.closest('.tab__rename') || e.target.closest('.tab__caret')) return;
    activate(doc.id);
  });
  el.addEventListener('dblclick', (e) => {
    if (e.target.closest('.tab__close') || e.target.closest('.tab__caret') || e.target.closest('.tab__rename')) return;
    beginRename(doc.id);
  });
  caret.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSheets(doc.id);
  });
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    closeTab(doc.id);
  });

  // Drag & drop
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', doc.id);
    e.dataTransfer.effectAllowed = 'move';
    el.classList.add('dragging');
  });
  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    for (const t of listEl.querySelectorAll('.drag-over')) t.classList.remove('drag-over');
  });
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    el.classList.add('drag-over');
  });
  el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('drag-over');
    const fromId = e.dataTransfer.getData('text/plain');
    if (fromId && fromId !== doc.id) reorder(fromId, doc.id);
  });

  return el;
}

/* ------------------------------- Отрисовка ------------------------------- */
export function render() {
  if (!listEl) return;
  listEl.innerHTML = '';
  for (const doc of app.docs) listEl.appendChild(buildTab(doc));
  renderSheetBar();
  emit('tabs-changed');
}

function refreshActive() {
  if (!listEl) return;
  for (const el of listEl.querySelectorAll('.tab')) {
    el.classList.toggle('is-active', el.dataset.id === app.activeId);
    const caret = el.querySelector('.tab__caret');
    if (caret) caret.classList.toggle('is-open', sheetsOpenFor === el.dataset.id);
  }
}

/* ------------------------------- Полоса листов ------------------------------- */
export function renderSheetBar() {
  if (!sheetBar) return;
  const tab = activeTab();
  const open = !!(tab && sheetsOpenFor === tab.id);
  sheetBar.hidden = !open;
  document.documentElement.style.setProperty('--sheets-h', open ? '30px' : '0px');
  if (!open || !tab || !sheetList) return;

  sheetList.innerHTML = '';
  for (const sheet of tab.sheets) {
    const chip = document.createElement('div');
    chip.className = 'sheet' + (sheet.id === tab.activeSheetId ? ' is-active' : '');
    chip.dataset.id = sheet.id;
    chip.setAttribute('role', 'tab');

    const name = document.createElement('span');
    name.className = 'sheet__name';
    name.textContent = sheet.name;
    chip.appendChild(name);

    if (tab.sheets.length > 1) {
      const close = document.createElement('button');
      close.className = 'sheet__close';
      close.type = 'button';
      close.setAttribute('aria-label', 'Удалить лист');
      close.innerHTML =
        '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSheet(sheet.id);
      });
      chip.appendChild(close);
    }

    chip.addEventListener('click', () => activateSheet(sheet.id));
    chip.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      beginRenameSheet(sheet.id);
    });
    chip.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      deleteSheet(sheet.id);
    });

    sheetList.appendChild(chip);
  }

  if (addSheetBtn) {
    const full = tab.sheets.length >= MAX_SHEETS;
    addSheetBtn.disabled = full;
    addSheetBtn.dataset.tip = full ? `Максимум ${MAX_SHEETS} листов` : 'Новый лист';
  }
}

export function toggleSheets(tabId) {
  if (app.activeId !== tabId) activate(tabId);
  sheetsOpenFor = sheetsOpenFor === tabId ? null : tabId;
  refreshActive();
  renderSheetBar();
}

/* ------------------------------- Операции с листами ------------------------------- */
export function addSheet() {
  const tab = activeTab();
  if (!tab || tab.sheets.length >= MAX_SHEETS) return null;
  const sheet = createSheet(nextSheetName(tab));
  tab.sheets.push(sheet);
  tab.activeSheetId = sheet.id;
  tab.modified = true;
  tab.meta.updated = Date.now();
  emit('sheets-changed', tab);
  emit('doc-changed', sheet);
  emit('active-doc-changed', sheet);
  renderSheetBar();
  board.requestRender();
  return sheet;
}

export function activateSheet(sheetId) {
  const tab = activeTab();
  if (!tab) return;
  if (tab.activeSheetId === sheetId) return;
  const sheet = tab.sheets.find((s) => s.id === sheetId);
  if (!sheet) return;
  tab.activeSheetId = sheetId;
  emit('active-doc-changed', sheet);
  renderSheetBar();
  board.requestRender();
}

export function nextSheet(dir = 1) {
  const tab = activeTab();
  if (!tab || tab.sheets.length < 2) return;
  const i = tab.sheets.findIndex((s) => s.id === tab.activeSheetId);
  const n = (i + dir + tab.sheets.length) % tab.sheets.length;
  activateSheet(tab.sheets[n].id);
}

export async function deleteSheet(sheetId) {
  const tab = activeTab();
  if (!tab || tab.sheets.length <= 1) return false;
  const idx = tab.sheets.findIndex((s) => s.id === sheetId);
  if (idx < 0) return false;
  const sheet = tab.sheets[idx];

  if (settings.askBeforeDeleteSheet !== false) {
    const choice = await showConfirm({
      title: 'Удаление листа',
      message: `Удалить лист «${sheet.name}»? Это действие нельзя отменить.`,
      buttons: [
        { label: 'Удалить', value: 'yes', danger: true, primary: true },
        { label: 'Отмена', value: 'cancel' },
      ],
    });
    if (choice !== 'yes') return false;
  }

  tab.sheets.splice(idx, 1);
  if (tab.activeSheetId === sheetId) {
    const next = tab.sheets[Math.min(idx, tab.sheets.length - 1)];
    tab.activeSheetId = next.id;
    emit('active-doc-changed', next);
  }
  tab.modified = true;
  tab.meta.updated = Date.now();
  emit('sheets-changed', tab);
  emit('doc-changed', activeDoc());
  renderSheetBar();
  board.requestRender();
  return true;
}

function beginRenameSheet(sheetId) {
  const tab = activeTab();
  if (!tab || !sheetList) return;
  const el = sheetList.querySelector(`.sheet[data-id="${sheetId}"]`);
  const sheet = tab.sheets.find((s) => s.id === sheetId);
  if (!el || !sheet) return;
  const nameEl = el.querySelector('.sheet__name');
  if (!nameEl) return;

  const input = document.createElement('input');
  input.className = 'sheet__rename';
  input.value = sheet.name;
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  let finished = false;

  const finish = (commit) => {
    if (finished) return;
    finished = true;
    input.removeEventListener('blur', onBlur);
    input.removeEventListener('keydown', onKey);
    if (commit && input.value.trim()) {
      sheet.name = input.value.trim();
      tab.modified = true;
      tab.meta.updated = Date.now();
      emit('sheets-changed', tab);
      emit('doc-changed', activeDoc());
    }
    renderSheetBar();
  };
  const onBlur = () => finish(true);
  const onKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      finish(true);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish(false);
      return;
    }
  };
  input.addEventListener('blur', onBlur);
  input.addEventListener('keydown', onKey);
}

/* ------------------------------- Операции с вкладками ------------------------------- */
export function activate(id) {
  if (app.activeId === id) {
    refreshActive();
    renderSheetBar();
    return;
  }
  const doc = getDocById(id);
  if (!doc) return;
  app.activeId = id;
  persistActiveTab();
  refreshActive();
  emit('active-doc-changed', activeDoc());
  renderSheetBar();
  board.requestRender();
}

/** Запомнить активную вкладку в настройках (восстанавливается при запуске). */
function persistActiveTab() {
  const t = activeTab();
  if (!t) return;
  settings.activeTabName = t.title;
  save();
}

export function addDoc(doc, activateIt = true) {
  app.docs.push(doc);
  if (activateIt || !app.activeId) app.activeId = doc.id;
  render();
  if (activateIt) persistActiveTab();
  storage.saveTabOrder();
  emit('active-doc-changed', activeDoc());
  board.requestRender();
  return doc;
}

export function newTab() {
  const doc = createDoc(nextUntitledTitle());
  // применить настройку толщины по умолчанию
  if (app.settings && app.settings.defaultWidth) app.width = app.settings.defaultWidth;
  const added = addDoc(doc, true);
  persistActiveTab();
  return added;
}

export async function closeTab(id, opts = {}) {
  const doc = getDocById(id);
  if (!doc) return false;

  // Подтверждение удаления раздела вместе со всеми листами и файлом.
  if (!opts.skipConfirm && settings.askBeforeDeleteTab !== false) {
    const choice = await showConfirm({
      title: 'Удаление раздела',
      message:
        `Удалить раздел «${doc.title}»? Вместе с ним будут удалены все подвкладки (листы). ` +
        'Действие нельзя отменить.',
      buttons: [
        { label: 'Удалить', value: 'yes', danger: true, primary: true },
        { label: 'Отмена', value: 'cancel' },
      ],
    });
    if (choice !== 'yes') return false;
  }

  // Удаляем файл проекта с диска.
  if (doc.filePath) await storage.deleteTabFile(doc);

  const idx = app.docs.findIndex((d) => d.id === id);
  if (idx < 0) return false;
  app.docs.splice(idx, 1);
  if (sheetsOpenFor === id) sheetsOpenFor = null;

  if (app.docs.length === 0) {
    newTab();
  } else {
    if (app.activeId === id) {
      const next = app.docs[Math.min(idx, app.docs.length - 1)];
      app.activeId = next.id;
      emit('active-doc-changed', activeDoc());
    }
  }
  render();
  persistActiveTab();
  storage.saveTabOrder();
  board.requestRender();
  return true;
}

export function next() {
  if (app.docs.length < 2) return;
  const i = app.docs.findIndex((d) => d.id === app.activeId);
  const n = (i + 1) % app.docs.length;
  activate(app.docs[n].id);
}

export function prev() {
  if (app.docs.length < 2) return;
  const i = app.docs.findIndex((d) => d.id === app.activeId);
  const n = (i - 1 + app.docs.length) % app.docs.length;
  activate(app.docs[n].id);
}

export function reorder(fromId, toId) {
  const from = app.docs.findIndex((d) => d.id === fromId);
  const to = app.docs.findIndex((d) => d.id === toId);
  if (from < 0 || to < 0 || from === to) return;
  const [doc] = app.docs.splice(from, 1);
  app.docs.splice(to, 0, doc);
  render();
  storage.saveTabOrder();
}

/* ------------------------------- Переименование вкладки ------------------------------- */
function beginRename(id) {
  const el = listEl.querySelector(`.tab[data-id="${id}"]`);
  const doc = getDocById(id);
  if (!el || !doc) return;
  const title = el.querySelector('.tab__title');
  if (!title) return;

  const input = document.createElement('input');
  input.className = 'tab__rename';
  input.value = doc.title;
  title.replaceWith(input);
  input.focus();
  input.select();

  let committed = false;
  let finished = false;

  const finish = async (commit) => {
    if (finished) return;
    finished = true;
    input.removeEventListener('blur', onBlur);
    input.removeEventListener('keydown', onKey);
    const newName = input.value.trim();
    if (commit && newName && newName !== doc.title) {
      if (settings.warnOccupiedName !== false) {
        const busy = await storage.isNameOccupied(newName, doc.filePath);
        if (busy) {
          emit('toast', { text: 'Имя уже занято', type: 'error' });
          // Восстанавливаем редактирование
          finished = false;
          input.addEventListener('blur', onBlur);
          input.addEventListener('keydown', onKey);
          input.focus();
          input.select();
          return;
        }
      }
      const res = await storage.renameTabFile(doc, newName);
      if (!res.ok) {
        emit('toast', { text: 'Не удалось переименовать раздел', type: 'error' });
        finished = false;
        input.addEventListener('blur', onBlur);
        input.addEventListener('keydown', onKey);
        input.focus();
        input.select();
        return;
      }
      doc.title = newName;
      doc.modified = true;
      doc.meta.updated = Date.now();
      if (activeTab() === doc) persistActiveTab();
      emit('doc-changed', doc);
      storage.saveTabOrder();
      committed = true;
    }
    render();
    emit('active-doc-changed', activeDoc());
  };
  const onBlur = () => finish(true);
  const onKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      finish(true);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish(false);
      return;
    }
  };
  input.addEventListener('blur', onBlur);
  input.addEventListener('keydown', onKey);
}

export function updateActiveTabFlags() {
  if (!listEl) return;
  for (const el of listEl.querySelectorAll('.tab')) {
    const doc = getDocById(el.dataset.id);
    if (doc) el.classList.toggle('is-modified', !!doc.modified);
  }
}

/* ------------------------------- Инициализация ------------------------------- */
export function initTabs() {
  if (bound) return;
  bound = true;
  listEl = document.getElementById('tabList');
  addBtn = document.getElementById('addTabBtn');
  sheetBar = document.getElementById('sheetBar');
  sheetList = document.getElementById('sheetList');
  addSheetBtn = document.getElementById('addSheetBtn');

  if (listEl) {
    listEl.addEventListener('dragover', (e) => e.preventDefault());
    listEl.addEventListener('drop', (e) => e.preventDefault());
    // Горизонтальная прокрутка полосы вкладок колёсиком (и Shift+колёсиком).
    listEl.addEventListener(
      'wheel',
      (e) => {
        if (listEl.scrollWidth <= listEl.clientWidth) return;
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (!delta) return;
        e.preventDefault();
        listEl.scrollLeft += delta;
      },
      { passive: false }
    );
  }
  if (addSheetBtn) addSheetBtn.addEventListener('click', () => addSheet());

  on('doc-changed', updateActiveTabFlags);
  on('tabs-changed', updateActiveTabFlags);
  on('sheets-changed', updateActiveTabFlags);
}
