'use strict';

/* ==========================================================================
   GUSketch — инструменты и обработка указателя.
   Ручка, маркер, ластик, фигуры, линия, стрелка, текст, перемещение,
   лассо, пипетка, рука.
   ========================================================================== */

import { activeDoc, app, emit, selectedObjects, setSelection, clearSelection, isSelected } from './state.js';
import { board, textFont } from './board.js';
import * as shapes from './shapes.js';
import * as images from './images.js';
import * as history from './history.js';
import * as selection from './selection.js';
import { settings, getToolSettings, toolWidth, toolInk } from './settings.js';
import { uid, clamp, deepClone } from './util.js';

const DRAW_TOOLS = new Set(['brush', 'marker']);
const SHAPE_TOOLS = new Set(['shape', 'line', 'arrow']);
const TRANSFORM_TOOLS = new Set(['move', 'lasso']);

let canvas = null;
let activePointer = null;
let pan = null;
let spaceDown = false;
let currentStroke = null;
let shapeStart = null;
let shapeKind = null;
let selectState = null;
let stabBuf = [];
let lastRaw = null;
let textEditor = null;
let textWorld = null;
let lassoPoints = null;
let eraseState = null;
let eraseClones = null;

/* ------------------------------- Утилиты ------------------------------- */
function eventPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function coalesced(e) {
  if (typeof e.getCoalescedEvents === 'function') {
    const list = e.getCoalescedEvents();
    if (list && list.length) return list;
  }
  return [e];
}

function normalizePressure(e) {
  let p = e.pressure;
  if (e.pointerType === 'mouse' || p == null || p === 0) p = 0.5;
  return p > 1 ? 1 : p;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function applyStabilizer(point) {
  const stabN = Math.round(((settings.stabilizer || 0) / 100) * 12);
  const n = Math.max(settings.smoothing ? 2 : 0, stabN);
  if (n <= 0) return point;
  stabBuf.push(point);
  if (stabBuf.length > n) stabBuf.shift();
  let sx = 0;
  let sy = 0;
  for (const p of stabBuf) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / stabBuf.length, y: sy / stabBuf.length };
}

function shapeKindForTool(tool) {
  if (tool === 'line') return 'line';
  if (tool === 'arrow') return 'arrow';
  return app.shapeKind || 'rect';
}

/* ------------------------------- Тул/толщина ------------------------------- */
export function setTool(tool) {
  if (app.tool === tool) return;
  commitTextEditor(false);
  app.tool = tool;
  app.width = toolWidth(tool);
  emit('tool-changed', tool);
  emit('width-changed', app.width);
  board.updateCursor(activeDoc());
  board.requestRender();
}

export function setWidth(w) {
  app.width = w;
  const ts = getToolSettings(app.tool);
  if (ts.width != null) {
    ts.width = w;
    settings.save();
  }
  emit('width-changed', w);
  board.requestRender();
}

export function setSpaceDown(v) {
  spaceDown = v;
  board.spaceDown = v;
  if (canvas) canvas.classList.toggle('can-pan', v || !!pan);
  board.updateCursor(activeDoc());
}

/* ------------------------------- Кисть/ластик/маркер ------------------------------- */
function startStroke(worldPoint, e) {
  const tool = app.tool;
  const ts = getToolSettings(tool);
  const ink = toolInk(tool);
  currentStroke = {
    id: uid('stroke'),
    type: tool === 'marker' ? 'marker' : 'brush',
    color: ink.color,
    auto: ink.auto,
    width: ts.width,
    alpha: tool === 'marker' ? (ts.opacity == null ? 40 : ts.opacity) / 100 : 1,
    points: [],
  };
  stabBuf = [];
  lastRaw = null;
  board.liveStroke = currentStroke;
  board.liveStrokeRendered = 0;
  addStrokePoint(worldPoint, normalizePressure(e));
}

function addStrokePoint(worldPoint, pressure) {
  let p = worldPoint;
  if (settings.smoothing && lastRaw) {
    p = { x: (lastRaw.x + worldPoint.x) / 2, y: (lastRaw.y + worldPoint.y) / 2 };
  }
  lastRaw = worldPoint;
  const s = applyStabilizer(p);
  const pts = currentStroke.points;
  const last = pts[pts.length - 1];
  if (last && Math.abs(last.x - s.x) < 0.01 && Math.abs(last.y - s.y) < 0.01) return;
  pts.push({
    x: s.x,
    y: s.y,
    pressure,
    time: (performance && performance.now && performance.now()) || Date.now(),
  });
}

function endStroke() {
  const doc = activeDoc();
  if (currentStroke && currentStroke.points.length && doc) {
    history.pushHistory(doc);
    doc.strokes.push(currentStroke);
    emit('doc-changed', doc);
  }
  currentStroke = null;
  board.liveStroke = null;
  board.liveStrokeRendered = 0;
  stabBuf = [];
  lastRaw = null;
}

/* ------------------------------- Фигуры ------------------------------- */
function shapeStyle(kind) {
  if (kind === 'line') {
    const ink = toolInk('line');
    return { color: ink.color, auto: ink.auto, width: toolWidth('line'), fill: false, strokeOpacity: 1, fillOpacity: 1 };
  }
  if (kind === 'arrow') {
    const ink = toolInk('arrow');
    const ts = getToolSettings('arrow');
    return {
      color: ink.color,
      auto: ink.auto,
      width: toolWidth('arrow'),
      fill: false,
      strokeOpacity: (ts.opacity == null ? 100 : ts.opacity) / 100,
      fillOpacity: 1,
    };
  }
  const ts = getToolSettings('shape');
  const ink = toolInk('shape');
  return {
    strokeColor: ink.color,
    color: ink.color,
    strokeWidth: ts.width,
    width: ts.width,
    strokeEnabled: ts.strokeEnabled !== false,
    fill: !!ts.fill,
    fillEnabled: !!ts.fill,
    strokeOpacity: (ts.strokeOpacity == null ? 100 : ts.strokeOpacity) / 100,
    fillColor: ts.fillColor || '#ffffff',
    fillOpacity: (ts.fillOpacity == null ? 100 : ts.fillOpacity) / 100,
  };
}

function updateShapePreview(worldPoint, e) {
  const doc = activeDoc();
  if (!doc || !shapeStart) return;
  const ep = shapes.computeEndpoints(shapeKind, shapeStart.x, shapeStart.y, worldPoint.x, worldPoint.y, {
    shift: e.shiftKey,
    alt: e.altKey,
  });
  const st = shapeStyle(shapeKind);
  board.preview = shapes.makeShape(shapeKind, ep.x1, ep.y1, ep.x2, ep.y2, st);
  board.preview.shape.auto = st.auto;
  board.requestRender();
}

function commitShape() {
  const doc = activeDoc();
  if (board.preview && doc && shapeStart) {
    history.pushHistory(doc);
    doc.strokes.push(board.preview);
    emit('doc-changed', doc);
  }
  board.preview = null;
  shapeStart = null;
  shapeKind = null;
  board.endInteraction();
}

/* ------------------------------- Ластик ------------------------------- */
function eraserRadius() {
  return Math.max(2, toolWidth('eraser') / 2);
}

function startErase(world) {
  const doc = activeDoc();
  if (!doc) return;
  eraseState = {
    last: world,
    mode: getToolSettings('eraser').mode || 'object',
    pushed: false,
    holeIndex: new Map(),
    lastHits: new Set(),
  };
  eraseClones = new Map();
  applyErase(world, world);
}

function unionRect(a, b) {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const r = Math.max(a.x + a.width, b.x + b.width);
  const bt = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: r - x, height: bt - y };
}

function applyErase(from, to) {
  const doc = activeDoc();
  if (!doc || !eraseState) return;
  const a = from || eraseState.last;
  const b = to || a;
  const rad = eraserRadius();
  const hits = selection.objectsTouchingSegment(doc, a, b, rad);
  if (!hits.length) {
    // Ластик ушёл с объектов — следующее попадание начнёт новую дырку,
    // а не соединит её с предыдущей через пустое место.
    if (eraseState.mode === 'hole') eraseState.lastHits.clear();
    return;
  }
  if (!eraseState.pushed) {
    history.pushHistory(doc);
    eraseState.pushed = true;
  }
  const width = toolWidth('eraser');
  if (eraseState.mode === 'hole') {
    const hitIds = new Set();
    for (const o of hits) {
      let target = eraseClones.get(o.id);
      if (!target) {
        const idx = doc.strokes.indexOf(o);
        if (idx < 0) continue;
        target = deepClone(o);
        if (!Array.isArray(target.holes)) target.holes = [];
        eraseClones.set(o.id, target);
        doc.strokes[idx] = target;
      }
      hitIds.add(o.id);
      const box = board.objectLocalBox(target);
      const la = board.worldToLocalPoint(target, a);
      const lb = board.worldToLocalPoint(target, b);
      const bw = box ? box.width : 0;
      const bh = box ? box.height : 0;
      const hi = eraseState.holeIndex.get(o.id);
      const prev = hi != null ? target.holes[hi] : null;
      const canAppend = eraseState.lastHits.has(o.id);
      if (box && bw > 0 && bh > 0) {
        const u = (la.x - box.x) / bw;
        const v = (la.y - box.y) / bh;
        const u2 = (lb.x - box.x) / bw;
        const v2 = (lb.y - box.y) / bh;
        // Непрерывный проход ластика храним одной полилинией, а не
        // сотней отдельных «дырок» на каждый pointermove.
        if (canAppend && prev && Array.isArray(prev.pts) && prev.pts.length) {
          prev.pts.push({ u: u2, v: v2 });
        } else {
          target.holes.push({
            nw: width / Math.max(bw, bh, 1),
            pts: [
              { u, v },
              { u: u2, v: v2 },
            ],
          });
          eraseState.holeIndex.set(o.id, target.holes.length - 1);
        }
      } else if (canAppend && prev && Array.isArray(prev.points) && prev.points.length) {
        prev.points.push({ x: b.x, y: b.y });
      } else {
        target.holes.push({
          width,
          points: [
            { x: a.x, y: a.y },
            { x: b.x, y: b.y },
          ],
        });
        eraseState.holeIndex.set(o.id, target.holes.length - 1);
      }
    }
    eraseState.lastHits = hitIds;
    // След ластика рисуем сразу, без полного перерендера документа.
    board.eraseLiveSegment(a, b, width);
  } else {
    let region = null;
    for (const o of hits) {
      const ob = board.objectWorldBounds(o);
      if (ob) region = unionRect(region, ob);
    }
    const ids = new Set(hits.map((o) => o.id));
    doc.strokes = doc.strokes.filter((o) => !ids.has(o.id));
    if (Array.isArray(doc.selection) && doc.selection.length) {
      doc.selection = doc.selection.filter((id) => !ids.has(id));
    }
    // Удалённые объекты исчезают сразу; перерисовываем только их область.
    if (!region || !board.redrawWorldRegion(region)) board.requestRender();
  }
}

function endErase() {
  const doc = activeDoc();
  const changed = !!(eraseState && eraseState.pushed);
  eraseState = null;
  eraseClones = null;
  if (changed && doc) {
    emit('doc-changed', doc);
    emit('selection-changed', doc.selection || []);
  }
  board.requestRender();
}

/* ------------------------------- Выделение/трансформации ------------------------------- */
function captureGeom(obj) {
  let snap;
  if (obj.kind === 'image') {
    snap = {
      x: obj.x,
      y: obj.y,
      width: obj.width,
      height: obj.height,
      rotation: obj.rotation || 0,
      flipX: !!obj.flipX,
      flipY: !!obj.flipY,
    };
  } else if (obj.shape) {
    snap = {
      x1: obj.shape.x1,
      y1: obj.shape.y1,
      x2: obj.shape.x2,
      y2: obj.shape.y2,
      width: obj.shape.width,
      rotation: obj.rotation || 0,
      flipX: !!obj.shape.flipX,
      flipY: !!obj.shape.flipY,
      points: Array.isArray(obj.shape.points) ? deepClone(obj.shape.points) : undefined,
    };
  } else if (obj.type === 'text') {
    snap = { x: obj.x, y: obj.y, size: obj.size, rotation: obj.rotation || 0, flipX: !!obj.flipX, flipY: !!obj.flipY };
  } else {
    snap = { points: deepClone(obj.points || []), width: obj.width, rotation: obj.rotation || 0 };
  }
  // «Дырки» ластика храним в снимке, чтобы они восстанавливались и
  // двигались вместе с объектом (а не накапливались за кадр).
  snap.holes = obj.holes ? deepClone(obj.holes) : null;
  return snap;
}

function restoreGeom(obj, snap) {
  obj.rotation = snap.rotation || 0;
  if (obj.kind === 'image') {
    obj.x = snap.x;
    obj.y = snap.y;
    obj.width = snap.width;
    obj.height = snap.height;
    obj.flipX = !!snap.flipX;
    obj.flipY = !!snap.flipY;
  } else if (obj.shape) {
    obj.shape.x1 = snap.x1;
    obj.shape.y1 = snap.y1;
    obj.shape.x2 = snap.x2;
    obj.shape.y2 = snap.y2;
    obj.shape.width = snap.width;
    obj.shape.flipX = !!snap.flipX;
    obj.shape.flipY = !!snap.flipY;
    if (Array.isArray(snap.points)) obj.shape.points = deepClone(snap.points);
  } else if (obj.type === 'text') {
    obj.x = snap.x;
    obj.y = snap.y;
    obj.size = snap.size;
    obj.flipX = !!snap.flipX;
    obj.flipY = !!snap.flipY;
  } else {
    obj.points = deepClone(snap.points || []);
    obj.width = snap.width;
  }
  // Восстанавливаем «дырки» ластика к состоянию на начало жеста.
  if (snap.holes) obj.holes = deepClone(snap.holes);
  else delete obj.holes;
}

function anchorFor(type, rect) {
  const l = rect.x;
  const t = rect.y;
  const r = rect.x + rect.width;
  const b = rect.y + rect.height;
  const cx = (l + r) / 2;
  const cy = (t + b) / 2;
  switch (type) {
    case 'nw':
      return { x: r, y: b };
    case 'ne':
      return { x: l, y: b };
    case 'se':
      return { x: l, y: t };
    case 'sw':
      return { x: r, y: t };
    case 'n':
      return { x: cx, y: b };
    case 's':
      return { x: cx, y: t };
    case 'w':
      return { x: r, y: cy };
    case 'e':
      return { x: l, y: cy };
    default:
      return { x: l, y: t };
  }
}

/**
 * Начать жест трансформации: снять снимок истории и заменить выделенные
 * объекты клонами в документе, чтобы undo восстановил исходное состояние.
 */
function beginTransform(doc) {
  const objs = selectedObjects(doc);
  history.pushHistory(doc);
  const clones = [];
  for (const o of objs) {
    const idx = doc.strokes.indexOf(o);
    if (idx >= 0) {
      const copy = deepClone(o);
      doc.strokes[idx] = copy;
      clones.push(copy);
    } else {
      clones.push(o);
    }
  }
  return { objs: clones, snaps: clones.map(captureGeom) };
}

function startTransform(worldPoint, e, screen) {
  const doc = activeDoc();
  if (!doc) return false;

  const handle = board.handleAt(doc, screen.x, screen.y);
  if (handle) {
    const { objs, snaps } = beginTransform(doc);
    if (handle.type === 'rot') {
      selectState = {
        mode: 'rotate',
        objs,
        snaps,
        center: handle.frame.center,
        startAngle: Math.atan2(worldPoint.y - handle.frame.center.y, worldPoint.x - handle.frame.center.x),
      };
    } else if (handle.type === 'p0' || handle.type === 'p1' || handle.type === 'p2') {
      const target = objs[0];
      if (
        target &&
        target.shape &&
        target.shape.kind === 'triangle' &&
        Array.isArray(target.shape.points) &&
        target.shape.points.length === 3
      ) {
        // Произвольный треугольник: тянем отдельную вершину.
        selectState = { mode: 'vertex', objs, snaps, index: Number(handle.type.charAt(1)) };
      } else {
        selectState = { mode: 'line-end', objs, snaps, which: handle.type };
      }
    } else {
      const axis =
        handle.type === 'n' || handle.type === 's'
          ? 'y'
          : handle.type === 'e' || handle.type === 'w'
            ? 'x'
            : 'both';
      selectState = {
        mode: 'scale',
        objs,
        snaps,
        anchor: anchorFor(handle.type, handle.frame.rect),
        start: { x: handle.x, y: handle.y },
        axis,
        // Круг, квадрат и равносторонний треугольник всегда масштабируются
        // с сохранением пропорций.
        uniform:
          axis === 'both' &&
          objs.length === 1 &&
          objs[0].shape &&
          (objs[0].shape.kind === 'square' ||
            objs[0].shape.kind === 'circle' ||
            objs[0].shape.kind === 'triangle-equilateral'),
      };
    }
    // Статичный фон без изменяемых объектов — дальше каждый кадр
    // перерисовываем только сами объекты трансформации.
    board.beginInteraction(objs.map((o) => o.id));
    return true;
  }

  const hit = selection.hitTestTop(doc, worldPoint);
  if (hit) {
    if (!isSelected(doc, hit.id)) {
      setSelection(doc, [hit.id]);
    } else if (e.shiftKey) {
      // убрать из выделения
      setSelection(doc, doc.selection.filter((id) => id !== hit.id));
    }
    const { objs, snaps } = beginTransform(doc);
    if (!objs.length) return false;
    selectState = { mode: 'move', objs, snaps, start: worldPoint };
    board.beginInteraction(objs.map((o) => o.id));
    emit('doc-changed', doc);
    return true;
  }

  // пусто — либо рамка/лассо, либо снять выделение
  if (app.tool === 'lasso') {
    lassoPoints = [worldPoint];
    board.lasso = lassoPoints;
    board.beginInteraction();
    return true;
  }
  if (app.tool === 'move') {
    if (doc.selection && doc.selection.length) clearSelection(doc);
    board.marquee = { x0: worldPoint.x, y0: worldPoint.y, x1: worldPoint.x, y1: worldPoint.y };
    selectState = { mode: 'marquee', shiftKey: e.shiftKey };
    board.beginInteraction();
    return true;
  }
  if (doc.selection && doc.selection.length) clearSelection(doc);
  return false;
}

function updateTransform(worldPoint, e) {
  if (!selectState) return;
  const { mode } = selectState;

  if (mode === 'marquee') {
    board.marquee.x1 = worldPoint.x;
    board.marquee.y1 = worldPoint.y;
    return;
  }
  if (mode === 'lasso') return;

  if (mode === 'move') {
    const dx = worldPoint.x - selectState.start.x;
    const dy = worldPoint.y - selectState.start.y;
    selectState.objs.forEach((o, i) => {
      restoreGeom(o, selectState.snaps[i]);
      selection.moveObjects([o], dx, dy);
    });
  } else if (mode === 'scale') {
    const a = selectState.anchor;
    const start = selectState.start;
    const startDX = start.x - a.x;
    const startDY = start.y - a.y;
    const curDX = worldPoint.x - a.x;
    const curDY = worldPoint.y - a.y;
    let sxf = Math.abs(startDX) > 0.001 ? curDX / startDX : 1;
    let syf = Math.abs(startDY) > 0.001 ? curDY / startDY : 1;
    if (selectState.axis === 'x') syf = 1;
    else if (selectState.axis === 'y') sxf = 1;
    if (e && e.shiftKey && selectState.axis === 'both') {
      const m = (Math.abs(sxf) + Math.abs(syf)) / 2;
      sxf = m * (sxf < 0 ? -1 : 1);
      syf = m * (syf < 0 ? -1 : 1);
    }
    if (selectState.uniform) {
      const m = (Math.abs(sxf) + Math.abs(syf)) / 2;
      sxf = m * (sxf < 0 ? -1 : 1);
      syf = m * (syf < 0 ? -1 : 1);
    }
    selectState.objs.forEach((o, i) => {
      restoreGeom(o, selectState.snaps[i]);
      selection.scaleObject(o, sxf, syf, a.x, a.y);
    });
  } else if (mode === 'rotate') {
    const c = selectState.center;
    let angle = Math.atan2(worldPoint.y - c.y, worldPoint.x - c.x);
    let delta = angle - selectState.startAngle;
    if (e && e.shiftKey) delta = Math.round(delta / (Math.PI / 12)) * (Math.PI / 12);
    selectState.objs.forEach((o, i) => {
      restoreGeom(o, selectState.snaps[i]);
      selection.rotateObjectAbout(o, c.x, c.y, delta);
    });
  } else if (mode === 'vertex') {
    const obj = selectState.objs[0];
    restoreGeom(obj, selectState.snaps[0]);
    const pts = obj.shape && obj.shape.points;
    if (Array.isArray(pts) && pts.length === 3) {
      const i = selectState.index;
      pts[i].x = worldPoint.x;
      pts[i].y = worldPoint.y;
      // bbox для рамки выделения пересчитывается из вершин.
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      obj.shape.x1 = minX;
      obj.shape.y1 = minY;
      obj.shape.x2 = maxX;
      obj.shape.y2 = maxY;
    }
  } else if (mode === 'line-end') {
    const obj = selectState.objs[0];
    restoreGeom(obj, selectState.snaps[0]);
    if (selectState.which === 'p0') {
      obj.shape.x1 = worldPoint.x;
      obj.shape.y1 = worldPoint.y;
    } else {
      obj.shape.x2 = worldPoint.x;
      obj.shape.y2 = worldPoint.y;
    }
  }
  // Не эмитим doc-changed на каждый кадр: это дёргало статус/IPC/панель
  // свойств и пересобирало DOM. Достаточно запросить быстрый рендер.
  board.requestRender();
}

function finishTransform() {
  if (!selectState) return;
  const doc = activeDoc();
  if (selectState.mode === 'marquee' && board.marquee) {
    const found = selection.objectsInRect(doc, board.marquee);
    const ids = found.map((o) => o.id);
    if (selectState.shiftKey && doc) {
      setSelection(doc, [...doc.selection, ...ids]);
    } else {
      setSelection(doc, ids);
    }
    board.marquee = null;
  }
  selectState = null;
  board.endInteraction();
  // Одно событие в конце жеста — обновляет статус, историю и свойства.
  if (doc) emit('doc-changed', doc);
}

/* ------------------------------- Текст ------------------------------- */
function autoGrowTextArea() {
  if (!textEditor) return;
  textEditor.style.height = 'auto';
  textEditor.style.height = `${textEditor.scrollHeight}px`;
}

/** Верхний текстовый объект под мировой точкой (или null). */
function topTextAt(doc, pt) {
  if (!doc) return null;
  for (let i = doc.strokes.length - 1; i >= 0; i--) {
    const o = doc.strokes[i];
    if (o.type !== 'text') continue;
    const b = board.objectBounds(o);
    if (!b) continue;
    const pad = 6;
    if (pt.x >= b.x - pad && pt.x <= b.x + b.width + pad && pt.y >= b.y - pad && pt.y <= b.y + b.height + pad) {
      return o;
    }
  }
  return null;
}

/** Индекс каретки, ближайший к мировой точке клика, для текстового объекта. */
function caretIndexForPoint(obj, pt) {
  const lines = String(obj.text || '').split('\n');
  const size = obj.size || 24;
  const lineHeight = size * 1.25;
  const mctx = document.createElement('canvas').getContext('2d');
  mctx.font = textFont(obj);
  let line = Math.floor((pt.y - obj.y) / lineHeight);
  line = clamp(line, 0, lines.length - 1);
  const str = lines[line];
  const widths = lines.map((l) => mctx.measureText(l).width);
  const fullW = widths.reduce((m, w) => Math.max(m, w), 0);
  const align = obj.align || 'left';
  let baseX = obj.x;
  if (align === 'center') baseX = obj.x + fullW / 2 - widths[line] / 2;
  else if (align === 'right') baseX = obj.x + fullW - widths[line];
  const localX = pt.x - baseX;
  let col = 0;
  while (col < str.length && mctx.measureText(str.slice(0, col + 1)).width < localX) col++;
  let index = col;
  for (let i = 0; i < line; i++) index += lines[i].length + 1;
  return index;
}

function openTextEditor(screen, world, existing) {
  if (!textEditor) textEditor = document.getElementById('textEditor');
  if (!textEditor) return;
  const ts = getToolSettings('text');
  const v = board.view();

  if (existing) {
    const s = board.toScreen(existing.x, existing.y);
    const size = existing.size || ts.size || 24;
    textWorld = {
      editId: existing.id,
      original: existing.text || '',
      x: existing.x,
      y: existing.y,
      size,
      font: existing.font || ts.font || 'Inter',
      align: existing.align || ts.align || 'left',
      color: existing.color,
      auto: existing.auto,
    };
    textEditor.value = existing.text || '';
    textEditor.style.left = `${s.x}px`;
    textEditor.style.top = `${s.y}px`;
    textEditor.style.fontSize = `${size * v.scale}px`;
    textEditor.style.fontFamily = `"${textWorld.font}", sans-serif`;
    textEditor.style.color = existing.auto ? app.ink : existing.color;
    textEditor.style.textAlign = textWorld.align;
    textEditor.style.width = '240px';
    textEditor.hidden = false;
    autoGrowTextArea();
    textEditor.focus();
    const idx = caretIndexForPoint(existing, world);
    try { textEditor.setSelectionRange(idx, idx); } catch (_) { /* noop */ }
    return;
  }

  const size = ts.size || 24;
  const ink = toolInk('text');
  textWorld = {
    editId: null,
    original: '',
    x: world.x,
    y: world.y,
    size,
    font: ts.font || 'Inter',
    align: ts.align || 'left',
    color: ink.color,
    auto: ink.auto,
  };
  textEditor.value = '';
  textEditor.style.left = `${screen.x}px`;
  textEditor.style.top = `${screen.y}px`;
  textEditor.style.fontSize = `${size * v.scale}px`;
  textEditor.style.fontFamily = `"${ts.font || 'Inter'}", sans-serif`;
  textEditor.style.color = ink.auto ? app.ink : ink.color;
  textEditor.style.textAlign = ts.align || 'left';
  textEditor.style.width = '240px';
  textEditor.hidden = false;
  autoGrowTextArea();
  textEditor.focus();
}

/** Войти в режим редактирования существующего текста (двойной клик). */
export function editTextAt(screen, world) {
  const doc = activeDoc();
  if (!doc) return false;
  const obj = topTextAt(doc, world);
  if (!obj) return false;
  setSelection(doc, [obj.id]);
  emit('doc-changed', doc);
  if (textEditor && !textEditor.hidden) commitTextEditor(true);
  openTextEditor(screen, world, obj);
  return true;
}

function commitTextEditor(keepTool = true) {
  if (!textEditor || textEditor.hidden) return;
  const text = textEditor.value;
  const doc = activeDoc();
  const meta = textWorld;
  if (doc && meta && meta.editId) {
    // Редактирование существующего блока.
    const obj = doc.strokes.find((o) => o.id === meta.editId);
    if (obj) {
      if (!text.trim()) {
        // Пустой текст — удаляем объект.
        history.pushHistory(doc);
        doc.strokes = doc.strokes.filter((o) => o.id !== obj.id);
        if (Array.isArray(doc.selection)) {
          doc.selection = doc.selection.filter((id) => id !== obj.id);
        }
        emit('doc-changed', doc);
      } else if (text !== meta.original) {
        // Заменяем объект копией, чтобы undo видел исходное состояние.
        history.pushHistory(doc);
        const idx = doc.strokes.indexOf(obj);
        if (idx >= 0) doc.strokes[idx] = { ...obj, text };
        emit('doc-changed', doc);
      }
    }
  } else if (text.trim() && doc && meta) {
    history.pushHistory(doc);
    const obj = {
      id: uid('text'),
      type: 'text',
      text,
      x: meta.x,
      y: meta.y,
      size: meta.size,
      font: meta.font,
      align: meta.align,
      weight: 500,
      color: meta.color,
      auto: meta.auto,
      rotation: 0,
      flipX: false,
      flipY: false,
    };
    doc.strokes.push(obj);
    setSelection(doc, [obj.id]);
    emit('doc-changed', doc);
  }
  textEditor.hidden = true;
  textEditor.value = '';
  textWorld = null;
  if (!keepTool) setTool('move');
  board.requestRender();
}

function cancelTextEditor() {
  if (!textEditor) return;
  textEditor.hidden = true;
  textEditor.value = '';
  textWorld = null;
  board.requestRender();
}

/* ------------------------------- Обработчики ------------------------------- */
function wantPan(e) {
  return e.button === 1 || (e.button === 0 && (spaceDown || app.tool === 'hand'));
}

function onPointerDown(e) {
  board.pointer.inside = true;

  if (wantPan(e)) {
    e.preventDefault();
    pan = { id: e.pointerId, startX: e.clientX, startY: e.clientY, camX: board.view().offsetX, camY: board.view().offsetY };
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
    canvas.classList.add('is-panning');
    return;
  }
  if (e.button !== 0) return;
  if (activePointer !== null) return;

  // Клик по холсту вне блока — фиксируем редактирование текста.
  if (textEditor && !textEditor.hidden) commitTextEditor(true);

  e.preventDefault();
  const pos = eventPos(e);
  const world = board.toWorld(pos.x, pos.y);

  // Текст: если под курсором существующий блок — выделяем его,
  // иначе создаём новый.
  if (app.tool === 'text') {
    const doc0 = activeDoc();
    const hitText = doc0 ? topTextAt(doc0, world) : null;
    if (hitText) {
      setSelection(doc0, [hitText.id]);
      emit('doc-changed', doc0);
      editTextAt(pos, world);
      emit('tool-changed', app.tool);
      return;
    }
    openTextEditor(pos, world);
    emit('tool-changed', app.tool);
    return;
  }

  activePointer = e.pointerId;
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }

  if (app.tool === 'eraser') {
    startErase(world);
    if (!board.hasRendered) board.requestRender();
    board.updateCursor(activeDoc());
    return;
  }
  if (TRANSFORM_TOOLS.has(app.tool)) {
    startTransform(world, e, pos);
    board.requestRender();
    return;
  }
  if (SHAPE_TOOLS.has(app.tool)) {
    shapeKind = shapeKindForTool(app.tool);
    shapeStart = world;
    // Документ во время превью не меняется — кэшируем фон один раз.
    board.beginInteraction();
    updateShapePreview(world, e);
    return;
  }
  if (DRAW_TOOLS.has(app.tool)) {
    startStroke(world, e);
    if (!board.drawLiveStrokeStart()) board.requestRender();
    board.updateCursor(activeDoc());
  }
}

function onPointerMove(e) {
  const pos = eventPos(e);
  board.pointer.x = pos.x;
  board.pointer.y = pos.y;
  board.pointer.inside = true;
  const world = board.toWorld(pos.x, pos.y);
  board.pointer.worldX = world.x;
  board.pointer.worldY = world.y;

  if (pan && pan.id === e.pointerId) {
    board.view().offsetX = pan.camX + (e.clientX - pan.startX);
    board.view().offsetY = pan.camY + (e.clientY - pan.startY);
    clampView();
    board.requestRender();
    return;
  }

  if (activePointer === null) {
    board.updateCursor(activeDoc());
    return;
  }

  if (selectState) {
    updateTransform(world, e);
    board.requestRender();
    return;
  }
  if (lassoPoints) {
    lassoPoints.push(world);
    board.requestRender();
    return;
  }
  if (eraseState) {
    applyErase(eraseState.last, world);
    eraseState.last = world;
    board.updateCursor(activeDoc());
    return;
  }
  if (SHAPE_TOOLS.has(app.tool) && shapeStart) {
    updateShapePreview(world, e);
    return;
  }
  if (currentStroke) {
    const before = currentStroke.points.length;
    for (const ev of coalesced(e)) {
      const p = eventPos(ev);
      const w = board.toWorld(p.x, p.y);
      addStrokePoint(w, normalizePressure(ev));
    }
    if (currentStroke.points.length === before) {
      board.updateCursor(activeDoc());
      return;
    }

    const rendered = board.liveStrokeRendered || 0;
    let canAppend = board.hasRendered;
    // У маркера стартовая точка рисуется полупрозрачной; перед первым
    // сегментом убираем её точечной перерисовкой, чтобы не было тёмного
    // пятна в начале штриха.
    if (canAppend && rendered === 1 && currentStroke.alpha != null && currentStroke.alpha < 1) {
      const p = currentStroke.points[0];
      const r = Math.max((currentStroke.width || 1) / 2 + 1, 2);
      if (!board.redrawWorldRegion({ x: p.x - r, y: p.y - r, width: r * 2, height: r * 2 })) {
        canAppend = false;
      }
    }
    // Дальше дорисовываем только новые сегменты, без полного рендера.
    if (!canAppend || !board.appendLiveStroke()) board.requestRender();
    board.updateCursor(activeDoc());
  }
}

function onPointerUp(e) {
  if (pan && pan.id === e.pointerId) {
    pan = null;
    canvas.classList.remove('is-panning');
    canvas.classList.toggle('can-pan', spaceDown || app.tool === 'hand');
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* noop */ }
    return;
  }
  if (activePointer === null || e.pointerId !== activePointer) return;

  if (lassoPoints) {
    const doc = activeDoc();
    if (lassoPoints.length >= 3) {
      const found = selection.objectsInPolygon(doc, lassoPoints);
      const ids = found.map((o) => o.id);
      if (e.shiftKey) setSelection(doc, [...(doc.selection || []), ...ids]);
      else setSelection(doc, ids);
      emit('doc-changed', doc);
    }
    lassoPoints = null;
    board.lasso = null;
    board.endInteraction();
  } else if (selectState) {
    finishTransform();
  } else if (eraseState) {
    endErase();
  } else if (SHAPE_TOOLS.has(app.tool)) {
    commitShape();
  } else if (currentStroke) {
    endStroke();
  }

  activePointer = null;
  try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* noop */ }
  board.requestRender();
}

function onPointerEnter() {
  board.pointer.inside = true;
  board.updateCursor(activeDoc());
}

function onPointerLeave() {
  board.pointer.inside = false;
  board.updateCursor(activeDoc());
}

/* ------------------------------- Панорама/зум ------------------------------- */
function clampView() {
  const doc = activeDoc();
  if (!doc) return;
  const lim = board.boundsRect(doc);
  if (!lim) return;
  const v = doc.view;
  const viewW = board.cssW / v.scale;
  const viewH = board.cssH / v.scale;
  const viewL = -v.offsetX / v.scale;
  const viewT = -v.offsetY / v.scale;

  let newL = viewL;
  let newT = viewT;
  if (viewW >= lim.width) newL = lim.x + lim.width / 2 - viewW / 2;
  else newL = clamp(viewL, lim.x, lim.x + lim.width - viewW);
  if (viewH >= lim.height) newT = lim.y + lim.height / 2 - viewH / 2;
  else newT = clamp(viewT, lim.y, lim.y + lim.height - viewH);

  v.offsetX = -newL * v.scale;
  v.offsetY = -newT * v.scale;
}

function onWheel(e) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const pos = eventPos(e);
    const before = board.toWorld(pos.x, pos.y);
    const factor = Math.exp(-e.deltaY * 0.0015);
    zoomTo(clamp(board.view().scale * factor, 0.1, 8), pos, before);
    return;
  }
  e.preventDefault();
  const v = board.view();
  if (e.shiftKey) {
    const d = e.deltaY || e.deltaX;
    v.offsetX -= d;
  } else {
    v.offsetX -= e.deltaX || 0;
    v.offsetY -= e.deltaY || 0;
  }
  clampView();
  board.requestRender();
}

export function zoomTo(scale, screenPoint, worldBefore) {
  const v = board.view();
  v.scale = scale;
  if (screenPoint) {
    const wb = worldBefore || board.toWorld(screenPoint.x, screenPoint.y);
    v.offsetX = screenPoint.x - wb.x * v.scale;
    v.offsetY = screenPoint.y - wb.y * v.scale;
  }
  clampView();
  board.requestRender();
}

export function zoomBy(factor) {
  const cx = board.cssW / 2;
  const cy = board.cssH / 2;
  const before = board.toWorld(cx, cy);
  zoomTo(clamp(board.view().scale * factor, 0.1, 8), { x: cx, y: cy }, before);
}

export function zoomReset() {
  const v = board.view();
  v.scale = 1;
  v.offsetX = 0;
  v.offsetY = 0;
  board.requestRender();
}

/* ------------------------------- Удаление/порядок ------------------------------- */
export function deleteSelection() {
  return selection.deleteSelection();
}

export function selectionToFront() {
  const doc = activeDoc();
  if (!doc || !doc.selection || !doc.selection.length) return;
  history.pushHistory(doc);
  const sel = new Set(doc.selection);
  const moved = doc.strokes.filter((o) => sel.has(o.id));
  doc.strokes = doc.strokes.filter((o) => !sel.has(o.id)).concat(moved);
  emit('doc-changed', doc);
  board.requestRender();
}

export function selectionToBack() {
  const doc = activeDoc();
  if (!doc || !doc.selection || !doc.selection.length) return;
  history.pushHistory(doc);
  const sel = new Set(doc.selection);
  const moved = doc.strokes.filter((o) => sel.has(o.id));
  doc.strokes = moved.concat(doc.strokes.filter((o) => !sel.has(o.id)));
  emit('doc-changed', doc);
  board.requestRender();
}

/* ------------------------------- Инициализация ------------------------------- */
export function initTools() {
  canvas = document.getElementById('board');
  textEditor = document.getElementById('textEditor');

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerenter', onPointerEnter);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('auxclick', (e) => e.preventDefault());
  canvas.addEventListener('dragstart', (e) => e.preventDefault());

  if (textEditor) {
    textEditor.addEventListener('input', autoGrowTextArea);
    textEditor.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        // Enter — перенос строки внутри блока, не фиксируем.
        e.stopPropagation();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        commitTextEditor(true);
        textEditor.blur();
      }
      e.stopPropagation();
    });
    textEditor.addEventListener('blur', () => commitTextEditor(true));
  }

  // Клик вне редактора/холста — фиксируем текст.
  document.addEventListener('pointerdown', (e) => {
    if (!textEditor || textEditor.hidden) return;
    if (e.target === canvas) return; // обработает холст
    if (textEditor.contains(e.target)) return;
    commitTextEditor(true);
  });

  emit('tool-changed', app.tool);
}
