'use strict';

/* ==========================================================================
   GUSketch — экспорт в PNG / PDF и копирование в буфер обмена.
   ========================================================================== */

import { app, activeDoc, activeTab, tabOf, emit } from './state.js';
import { board } from './board.js';
import * as images from './images.js';
import { ensureExt, canvasToArrayBuffer, canvasToDataUrl } from './util.js';
import { showConfirm } from './ui.js';

async function renderDocForExport(doc, background) {
  await images.ensureLoaded(doc);
  return board.renderToCanvas(doc, { padding: 50, background, scale: 2, maxSize: 4000 });
}

/** Имя файла по активной вкладке. */
function tabTitleFor(doc) {
  const t = tabOf(doc) || activeTab();
  return (t && t.title) || 'GUSketch';
}

function isModified(doc) {
  const t = tabOf(doc) || activeTab();
  return !!(t && t.modified);
}

async function askBackground() {
  const choice = await showConfirm({
    title: 'Фон изображения',
    message: 'Выберите фон для экспортируемого изображения.',
    buttons: [
      { label: 'Прозрачный', value: 'transparent', primary: true },
      { label: 'Белый', value: '#ffffff' },
      { label: 'Отмена', value: 'cancel' },
    ],
  });
  if (!choice || choice === 'cancel') return null;
  return choice;
}

async function saveCanvas(canvas, defaultName, filters) {
  const res = await window.gusketch.saveFileDialog({
    title: 'Экспорт',
    defaultPath: defaultName,
    filters,
  });
  if (!res || res.canceled || !res.filePath) return false;
  const buf = await canvasToArrayBuffer(canvas);
  const saved = await window.gusketch.saveFile(res.filePath, buf);
  if (!saved || !saved.ok) {
    emit('toast', { text: 'Не удалось сохранить файл', type: 'error' });
    return false;
  }
  return true;
}

/* ------------------------------- PNG ------------------------------- */
export async function exportPNG(doc) {
  const d = doc || activeDoc();
  if (!d) return;
  const bg = await askBackground();
  if (bg == null) return;

  emit('status', { state: 'saving', text: 'Экспорт PNG…' });
  try {
    const canvas = await renderDocForExport(d, bg);
    const ok = await saveCanvas(canvas, ensureExt(tabTitleFor(d), 'png'), [
      { name: 'PNG', extensions: ['png'] },
    ]);
    emit('status', { state: isModified(d) ? 'modified' : 'saved', text: isModified(d) ? 'Есть изменения' : 'Сохранено' });
    if (ok) emit('toast', { text: 'PNG экспортирован' });
  } catch (err) {
    emit('status', { state: 'modified', text: 'Ошибка экспорта' });
    emit('toast', { text: `Ошибка экспорта: ${err.message}`, type: 'error' });
  }
}

/* ------------------------------- PDF ------------------------------- */
function newPdf() {
  const jsPDF = window.jspdf && window.jspdf.jsPDF;
  if (!jsPDF) throw new Error('jsPDF не загружен');
  return jsPDF;
}

function pageFormat(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  return { w, h, orientation: w > h ? 'landscape' : 'portrait' };
}

export async function exportPDF(doc) {
  const d = doc || activeDoc();
  if (!d) return;

  emit('status', { state: 'saving', text: 'Экспорт PDF…' });
  try {
    const jsPDF = newPdf();
    const canvas = await renderDocForExport(d, '#ffffff');
    const fmt = pageFormat(canvas);
    const pdf = new jsPDF({ unit: 'px', format: [fmt.w, fmt.h], orientation: fmt.orientation });
    pdf.addImage(canvasToDataUrl(canvas), 'PNG', 0, 0, fmt.w, fmt.h, undefined, 'FAST');

    const res = await window.gusketch.saveFileDialog({
      title: 'Экспорт PDF',
      defaultPath: ensureExt(tabTitleFor(d), 'pdf'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (res && !res.canceled && res.filePath) {
      const buf = pdf.output('arraybuffer');
      const saved = await window.gusketch.saveFile(res.filePath, buf);
      if (saved && saved.ok) emit('toast', { text: 'PDF экспортирован' });
    }
    emit('status', { state: isModified(d) ? 'modified' : 'saved', text: isModified(d) ? 'Есть изменения' : 'Сохранено' });
  } catch (err) {
    emit('status', { state: 'modified', text: 'Ошибка экспорта' });
    emit('toast', { text: `Ошибка экспорта: ${err.message}`, type: 'error' });
  }
}

export async function exportPDFAll() {
  if (!app.docs.length) return;
  emit('status', { state: 'saving', text: 'Экспорт PDF…' });
  try {
    const jsPDF = newPdf();
    let pdf = null;

    for (let i = 0; i < app.docs.length; i++) {
      const tab = app.docs[i];
      const sheets = tab.sheets && tab.sheets.length ? tab.sheets : [tab];
      for (let j = 0; j < sheets.length; j++) {
        // eslint-disable-next-line no-await-in-loop
        const canvas = await renderDocForExport(sheets[j], '#ffffff');
        const fmt = pageFormat(canvas);
        const data = canvasToDataUrl(canvas);
        if (!pdf) {
          pdf = new jsPDF({ unit: 'px', format: [fmt.w, fmt.h], orientation: fmt.orientation });
        } else {
          pdf.addPage([fmt.w, fmt.h], fmt.orientation);
        }
        pdf.addImage(data, 'PNG', 0, 0, fmt.w, fmt.h, undefined, 'FAST');
      }
    }

    if (!pdf) return;
    const res = await window.gusketch.saveFileDialog({
      title: 'Экспорт всех вкладок',
      defaultPath: 'GUSketch.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (res && !res.canceled && res.filePath) {
      const buf = pdf.output('arraybuffer');
      const saved = await window.gusketch.saveFile(res.filePath, buf);
      if (saved && saved.ok) emit('toast', { text: 'PDF со всеми вкладками сохранён' });
    }
    const d = activeDoc();
    const mod = isModified(d);
    emit('status', { state: mod ? 'modified' : 'saved', text: mod ? 'Есть изменения' : 'Сохранено' });
  } catch (err) {
    emit('status', { state: 'modified', text: 'Ошибка экспорта' });
    emit('toast', { text: `Ошибка экспорта: ${err.message}`, type: 'error' });
  }
}

/* ------------------------------- Буфер обмена ------------------------------- */
export async function copyImage(doc) {
  const d = doc || activeDoc();
  if (!d) return;
  try {
    const canvas = await renderDocForExport(d, 'transparent');
    const dataUrl = canvasToDataUrl(canvas);
    const res = await window.gusketch.copyImage(dataUrl);
    if (res && res.ok) emit('toast', { text: 'Скопировано в буфер обмена' });
    else emit('toast', { text: 'Не удалось скопировать', type: 'error' });
  } catch (err) {
    emit('toast', { text: `Ошибка копирования: ${err.message}`, type: 'error' });
  }
}
