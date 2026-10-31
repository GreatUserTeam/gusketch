'use strict';

/* ==========================================================================
   GUSketch — элементы интерфейса: статус, тосты, модалки, панель свойств.
   ========================================================================== */

import { app, activeDoc, activeTab, on, emit, selectedObjects } from './state.js';
import { board } from './board.js';
import * as tools from './tools.js';
import * as history from './history.js';
import { openColorPicker } from './colorpicker.js';

const PALETTE = ['#f0f0f0', '#000000', '#ff4d30', '#ffb020', '#33d17a', '#2ea8ff', '#8b5cf6', '#ff2d95'];

let propsDragging = false;

/* ------------------------------- Тосты ------------------------------- */
function pushToast(detail) {
  const container = document.getElementById('toasts');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast' + (detail && detail.type === 'error' ? ' toast--error' : '');
  el.textContent = (detail && detail.text) || '';
  container.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s ease';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 320);
  }, 2600);
}

/* ------------------------------- Модалка подтверждения ------------------------------- */
export function showConfirm({ title, message, buttons } = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirmModal');
    const t = document.getElementById('confirmTitle');
    const m = document.getElementById('confirmMessage');
    const actions = document.getElementById('confirmActions');
    if (!modal) {
      resolve(null);
      return;
    }
    if (t) t.textContent = title || 'Подтверждение';
    if (m) m.textContent = message || '';
    actions.innerHTML = '';

    const close = (value) => {
      modal.hidden = true;
      modal.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onBackdrop = (e) => {
      if (e.target.closest('[data-close]')) close(null);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(null);
    };

    (buttons || []).forEach((b) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn' + (b.primary ? ' btn--primary' : '') + (b.danger ? ' btn--danger' : '');
      btn.textContent = b.label;
      btn.addEventListener('click', () => close(b.value));
      actions.appendChild(btn);
    });

    modal.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
    modal.hidden = false;
  });
}

/* ------------------------------- Статус и заголовок ------------------------------- */
export function updateStatus() {
  const doc = activeDoc();
  const tab = activeTab();
  const el = document.getElementById('status');
  const text = el && el.querySelector('.status__text');
  const empty = !doc || doc.strokes.length === 0;
  const modified = tab ? tab.modified : doc && doc.modified;
  if (el && text) {
    if (empty) {
      el.dataset.state = 'empty';
      text.textContent = 'Пустая тема';
    } else if (modified) {
      el.dataset.state = 'modified';
      text.textContent = 'Есть изменения';
    } else {
      el.dataset.state = 'saved';
      text.textContent = 'Сохранено';
    }
  }
  const name = tab ? tab.title : doc ? doc.title : '';
  const title = name ? `GUSketch — ${name}${modified && !empty ? ' *' : ''}` : 'GUSketch';
  try {
    window.gusketch.setTitle(title);
  } catch (_) {
    /* noop */
  }
}

export function setStatus(state, text) {
  const el = document.getElementById('status');
  if (!el) return;
  el.dataset.state = state;
  const t = el.querySelector('.status__text');
  if (t) t.textContent = text;
}

/* ------------------------------- История (кнопки) ------------------------------- */
export function updateHistoryButtons() {
  const undo = document.getElementById('undoBtn');
  const redo = document.getElementById('redoBtn');
  const clear = document.getElementById('clearBtn');
  const doc = activeDoc();
  if (undo) undo.disabled = !history.canUndo(doc);
  if (redo) redo.disabled = !history.canRedo(doc);
  if (clear) clear.disabled = !doc || doc.strokes.length === 0;
}

/* ------------------------------- Панель свойств ------------------------------- */
function row(label, control) {
  const wrap = document.createElement('div');
  wrap.className = 'prop-row';
  const l = document.createElement('span');
  l.className = 'prop-label';
  l.textContent = label;
  wrap.append(l, control);
  return wrap;
}

function toggleRow(label, checked, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'prop-row prop-row--row';
  const l = document.createElement('span');
  l.className = 'prop-label';
  l.textContent = label;
  const sw = document.createElement('input');
  sw.type = 'checkbox';
  sw.className = 'switch';
  sw.checked = !!checked;
  sw.addEventListener('change', () => onChange(sw.checked));
  wrap.append(l, sw);
  return wrap;
}

function slider({ min, max, value, onInput, onCommitStart }) {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.alignItems = 'center';
  wrap.style.gap = '10px';
  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'size__range';
  input.min = String(min);
  input.max = String(max);
  input.value = String(value);
  const out = document.createElement('output');
  out.className = 'prop-value';
  out.textContent = String(value);
  let dirty = false;
  input.addEventListener('pointerdown', () => {
    dirty = false;
    propsDragging = true;
    onCommitStart && onCommitStart();
  });
  const endDrag = () => {
    propsDragging = false;
  };
  input.addEventListener('pointerup', endDrag);
  input.addEventListener('change', endDrag);
  input.addEventListener('input', () => {
    out.textContent = input.value;
    onInput(Number(input.value), () => dirty, () => {
      dirty = true;
    });
  });
  wrap.append(input, out);
  return wrap;
}

function palette(current, onPick) {
  const wrap = document.createElement('div');
  wrap.className = 'palette';
  for (const color of PALETTE) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch' + (current && current.toLowerCase() === color.toLowerCase() ? ' is-active' : '');
    b.style.background = color;
    b.title = color;
    b.addEventListener('click', () => onPick(color));
    wrap.appendChild(b);
  }
  const custom = document.createElement('button');
  custom.type = 'button';
  custom.className = 'swatch swatch--custom';
  custom.style.background = current && /^#[0-9a-f]{6}$/i.test(current) ? current : '#ff4d30';
  custom.title = 'Свой цвет';
  custom.addEventListener('click', async () => {
    const picked = await openColorPicker({ value: current || '#ff4d30', alpha: true, title: 'Свой цвет' });
    if (picked) onPick(picked);
  });
  wrap.appendChild(custom);
  return wrap;
}

function btnRow(buttons) {
  const wrap = document.createElement('div');
  wrap.className = 'prop-btns';
  for (const b of buttons) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'mini-btn' + (b.danger ? ' mini-btn--danger' : '');
    el.textContent = b.label;
    el.addEventListener('click', b.onClick);
    wrap.appendChild(el);
  }
  return wrap;
}

export function renderProperties() {
  if (propsDragging) return;
  const panel = document.getElementById('properties');
  const body = document.getElementById('propsBody');
  const titleEl = document.getElementById('propsTitle');
  if (!panel || !body) return;

  const doc = activeDoc();
  const objs = selectedObjects(doc);
  if (!objs.length) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  body.innerHTML = '';

  if (objs.length > 1) {
    titleEl.textContent = `Выбрано: ${objs.length}`;
    body.appendChild(
      btnRow([
        { label: 'Удалить', danger: true, onClick: () => tools.deleteSelection() },
        { label: 'На передний', onClick: () => tools.selectionToFront() },
        { label: 'На задний', onClick: () => tools.selectionToBack() },
      ])
    );
    return;
  }

  const obj = objs[0];

  if (obj.kind === 'image') {
    titleEl.textContent = obj.name || 'Изображение';
    body.appendChild(
      row(
        'Прозрачность',
        slider({
          min: 0,
          max: 100,
          value: Math.round((obj.opacity == null ? 1 : obj.opacity) * 100),
          onCommitStart: () => {},
          onInput: (v, isDirty, markDirty) => {
            if (!isDirty()) {
              history.pushHistory(doc);
              markDirty();
            }
            obj.opacity = v / 100;
            emit('doc-changed', doc);
            board.requestRender();
          },
        })
      )
    );
  } else if (obj.shape) {
    const s = obj.shape;
    titleEl.textContent = 'Фигура';
    body.appendChild(
      row(
        'Толщина',
        slider({
          min: 0,
          max: 100,
          value: s.width,
          onInput: (v, isDirty, markDirty) => {
            if (!isDirty()) {
              history.pushHistory(doc);
              markDirty();
            }
            s.width = v;
            emit('doc-changed', doc);
            board.requestRender();
          },
        })
      )
    );
    body.appendChild(
      toggleRow('Обводка', s.strokeEnabled !== false, (v) => {
        history.pushHistory(doc);
        s.strokeEnabled = v;
        emit('doc-changed', doc);
        board.requestRender();
      })
    );
    body.appendChild(row('Цвет обводки', palette(s.color, (c) => {
      history.pushHistory(doc);
      s.color = c;
      s.auto = false;
      emit('doc-changed', doc);
      board.requestRender();
      renderProperties();
    })));
    body.appendChild(
      toggleRow('Заливка', !!s.fill, (v) => {
        history.pushHistory(doc);
        s.fill = v;
        emit('doc-changed', doc);
        board.requestRender();
      })
    );
    body.appendChild(row('Цвет заливки', palette(s.fillColor || '#ff4d30', (c) => {
      history.pushHistory(doc);
      s.fillColor = c;
      emit('doc-changed', doc);
      board.requestRender();
      renderProperties();
    })));
  } else if (obj.type === 'text') {
    titleEl.textContent = 'Текст';
    body.appendChild(
      row(
        'Размер',
        slider({
          min: 10,
          max: 200,
          value: obj.size || 24,
          onInput: (v, isDirty, markDirty) => {
            if (!isDirty()) {
              history.pushHistory(doc);
              markDirty();
            }
            obj.size = v;
            emit('doc-changed', doc);
            board.requestRender();
          },
        })
      )
    );
    body.appendChild(row('Цвет', palette(obj.color, (c) => {
      history.pushHistory(doc);
      obj.color = c;
      obj.auto = false;
      emit('doc-changed', doc);
      board.requestRender();
      renderProperties();
    })));
    body.appendChild(
      btnRow([
        { label: 'Удалить', danger: true, onClick: () => tools.deleteSelection() },
        { label: 'На передний', onClick: () => tools.selectionToFront() },
        { label: 'На задний', onClick: () => tools.selectionToBack() },
      ])
    );
  } else {
    panel.hidden = true;
    return;
  }

  body.appendChild(
    btnRow([
      { label: 'Удалить', danger: true, onClick: () => tools.deleteSelection() },
      { label: 'На передний', onClick: () => tools.selectionToFront() },
      { label: 'На задний', onClick: () => tools.selectionToBack() },
    ])
  );
}

/* ------------------------------- Инициализация ------------------------------- */
let bound = false;

export function initUI() {
  if (bound) return;
  bound = true;

  on('toast', pushToast);
  on('status', (s) => setStatus(s.state, s.text));
  on('doc-changed', () => {
    updateStatus();
    updateHistoryButtons();
    renderProperties();
  });
  on('active-doc-changed', () => {
    updateStatus();
    updateHistoryButtons();
    renderProperties();
  });
  on('tabs-changed', () => {
    updateStatus();
    updateHistoryButtons();
  });
  on('history-changed', () => {
    updateHistoryButtons();
    renderProperties();
  });
  on('selection-changed', () => renderProperties());
  on('tool-changed', () => renderProperties());
}
