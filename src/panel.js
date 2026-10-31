'use strict';

/* ==========================================================================
   GUSketch — панель инструментов, панель параметров и пресеты.
   Управляет сворачиванием панели, панелью параметров активного инструмента,
   плитками-пресетами (drag&drop, редактирование, удаление) и выбором фигур.
   ========================================================================== */

import { app, activeDoc, emit, selectedObjects } from './state.js';
import * as tools from './tools.js';
import * as settings from './settings.js';
import { updateRangeProgress } from './settings.js';
import * as history from './history.js';
import { board } from './board.js';
import { showConfirm } from './ui.js';
import { openMiniPicker } from './colorpicker.js';
import { clamp, clampToViewport } from './util.js';
import { t } from './i18n.js';

/* ------------------------------- Иконки фигур ------------------------------- */
const SHAPE_ICONS = {
  square: '<rect x="5" y="5" width="14" height="14" rx="1.5"/>',
  rect: '<rect x="3" y="6.5" width="18" height="11" rx="1.5"/>',
  trapezoid: '<path d="M8 6h8l4 12H4Z"/>',
  rightTrapezoid: '<path d="M5 6h11l3 12H5Z"/>',
  circle: '<circle cx="12" cy="12" r="7.5"/>',
  ring: '<circle cx="12" cy="12" r="7.5"/>',
  rhombus: '<path d="M12 4l8 8-8 8-8-8Z"/>',
  parallelogram: '<path d="M8 6h11l-3 12H5Z"/>',
  'triangle-equilateral': '<path d="M12 4l7 14H5Z"/>',
  'triangle-right': '<path d="M5 5v14h14Z"/>',
  triangle: '<path d="M7 4l14 15H3Z"/>',
};

function svg(inner, size = 20) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

const TOOL_TITLES = {
  brush: 'paramBrush',
  marker: 'paramMarker',
  eraser: 'paramEraser',
  shape: 'paramShape',
  line: 'paramLine',
  arrow: 'paramArrow',
  text: 'paramText',
  move: 'toolMove',
  lasso: 'toolLasso',
  hand: 'toolHand',
};

/* ------------------------------- Состояние панели ------------------------------- */
const panelState = {
  open: false,
  pinned: false,
  tool: null,
};

let toolbarEl = null;
let toolListEl = null;
let bubbleEl = null;
let panelEl = null;
let handleEl = null;
let bodyEl = null;
let titleEl = null;
let bound = false;
let collapseBound = false;

/* ------------------------------- DOM-хелперы ------------------------------- */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function field(label, control) {
  const wrap = el('div', 'pf');
  if (label) wrap.appendChild(el('span', 'pf__label', label));
  wrap.appendChild(control);
  return wrap;
}

function slider({ min, max, value, unit = '', onInput, onStart }) {
  const wrap = el('div', 'pf__inline');
  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'size__range';
  input.min = String(min);
  input.max = String(max);
  input.value = String(value);
  const out = el('output', 'pf__value', `${value}${unit}`);
  if (onStart) input.addEventListener('pointerdown', () => onStart());
  input.addEventListener('input', () => {
    out.textContent = `${input.value}${unit}`;
    onInput(Number(input.value));
  });
  wrap.append(input, out);
  // Обновить закраску трека до thumb'а
  if (typeof updateRangeProgress === 'function') updateRangeProgress(input);
  return wrap;
}

function switchControl(checked, onChange) {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'switch';
  input.checked = !!checked;
  input.addEventListener('change', () => onChange(input.checked));
  return input;
}

/* ----------------------------------------------------------/* --------------------------------------------------------------------------
   Плитки выбора цвета: 10 штук в сетке 5×2, первая — «Тема».
   При наведении на плитку появляется кнопка «изменить» (карандаш),
   открывающая мини-панель выбора цвета.
   -------------------------------------------------------------------------- */
function getPaletteColors(kind) {
  if (kind) {
    if (!settings.settings.palette) settings.settings.palette = {};
    if (!settings.settings.palette[kind] || settings.settings.palette[kind].length !== 10) {
      const def = settings.defaultPalette();
      settings.settings.palette[kind] = def.slice();
    }
    return settings.settings.palette[kind];
  }
  if (!Array.isArray(settings.settings.palette) || settings.settings.palette.length !== 10) {
    settings.settings.palette = settings.defaultPalette();
  }
  return settings.settings.palette;
}

function palette(kindOrCurrent, currentColorOrAuto, maybeAuto, maybeOnPick, maybeOnAuto) {
  const wrap = el('div', 'palette palette--tiles');
  let kind = null;
  let colors = [];
  let isAuto = false;
  let currentColor = null;
  let onPick = null;
  let onAuto = null;
  if (typeof kindOrCurrent === 'string') {
    kind = kindOrCurrent;
    colors = getPaletteColors(kind);
    isAuto = !!currentColorOrAuto;
    currentColor = maybeAuto;
    onPick = maybeOnPick;
    onAuto = maybeOnAuto;
  } else {
    colors = getPaletteColors();
    isAuto = !!currentColorOrAuto;
    currentColor = kindOrCurrent;
    onPick = currentColorOrAuto === false || currentColorOrAuto === true ? null : currentColorOrAuto;
    onAuto = maybeAuto;
  }
  colors.forEach((color, index) => {
    const isTheme = index === 0 || !color;
    let active = false;
    if (kind) {
      if (isTheme) active = !!isAuto;
      else active = !isAuto && !!currentColor && String(color).toLowerCase() === String(currentColor).toLowerCase();
    } else {
      active = isTheme ? !!isAuto : !isAuto && !!currentColor && String(color).toLowerCase() === String(currentColor).toLowerCase();
    }
    const tile = el('div', 'palette-tile' + (active ? ' is-active' : ''));
    const btn = el('button', 'palette-tile__btn' + (isTheme ? ' palette-tile__btn--theme' : ''));
    btn.type = 'button';
    if (isTheme) {
      btn.textContent = 'Тема';
      btn.title = 'Цвет темы';
      btn.addEventListener('click', () => onAuto && onAuto());
    } else {
      btn.style.background = color;
      btn.title = color;
      btn.addEventListener('click', () => onPick && onPick(color));
    }
    tile.appendChild(btn);
    if (!isTheme) {
      const edit = el('button', 'palette-tile__edit');
      edit.type = 'button';
      edit.title = 'Изменить цвет';
      edit.innerHTML = svg('<path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="m13 5 4 4"/>', 11);
      edit.addEventListener('click', async (e) => {
        e.stopPropagation();
        const picked = await openMiniPicker(edit, { value: color, alpha: true });
        if (!picked) return;
        if (kind) {
          settings.settings.palette[kind][index] = picked;
          settings.save();
        } else {
          colors[index] = picked;
          settings.save();
        }
        renderParamPanel();
      });
      tile.appendChild(edit);
    }
    wrap.appendChild(tile);
  });
  return wrap;
}
function segment(options, value, onChange) {
  const seg = el('div', 'seg seg--compact');
  seg.style.setProperty('--seg-count', String(options.length));
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  seg.style.setProperty('--seg-index', String(idx));
  const thumb = el('span', 'seg__thumb');
  thumb.setAttribute('aria-hidden', 'true');
  seg.appendChild(thumb);
  options.forEach((o) => {
    const b = el('button', 'seg__btn' + (o.value === value ? ' is-active' : ''), o.label);
    b.type = 'button';
    b.addEventListener('click', () => onChange(o.value));
    seg.appendChild(b);
  });
  return seg;
}

/* ------------------------------- Пресеты ------------------------------- */
function presetDotSize(width) {
  return clamp(6 + (width || 10) * 0.45, 6, 30);
}

function renderPresets(container, kind) {
  const list = settings.settings.presets[kind] || [];
  const ts = settings.getToolSettings(kind);
  const grid = el('div', 'preset-grid');

  list.forEach((preset, index) => {
    const tile = el('div', 'preset-tile');
    tile.draggable = true;
    tile.dataset.index = String(index);
    const opacityMatch =
      kind !== 'marker' || (ts.opacity == null ? 40 : ts.opacity) === (preset.opacity == null ? 40 : preset.opacity);
    const active = (ts.width || 0) === preset.width && (ts.color || '') === (preset.color || '') && opacityMatch;
    if (active) tile.classList.add('is-active');

    const dot = el('span', 'preset-dot');
    const d = presetDotSize(preset.width);
    dot.style.width = `${d}px`;
    dot.style.height = `${d}px`;
    const color = preset.color || app.ink;
    dot.style.background = color;

    const toolsWrap = el('div', 'preset-tools');
    const edit = el('button', 'preset-tool');
    edit.type = 'button';
    edit.title = 'Изменить';
    edit.innerHTML = svg('<path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="m13 5 4 4"/>', 11);
    edit.addEventListener('click', (e) => {
      e.stopPropagation();
      openPresetEditor(kind, index, tile);
    });
    const del = el('button', 'preset-tool preset-tool--del');
    del.type = 'button';
    del.title = 'Удалить';
    del.innerHTML = svg('<path d="M6 6l12 12M18 6 6 18"/>', 11);
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      deletePreset(kind, index);
    });
    toolsWrap.append(edit, del);

    tile.append(dot, toolsWrap);
    tile.title = `${preset.width} px`;
    tile.addEventListener('click', () => applyPreset(kind, preset));

    // Drag & drop
    tile.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', String(index));
      e.dataTransfer.effectAllowed = 'move';
      tile.classList.add('dragging');
    });
    tile.addEventListener('dragend', () => tile.classList.remove('dragging'));
    tile.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    tile.addEventListener('drop', (e) => {
      e.preventDefault();
      const from = Number(e.dataTransfer.getData('text/plain'));
      if (Number.isInteger(from) && from !== index) reorderPreset(kind, from, index);
    });

    grid.appendChild(tile);
  });

  const add = el('button', 'preset-tile preset-add');
  add.type = 'button';
  add.title = 'Добавить плитку';
  add.innerHTML = svg('<path d="M12 5v14M5 12h14"/>', 16);
  const cur = settings.getToolSettings(kind);
  add.addEventListener('click', () =>
    addPreset(kind, {
      width: cur.width || 10,
      color: cur.color || '',
      opacity: kind === 'marker' ? (cur.opacity == null ? 40 : cur.opacity) : undefined,
    })
  );
  grid.appendChild(add);

  container.appendChild(grid);
}

function applyPreset(kind, preset) {
  const ts = settings.getToolSettings(kind);
  ts.width = preset.width;
  ts.color = preset.color || '';
  if (kind === 'marker' || kind === 'arrow') {
    ts.opacity = preset.opacity == null ? (kind === 'marker' ? 40 : 100) : preset.opacity;
  }
  app.width = ts.width;
  settings.save();
  emit('width-changed', ts.width);
  board.requestRender();
  renderParamPanel();
}

function addPreset(kind, preset) {
  const list = settings.settings.presets[kind] || (settings.settings.presets[kind] = []);
  const item = { width: preset.width, color: preset.color || '' };
  if (preset.opacity != null) item.opacity = preset.opacity;
  list.push(item);
  settings.save();
  renderParamPanel();
}

function reorderPreset(kind, from, to) {
  const list = settings.settings.presets[kind];
  if (!list || from < 0 || from >= list.length) return;
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
  settings.save();
  renderParamPanel();
}

async function deletePreset(kind, index) {
  if (settings.settings.askBeforeDeletePreset !== false) {
    const choice = await showConfirm({
      title: 'Удалить плитку?',
      message: 'Плитку-пресет будет удалена.',
      buttons: [
        { label: 'Удалить', value: 'yes', primary: true, danger: true },
        { label: 'Отмена', value: 'cancel' },
      ],
    });
    if (choice !== 'yes') return;
  }
  const list = settings.settings.presets[kind];
  if (!list) return;
  list.splice(index, 1);
  settings.save();
  renderParamPanel();
}

/* Мини-окно редактирования плитки */
let editorEl = null;
function openPresetEditor(kind, index, anchor) {
  closePresetEditor();
  const list = settings.settings.presets[kind];
  if (!list) return;
  const preset = list[index];
  editorEl = el('div', 'preset-editor');

  const colorRow = el('div', 'preset-editor__row');
  colorRow.appendChild(el('span', 'pf__label', 'Цвет'));
  let useTheme = !preset.color;
  let chosenColor = preset.color || app.ink;
  const colorBtn = el('button', 'color-swatch-btn');
  colorBtn.type = 'button';
  colorBtn.style.background = chosenColor;
  colorBtn.title = 'Выбрать цвет';
  colorBtn.addEventListener('click', async () => {
    const picked = await openMiniPicker(colorBtn, { value: chosenColor, alpha: true });
    if (!picked) return;
    useTheme = false;
    chosenColor = picked;
    colorBtn.style.background = picked;
    themeBtn.classList.remove('is-active');
  });
  colorRow.appendChild(colorBtn);
  const themeBtn = el('button', 'mini-btn', 'Тема');
  themeBtn.type = 'button';
  themeBtn.addEventListener('click', () => {
    useTheme = true;
    themeBtn.classList.add('is-active');
  });
  if (useTheme) themeBtn.classList.add('is-active');
  colorRow.appendChild(themeBtn);
  editorEl.append(colorRow);

  // Толщина.
  const widthRow = el('div', 'preset-editor__row');
  widthRow.appendChild(el('span', 'pf__label', 'Толщина'));
  const range = document.createElement('input');
  range.type = 'range';
  range.className = 'size__range';
  range.min = '1';
  range.max = '100';
  range.value = String(preset.width);
  const out = el('output', 'pf__value', `${preset.width} px`);
  range.addEventListener('input', () => {
    out.textContent = `${range.value} px`;
  });
  widthRow.append(range, out);
  editorEl.append(widthRow);
  updateRangeProgress(range);

  // Прозрачность — только для маркера.
  let opacityRange = null;
  if (kind === 'marker') {
    const opRow = el('div', 'preset-editor__row');
    opRow.appendChild(el('span', 'pf__label', 'Прозрачность'));
    opacityRange = document.createElement('input');
    opacityRange.type = 'range';
    opacityRange.className = 'size__range';
    opacityRange.min = '5';
    opacityRange.max = '100';
    const opVal = preset.opacity == null ? 40 : preset.opacity;
    opacityRange.value = String(opVal);
    const opOut = el('output', 'pf__value', `${opVal}%`);
    opacityRange.addEventListener('input', () => {
      opOut.textContent = `${opacityRange.value}%`;
    });
    opRow.append(opacityRange, opOut);
    editorEl.append(opRow);
    updateRangeProgress(opacityRange);
  }

  const actions = el('div', 'preset-editor__actions');
  const ok = el('button', 'mini-btn mini-btn--accent', 'Готово');
  ok.type = 'button';
  ok.addEventListener('click', () => {
    preset.color = useTheme ? '' : chosenColor;
    preset.width = Number(range.value);
    if (opacityRange) preset.opacity = Number(opacityRange.value);
    settings.save();
    closePresetEditor();
    renderParamPanel();
  });
  actions.appendChild(ok);

  editorEl.append(actions);
  panelEl.appendChild(editorEl);

  // Позиционируем панель рядом с якорем, не давая уйти за края panelEl.
  const pr = panelEl.getBoundingClientRect();
  const ar = anchor.getBoundingClientRect();
  const er = editorEl.getBoundingClientRect();

  // По горизонтали: слева от анкера, но не за левым краем панели.
  let left = ar.left - pr.left - 20;
  const minLeft = 4;
  const maxLeft = Math.max(minLeft, pr.width - er.width - 4);
  if (left < minLeft) left = minLeft;
  if (left > maxLeft) left = maxLeft;

  // По вертикали: снизу от анкера, но не за нижним краем экрана.
  let top = ar.bottom - pr.top + 4;
  const prScreenTop = pr.top;
  const editorScreenBottom = prScreenTop + top + er.height;
  const maxScreenBottom = window.innerHeight - 8;
  if (editorScreenBottom > maxScreenBottom) {
    // Сдвигаем вверх, чтобы влезло на экран.
    const overflow = editorScreenBottom - maxScreenBottom;
    top = Math.max(4, top - overflow);
  }

  editorEl.style.left = `${left}px`;
  editorEl.style.top = `${top}px`;
}

function closePresetEditor() {
  if (editorEl && editorEl.parentNode) editorEl.parentNode.removeChild(editorEl);
  editorEl = null;
}

/* ------------------------------- Рендер панели ------------------------------- */
function renderBrushPanel(container) {
  const tool = app.tool;
  // Толщина (и прозрачность маркера) настраиваются только плитками-пресетами.
  renderPresets(container, tool);
}

function renderShapeGrid(container) {
  const grid = el('div', 'shape-grid');
  for (const item of shapesList()) {
    const b = el('button', 'shape-tile' + (app.shapeKind === item.kind ? ' is-active' : ''));
    b.type = 'button';
    b.title = t(item.label);
    b.innerHTML = svg(SHAPE_ICONS[item.kind] || '', 22);
    b.addEventListener('click', () => {
      app.shapeKind = item.kind;
      settings.getToolSettings('shape').kind = item.kind;
      settings.save();
      updateShapeIcon();
      renderParamPanel();
    });
    grid.appendChild(b);
  }
  container.appendChild(grid);
}

function shapesList() {
  // Локальный список, чтобы не тянуть циклический импорт shapes.js.
  return [
    { kind: 'square', label: 'shapeSquare' },
    { kind: 'rect', label: 'shapeRect' },
    { kind: 'trapezoid', label: 'shapeTrapezoid' },
    { kind: 'rightTrapezoid', label: 'shapeRightTrapezoid' },
    { kind: 'circle', label: 'shapeCircle' },
    { kind: 'ring', label: 'shapeRing' },
    { kind: 'rhombus', label: 'shapeRhombus' },
    { kind: 'parallelogram', label: 'shapeParallelogram' },
    { kind: 'triangle-equilateral', label: 'shapeTriangleEquilateral' },
    { kind: 'triangle-right', label: 'shapeTriangleRight' },
    { kind: 'triangle', label: 'shapeTriangle' },
  ];
}

function renderShapePanel(container) {
  const ts = settings.getToolSettings('shape');
  const gridWrap = el('div', 'pf');
  gridWrap.appendChild(el('span', 'pf__label', t('paramShape')));
  const helper = el('div');
  gridWrap.appendChild(helper);
  container.appendChild(gridWrap);
  renderShapeGrid(helper);

  /* --- Обводка --- */
  const strokeToggle = el('div', 'pf pf--row');
  strokeToggle.appendChild(el('span', 'pf__label', t('paramStroke')));
  strokeToggle.appendChild(
    switchControl(ts.strokeEnabled !== false, (v) => {
      ts.strokeEnabled = v;
      settings.save();
      renderParamPanel();
    })
  );
  container.appendChild(strokeToggle);

  const ink = settings.toolInk('shape');
  container.appendChild(
    field(
      t('paramStrokeColor'),
      palette('stroke', ts.strokeEnabled === false, ink.color, (c) => {
        ts.color = c;
        ts.strokeColor = c;
        ts.strokeEnabled = true;
        settings.save();
        renderParamPanel();
      }, () => {
        ts.color = '';
        ts.strokeColor = '';
        settings.save();
        renderParamPanel();
      })
    )
  );
  container.appendChild(
    field(
      t('paramStrokeWidth'),
      slider({
        min: 0,
        max: 100,
        value: ts.width == null ? 5 : ts.width,
        unit: ' px',
        onInput: (v) => {
          ts.width = v;
          app.width = v;
          settings.save();
          emit('width-changed', v);
        },
      })
    )
  );
  container.appendChild(
    field(
      t('paramStrokeOpacity'),
      slider({
        min: 0,
        max: 100,
        value: ts.strokeOpacity == null ? 100 : ts.strokeOpacity,
        unit: '%',
        onInput: (v) => {
          ts.strokeOpacity = v;
          settings.save();
        },
      })
    )
  );

  /* --- Заливка (независима от обводки) --- */
  const fillRow = el('div', 'pf pf--row');
  fillRow.appendChild(el('span', 'pf__label', t('paramFill')));
  fillRow.appendChild(
    switchControl(ts.fill, (v) => {
      ts.fill = v;
      settings.save();
      renderParamPanel();
    })
  );
  container.appendChild(fillRow);

  container.appendChild(
    field(
      t('paramFillColor'),
      palette('fill', ts.fillColor || '#ffffff', false, (c) => {
        ts.fillColor = c;
        ts.fillEnabled = true;
        ts.fill = true;
        settings.save();
        renderParamPanel();
      }, () => {
        ts.fillColor = '';
        settings.save();
        renderParamPanel();
      })
    )
  );
  container.appendChild(
    field(
      t('paramFillOpacity'),
      slider({
        min: 0,
        max: 100,
        value: ts.fillOpacity == null ? 100 : ts.fillOpacity,
        unit: '%',
        onInput: (v) => {
          ts.fillOpacity = v;
          settings.save();
        },
      })
    )
  );
}

function renderLinePanel(container, tool) {
  const ts = settings.getToolSettings(tool);
  if (tool === 'arrow') {
    // Толщина и прозрачность стрелки задаются только плитками-пресетами.
    renderPresets(container, 'arrow');
    return;
  }

  // Выделенные линии/стрелки в текущем документе.
  const selectedShapes = () => {
    const doc = activeDoc();
    if (!doc) return [];
    return selectedObjects(doc).filter((o) => o.kind === 'line' || o.kind === 'arrow');
  };

  // Применяем мутатор ко всем выделенным линиям/стрелкам (через копии для истории).
  const applyToSelected = (mutate, pushHistory) => {
    const doc = activeDoc();
    const objs = selectedShapes();
    if (!doc || !objs.length) return;
    const ids = new Set(objs.map((o) => o.id));
    if (pushHistory) history.pushHistory(doc);
    doc.strokes = doc.strokes.map((o) => {
      if (!ids.has(o.id)) return o;
      const copy = { ...o };
      mutate(copy);
      return copy;
    });
    emit('doc-changed', doc);
    board.requestRender();
  };

  const hasSelected = selectedShapes().length > 0;
  const currentWidth = hasSelected ? (selectedShapes()[0].width || 5) : (ts.width || 5);

  container.appendChild(
    field(
      t('paramWidth'),
      slider({
        min: 1,
        max: 40,
        value: currentWidth,
        unit: ' px',
        onStart: () => {
          if (!selectedShapes().length) return;
          const doc = activeDoc();
          if (doc) history.pushHistory(doc);
        },
        onInput: (v) => {
          ts.width = v;
          app.width = v;
          settings.save();
          emit('width-changed', v);
          applyToSelected((o) => { o.width = v; }, false);
        },
      })
    )
  );

  const sel = selectedShapes();
  const ink = settings.toolInk(tool);
  const currentColor = sel.length ? (sel[0].strokeColor != null ? sel[0].strokeColor : sel[0].color) : ink.color;

  container.appendChild(
    field(
      t('paramColor'),
      palette('line', ink.auto, currentColor, (c) => {
        ts.color = c;
        settings.save();
        applyToSelected((o) => {
          o.color = c;
          o.strokeColor = c;
          o.auto = false;
        }, true);
        renderParamPanel();
      }, () => {
        ts.color = '';
        settings.save();
        applyToSelected((o) => {
          o.color = '';
          o.strokeColor = null;
          o.auto = true;
        }, true);
        renderParamPanel();
      })
    )
  );
}

function renderTextPanel(container) {
  const ts = settings.getToolSettings('text');

  const selectedTexts = () => {
    const doc = activeDoc();
    if (!doc) return [];
    return selectedObjects(doc).filter((o) => o.type === 'text');
  };
  // Заменяем объекты копиями, чтобы изменения были отменяемыми.
  const applyToSelected = (mutate, pushHistory) => {
    const doc = activeDoc();
    const objs = selectedTexts();
    if (!doc || !objs.length) return;
    const ids = new Set(objs.map((o) => o.id));
    if (pushHistory) history.pushHistory(doc);
    doc.strokes = doc.strokes.map((o) => {
      if (!ids.has(o.id)) return o;
      const copy = { ...o };
      mutate(copy);
      return copy;
    });
    emit('doc-changed', doc);
  };

  const fontSelect = document.createElement('select');
  fontSelect.className = 'param-select';
  for (const f of settings.FONT_LIST) {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f;
    fontSelect.appendChild(opt);
  }
  fontSelect.value = ts.font || 'Inter';
  // Применяется сразу, в том числе к выделенным текстовым блокам.
  fontSelect.addEventListener('change', () => {
    ts.font = fontSelect.value;
    settings.save();
    applyToSelected((o) => {
      o.font = fontSelect.value;
    }, true);
    // синхронизируем редактор, если открыт
    const te = document.getElementById('textEditor');
    if (te && !te.hidden) {
      te.style.fontFamily = `"${fontSelect.value}", sans-serif`;
    }
    renderParamPanel();
  });
  container.appendChild(field(t('paramFont'), fontSelect));

  container.appendChild(
    field(
      t('paramSize'),
      slider({
        min: 8,
        max: 72,
        value: ts.size || 24,
        unit: ' px',
        onStart: () => {
          if (!selectedTexts().length) return;
          const doc = activeDoc();
          if (doc) history.pushHistory(doc);
        },
        onInput: (v) => {
          ts.size = v;
          settings.save();
          applyToSelected((o) => {
            o.size = v;
          }, false);
        },
      })
    )
  );

  // Если есть выбранные тексты, показываем их параметры
  const sel = selectedTexts();
  const hasSelected = sel.length > 0;
  const currentColor = sel.length ? sel[0].color : settings.toolInk('text').color;
  const currentAuto = sel.length ? !!sel[0].auto : settings.toolInk('text').auto;
  container.appendChild(
    field(
      t('paramColor'),
      palette('text',
        currentColor,
        currentAuto,
        (c) => {
          ts.color = c;
          settings.save();
          applyToSelected((o) => {
            o.color = c;
            o.auto = false;
          }, true);
          renderParamPanel();
        },
        () => {
          ts.color = '';
          settings.save();
          applyToSelected((o) => {
            o.auto = true;
          }, true);
          renderParamPanel();
        }
      )
    )
  );

  if (sel.length) {
    container.appendChild(
      el('div', 'pf pf--row pf--end',
        btn(t('btnDelete'), () => {
          const doc = activeDoc();
          const ids = new Set(sel.map((o) => o.id));
          if (doc) {
            history.pushHistory(doc);
            doc.strokes = doc.strokes.filter((o) => !ids.has(o.id));
            if (Array.isArray(doc.selection)) doc.selection = doc.selection.filter((id) => !ids.has(id));
            emit('doc-changed', doc);
          }
        }, 'danger'),
        btn(t('btnFront'), () => tools.selectionToFront()),
        btn(t('btnBack'), () => tools.selectionToBack())
      )
    );
  }
}

function renderHint(container, text) {
  container.appendChild(el('p', 'param-hint', text));
}

export function renderParamPanel() {
  if (!panelEl || !bodyEl || !titleEl) return;
  if (!panelState.open || !app.tool) {
    panelEl.hidden = true;
    showExpandButton();
    return;
  }
  const tool = app.tool;
  panelState.tool = tool;
  titleEl.textContent = t(TOOL_TITLES[tool]) || t('paramShape');
  bodyEl.innerHTML = '';
  closePresetEditor();

  if (tool === 'brush' || tool === 'marker') renderBrushPanel(bodyEl);
  else if (tool === 'eraser') {
    const ts = settings.getToolSettings('eraser');
    bodyEl.appendChild(
      field(
        t('paramMode'),
        segment(
          [
            { label: t('paramModeObject'), value: 'object' },
            { label: t('paramModeHole'), value: 'hole' },
          ],
          ts.mode || 'object',
          (v) => {
            ts.mode = v;
            settings.save();
            renderParamPanel();
          }
        )
      )
    );
    bodyEl.appendChild(
      field(
        t('paramWidth'),
        slider({
          min: 2,
          max: 200,
          value: ts.width || 24,
          unit: ' px',
          onInput: (v) => {
            ts.width = v;
            app.width = v;
            settings.save();
            emit('width-changed', v);
          },
        })
      )
    );
    if ((ts.mode || 'object') === 'hole') {
      renderHint(bodyEl, t('hintEraserHole'));
    } else {
      renderHint(bodyEl, t('hintEraserObject'));
    }
  } else if (tool === 'shape') renderShapePanel(bodyEl);
  else if (tool === 'line' || tool === 'arrow') renderLinePanel(bodyEl, tool);
  else if (tool === 'text') renderTextPanel(bodyEl);
  else if (tool === 'move') renderHint(bodyEl, t('hintMove'));
  else if (tool === 'lasso') renderHint(bodyEl, t('hintLasso'));
  else if (tool === 'hand') renderHint(bodyEl, t('hintHand'));

  panelEl.hidden = false;
  panelEl.classList.toggle('is-pinned', panelState.pinned);
  if (handleEl) handleEl.hidden = true;
  positionPanel();
}

function positionPanel() {
  if (!panelEl || !toolbarEl) return;
  const top = toolbarEl.offsetTop + toolbarEl.offsetHeight + 8;
  panelEl.style.top = `${top}px`;
  panelEl.style.left = '8px';
  // Максимальная высота — от низа основной панели до низа экрана минус 16px.
  const maxH = Math.max(160, window.innerHeight - top - 16);
  panelEl.style.maxHeight = `${maxH}px`;
  requestAnimationFrame(() => clampToViewport(panelEl, 8));
}

function positionHandle() {
  if (!handleEl || !toolbarEl) return;
  handleEl.style.top = `${toolbarEl.offsetTop + toolbarEl.offsetHeight + 8}px`;
  handleEl.style.left = `${toolbarEl.offsetLeft || 20}px`;
  handleEl.style.width = `${toolbarEl.offsetWidth || 132}px`;
}

/* ------------------------------- Открытие/закрытие ------------------------------- */
export function openParamPanel() {
  panelState.open = true;
  renderParamPanel();
}

export function hideParamPanel() {
  panelState.open = false;
  if (panelEl) panelEl.hidden = true;
  closePresetEditor();
  showExpandButton();
}

/** Показать/скрыть кнопку «Развернуть» (когда панель параметров свёрнута). */
function showExpandButton() {
  if (!handleEl) return;
  if (toolbarEl && toolbarEl.hidden) {
    handleEl.hidden = true;
    return;
  }
  positionHandle();
  handleEl.hidden = false;
}

function toggleParamPanel() {
  if (panelEl && !panelEl.hidden) hideParamPanel();
  else openParamPanel();
}

/* ------------------------------- Инструменты ------------------------------- */
export function updateToolUI() {
  if (toolListEl) {
    for (const btn of toolListEl.querySelectorAll('.tool')) {
      btn.classList.toggle('is-active', btn.dataset.tool === app.tool);
    }
  }
  updateShapeIcon();
}

export function updateShapeIcon() {
  const iconEl = document.getElementById('shapeToolIcon');
  if (iconEl) iconEl.innerHTML = svg(SHAPE_ICONS[app.shapeKind] || SHAPE_ICONS.rect, 20);
}

/* ------------------------------- Сворачивание ------------------------------- */
function setBubbleY(y) {
  const max = window.innerHeight - 80;
  const val = clamp(y, 80, max);
  settings.settings.bubble.y = val;
  if (bubbleEl) bubbleEl.style.top = `${val}px`;
}

function collapseToolbar(collapsed) {
  if (!toolbarEl || !bubbleEl) return;
  toolbarEl.hidden = collapsed;
  bubbleEl.hidden = !collapsed;
  if (collapsed) {
    panelState.restoreOpen = panelState.open;
    panelState.open = false;
    if (panelEl) panelEl.hidden = true;
    if (handleEl) handleEl.hidden = true;
    setBubbleY(settings.settings.bubble.y || 200);
  } else {
    expandToolbar();
  }
}

function expandToolbar() {
  if (!toolbarEl || !bubbleEl) return;
  toolbarEl.hidden = false;
  bubbleEl.hidden = true;
  if (panelState.restoreOpen === false) {
    showExpandButton();
  } else {
    openParamPanel();
  }
}

function initBubbleDrag() {
  let dragging = false;
  let moved = false;
  let startY = 0;
  let startTop = 0;

  bubbleEl.addEventListener('pointerdown', (e) => {
    dragging = true;
    moved = false;
    startY = e.clientY;
    startTop = bubbleEl.offsetTop;
    try { bubbleEl.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
  });
  bubbleEl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    if (Math.abs(e.clientY - startY) > 3) moved = true;
    setBubbleY(startTop + (e.clientY - startY));
  });
  bubbleEl.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    try { bubbleEl.releasePointerCapture(e.pointerId); } catch (_) { /* noop */ }
    if (moved) {
      settings.save();
    } else {
      collapseToolbar(false);
    }
  });
}

/* ------------------------------- Инициализация ------------------------------- */
export function initToolPanels() {
  toolbarEl = document.getElementById('toolbar');
  toolListEl = document.getElementById('toolList');
  bubbleEl = document.getElementById('toolBubble');
  panelEl = document.getElementById('paramPanel');
  handleEl = document.getElementById('paramExpand');
  bodyEl = document.getElementById('paramBody');
  titleEl = document.getElementById('paramTitle');

  if (!bound) {
    bound = true;

    if (toolListEl) {
      toolListEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.tool');
        if (!btn) return;
        const tool = btn.dataset.tool;
        if (!tool) return;
        // Клик по правой иконке широкой строки — открыть панель параметров
        // (для «Фигур» — выбор фигуры, для «Текста» — настройки текста).
        if (e.target.closest('.tool__icon') && (tool === 'shape' || tool === 'text')) {
          tools.setTool(tool);
          openParamPanel();
          return;
        }
        if (app.tool === tool) {
          if (tool === 'text') {
            panelState.open = true;
            renderParamPanel();
          } else {
            toggleParamPanel();
          }
        } else {
          tools.setTool(tool);
        }
      });
    }

    const collapseBtn = document.getElementById('collapseBtn');
    if (collapseBtn) collapseBtn.addEventListener('click', () => collapseToolbar(true));

    const paramCollapse = document.getElementById('paramCollapse');
    if (paramCollapse) paramCollapse.addEventListener('click', () => hideParamPanel());

    if (handleEl) handleEl.addEventListener('click', () => openParamPanel());

    const paramPin = document.getElementById('paramPin');
    if (paramPin) {
      paramPin.addEventListener('click', () => {
        panelState.pinned = !panelState.pinned;
        paramPin.classList.toggle('is-active', panelState.pinned);
        if (panelEl) panelEl.classList.toggle('is-pinned', panelState.pinned);
      });
    }

    // Автозакрытие панели параметров при клике по холсту (если не закреплена).
    const canvasEl = document.getElementById('board');
    if (canvasEl) {
      canvasEl.addEventListener('pointerdown', () => {
        if (panelState.open && !panelState.pinned) hideParamPanel();
      });
    }

    document.addEventListener('pointerdown', (e) => {
      if (!editorEl) return;
      if (editorEl.contains(e.target)) return;
      closePresetEditor();
    });
  }

  if (bubbleEl) initBubbleDrag();
  updateShapeIcon();
  positionPanel();
  if (toolbarEl) clampToViewport(toolbarEl, 8);
  window.addEventListener('resize', () => {
    if (toolbarEl && !toolbarEl.hidden) clampToViewport(toolbarEl, 8);
    if (panelEl && !panelEl.hidden) positionPanel();
  });
}

/* Панель открыта по умолчанию для ручки. */
export function showInitialPanel() {
  collapseBound = true;
  void collapseBound;
  openParamPanel();
}

/* Реакция на смену инструмента. */
export function onToolChanged(tool) {
  void tool;
  updateToolUI();
  if (tool === 'text') {
    openParamPanel();
    return;
  }
  if (panelState.open) renderParamPanel();
  else hideParamPanel();
}

export { TOOL_TITLES };
