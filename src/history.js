'use strict';

/* ==========================================================================
   GUSketch — история изменений (undo/redo).
   Снимки массива strokes хранятся в стеке активного документа.
   ========================================================================== */

import { activeDoc, emit, markModified } from './state.js';

const LIMIT = 200;

/** Сохранить текущее состояние перед изменением. */
export function pushHistory(doc) {
  const d = doc || activeDoc();
  if (!d) return;
  d.undoStack.push(d.strokes.slice());
  if (d.undoStack.length > LIMIT) d.undoStack.shift();
  d.redoStack.length = 0;
  markModified(d);
  emit('history-changed', d);
}

function touch(d) {
  d.meta.updated = Date.now();
  markModified(d);
  emit('history-changed', d);
  emit('selection-changed', d.selection || []);
}

export function undo() {
  const d = activeDoc();
  if (!d || !d.undoStack.length) return false;
  d.redoStack.push(d.strokes.slice());
  d.strokes = d.undoStack.pop();
  d.selection = [];
  touch(d);
  return true;
}

export function redo() {
  const d = activeDoc();
  if (!d || !d.redoStack.length) return false;
  d.undoStack.push(d.strokes.slice());
  d.strokes = d.redoStack.pop();
  d.selection = [];
  touch(d);
  return true;
}

export function canUndo(doc) {
  const d = doc || activeDoc();
  return !!(d && d.undoStack.length);
}

export function canRedo(doc) {
  const d = doc || activeDoc();
  return !!(d && d.redoStack.length);
}
