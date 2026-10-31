'use strict';

/* ==========================================================================
   GUSketch — фигуры.
   Квадрат, прямоугольник, трапеция, прямоугольная трапеция, круг,
   окружность (кольцо), ромб, параллелограмм, линия, стрелка.

   Все фигуры (кроме линии/стрелки) описываются ограничивающим
   прямоугольником (x1,y1)-(x2,y2). Вершины выводятся из него, поэтому
   геометрические свойства (параллельность оснований, равные стороны)
   сохраняются автоматически при масштабировании.
   ========================================================================== */

import { uid } from './util.js';

/** Список доступных фигур (порядок важен для панели выбора). */
export const SHAPE_LIST = [
  { kind: 'square', label: 'Квадрат' },
  { kind: 'rect', label: 'Прямоугольник' },
  { kind: 'trapezoid', label: 'Трапеция' },
  { kind: 'rightTrapezoid', label: 'Прямоугольная трапеция' },
  { kind: 'circle', label: 'Круг' },
  { kind: 'ring', label: 'Окружность' },
  { kind: 'rhombus', label: 'Ромб' },
  { kind: 'parallelogram', label: 'Параллелограмм' },
  { kind: 'triangle-equilateral', label: 'Равносторонний треугольник' },
  { kind: 'triangle-right', label: 'Прямоугольный треугольник' },
  { kind: 'triangle', label: 'Треугольник' },
];

const POLY_KINDS = new Set([
  'rect',
  'square',
  'trapezoid',
  'rightTrapezoid',
  'rhombus',
  'parallelogram',
  'triangle-equilateral',
  'triangle-right',
  'triangle',
]);

const RECT_ONLY_CORNERS = new Set(['square', 'circle', 'triangle-equilateral']);

export function isPolyKind(kind) {
  return POLY_KINDS.has(kind);
}

export function shapeCornersOnly(kind) {
  return RECT_ONLY_CORNERS.has(kind);
}

function snapAngle(x1, y1, x2, y2, stepDeg) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const step = (stepDeg * Math.PI) / 180;
  const ang = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: x1 + Math.cos(ang) * len, y: y1 + Math.sin(ang) * len };
}

/**
 * С учётом модификаторов Shift (пропорции / угол 15°) и Alt (от центра).
 */
export function computeEndpoints(kind, x1, y1, x2, y2, mods = {}) {
  if (kind === 'line' || kind === 'arrow') {
    let px = x2;
    let py = y2;
    if (mods.shift) {
      const p = snapAngle(x1, y1, x2, y2, 15);
      px = p.x;
      py = p.y;
    }
    return { x1, y1, x2: px, y2: py };
  }

  let ax = x1;
  let ay = y1;
  let bx = x2;
  let by = y2;

  if (mods.alt) {
    // точка старта — центр
    ax = x1 - (x2 - x1);
    ay = y1 - (y2 - y1);
  }

  // Квадрат и круг требуют равных сторон; ромб — при Shift.
  // Окружность (ring) — свободный овал, стороны не выравниваются.
  const forceEqual = kind === 'square' || kind === 'circle' || (kind === 'rhombus' && mods.shift);
  if (kind === 'triangle-equilateral') {
    // Равносторонний треугольник: ширина : высота = 1 : √3/2.
    // Вытягиваем размер в доминирующем направлении, другую ось добиваем пропорцией.
    const k = Math.sqrt(3) / 2;
    const dx = Math.abs(bx - ax);
    const dy = Math.abs(by - ay);
    const w = Math.max(dx, dy / k);
    bx = ax + (bx >= ax ? w : -w);
    by = ay + (by >= ay ? w * k : -w * k);
  } else if (mods.shift || forceEqual) {
    const dx = bx - ax;
    const dy = by - ay;
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    bx = ax + (dx >= 0 ? m : -m);
    by = ay + (dy >= 0 ? m : -m);
  }
  return { x1: ax, y1: ay, x2: bx, y2: by };
}

export function makeShape(kind, x1, y1, x2, y2, opts = {}) {
  const strokeColor = opts.strokeColor != null ? opts.strokeColor : (opts.color != null ? opts.color : '#f0f0f0');
  const shape = {
    kind,
    x1,
    y1,
    x2,
    y2,
    strokeColor,
    color: strokeColor,
    width: opts.strokeWidth != null ? opts.strokeWidth : (opts.width != null ? opts.width : 10),
    strokeWidth: opts.strokeWidth != null ? opts.strokeWidth : (opts.width != null ? opts.width : 10),
    strokeEnabled: opts.strokeEnabled !== false,
    fill: !!opts.fill,
    fillEnabled: opts.fillEnabled != null ? !!opts.fillEnabled : !!opts.fill,
    strokeOpacity: opts.strokeOpacity == null ? 1 : opts.strokeOpacity,
    fillColor: opts.fillColor != null ? opts.fillColor : '#ffffff',
    fillOpacity: opts.fillOpacity == null ? 1 : opts.fillOpacity,
    flipX: false,
    flipY: false,
  };
  // Произвольный треугольник хранит независимые вершины.
  if (kind === 'triangle') {
    const cx = (x1 + x2) / 2;
    shape.points = [
      { x: cx, y: y1 },
      { x: x1, y: y2 },
      { x: x2, y: y2 },
    ];
  }
  return {
    id: uid('shape'),
    type: 'shape',
    rotation: 0,
    shape,
  };
}

function box(shape) {
  const rx = Math.min(shape.x1, shape.x2);
  const ry = Math.min(shape.y1, shape.y2);
  const rw = Math.abs(shape.x2 - shape.x1);
  const rh = Math.abs(shape.y2 - shape.y1);
  return { rx, ry, rw, rh };
}

/** Вершины многоугольной фигуры (для polygon-типов). */
export function shapePoints(shape) {
  const kind = shape.kind;
  const { rx, ry, rw, rh } = box(shape);
  let pts;
  switch (kind) {
    case 'rect':
    case 'square':
      pts = [
        { x: rx, y: ry },
        { x: rx + rw, y: ry },
        { x: rx + rw, y: ry + rh },
        { x: rx, y: ry + rh },
      ];
      break;
    case 'trapezoid': {
      const inset = rw * 0.2;
      pts = [
        { x: rx + inset, y: ry },
        { x: rx + rw - inset, y: ry },
        { x: rx + rw, y: ry + rh },
        { x: rx, y: ry + rh },
      ];
      break;
    }
    case 'rightTrapezoid': {
      const inset = rw * 0.25;
      pts = [
        { x: rx, y: ry },
        { x: rx + rw - inset, y: ry },
        { x: rx + rw, y: ry + rh },
        { x: rx, y: ry + rh },
      ];
      break;
    }
    case 'rhombus':
      pts = [
        { x: rx + rw / 2, y: ry },
        { x: rx + rw, y: ry + rh / 2 },
        { x: rx + rw / 2, y: ry + rh },
        { x: rx, y: ry + rh / 2 },
      ];
      break;
    case 'parallelogram': {
      const slant = rw * 0.25;
      pts = [
        { x: rx + slant, y: ry },
        { x: rx + rw, y: ry },
        { x: rx + rw - slant, y: ry + rh },
        { x: rx, y: ry + rh },
      ];
      break;
    }
    case 'triangle-equilateral': {
      // Вершина — верх по центру, основание — низ.
      const cx = rx + rw / 2;
      pts = [
        { x: cx, y: ry },
        { x: rx, y: ry + rh },
        { x: rx + rw, y: ry + rh },
      ];
      break;
    }
    case 'triangle-right':
      // Прямой угол в точке B (низ-лево).
      pts = [
        { x: rx, y: ry },
        { x: rx, y: ry + rh },
        { x: rx + rw, y: ry + rh },
      ];
      break;
    case 'triangle':
      if (Array.isArray(shape.points) && shape.points.length === 3) {
        pts = shape.points.map((p) => ({ x: p.x, y: p.y }));
        break;
      }
      // fallback из bbox
      {
        const cx = rx + rw / 2;
        pts = [
          { x: cx, y: ry },
          { x: rx, y: ry + rh },
          { x: rx + rw, y: ry + rh },
        ];
      }
      break;
    default:
      return [];
  }
  // Отражение (перетаскивание маркера через противоположную сторону).
  if (shape.flipX || shape.flipY) {
    const cx = rx + rw / 2;
    const cy = ry + rh / 2;
    pts = pts.map((p) => ({
      x: shape.flipX ? 2 * cx - p.x : p.x,
      y: shape.flipY ? 2 * cy - p.y : p.y,
    }));
  }
  return pts;
}

function tracePoly(ctx, pts) {
  if (!pts.length) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

export function drawShape(ctx, shape) {
  const kind = shape.kind;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const strokeWidth = shape.strokeWidth != null ? shape.strokeWidth : (shape.width != null ? shape.width : 0);
  ctx.lineWidth = Math.max(strokeWidth, 0.5);
  const strokeOpacity = shape.strokeOpacity == null ? 1 : shape.strokeOpacity;
  const strokeEnabled = (shape.strokeEnabled !== false && strokeWidth > 0 && strokeOpacity > 0) || (shape.fill == null && strokeOpacity > 0 && strokeWidth > 0);
  const fillEnabled = (shape.fillEnabled != null ? shape.fillEnabled : shape.fill) && kind !== 'line' && kind !== 'arrow' && kind !== 'ring';
  const fillColor = shape.fillColor || '#ffffff';
  const fillOpacity = shape.fillOpacity == null ? 1 : shape.fillOpacity;

  ctx.strokeStyle = shape.strokeColor != null ? shape.strokeColor : (shape.color != null ? shape.color : '#f0f0f0');

  const fillThenStroke = () => {
    if (fillEnabled) {
      ctx.save();
      ctx.globalAlpha = fillOpacity;
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.restore();
    }
    if ((shape.strokeEnabled !== false && strokeWidth > 0 && strokeOpacity > 0)) {
      ctx.save();
      ctx.globalAlpha = strokeOpacity;
      ctx.strokeStyle = shape.strokeColor != null ? shape.strokeColor : (shape.color != null ? shape.color : '#f0f0f0');
      ctx.stroke();
      ctx.restore();
    }
  };

  if (kind === 'line') {
    if (strokeEnabled) {
      ctx.globalAlpha = strokeOpacity;
      ctx.beginPath();
      ctx.moveTo(shape.x1, shape.y1);
      ctx.lineTo(shape.x2, shape.y2);
      ctx.stroke();
    }
  } else if (kind === 'arrow') {
    if (strokeEnabled) {
      ctx.globalAlpha = strokeOpacity;
      const dx = shape.x2 - shape.x1;
      const dy = shape.y2 - shape.y1;
      const len = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const head = Math.max(shape.width * 4, 10);
      const baseX = shape.x2 - Math.cos(ang) * Math.min(head, len);
      const baseY = shape.y2 - Math.sin(ang) * Math.min(head, len);

      ctx.beginPath();
      ctx.moveTo(shape.x1, shape.y1);
      ctx.lineTo(baseX, baseY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(shape.x2, shape.y2);
      ctx.lineTo(shape.x2 - Math.cos(ang - 0.42) * head, shape.y2 - Math.sin(ang - 0.42) * head);
      ctx.lineTo(shape.x2 - Math.cos(ang + 0.42) * head, shape.y2 - Math.sin(ang + 0.42) * head);
      ctx.closePath();
      ctx.fillStyle = shape.color;
      ctx.fill();
    }
  } else if (kind === 'circle' || kind === 'ring') {
    const { rx, ry, rw, rh } = box(shape);
    ctx.beginPath();
    ctx.ellipse(rx + rw / 2, ry + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2);
    fillThenStroke();
  } else {
    tracePoly(ctx, shapePoints(shape));
    fillThenStroke();
  }

  ctx.restore();
}

export function shapeBounds(shape) {
  if (shape.kind === 'line' || shape.kind === 'arrow') {
    const x1 = shape.x1;
    const y1 = shape.y1;
    const x2 = shape.x2;
    const y2 = shape.y2;
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    };
  }
  if (shape.kind === 'triangle' && Array.isArray(shape.points) && shape.points.length === 3) {
    // Вершины — источник истины; bbox рамки выделения пересчитываем из них.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of shape.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
  const { rx, ry, rw, rh } = box(shape);
  return { x: rx, y: ry, width: rw, height: rh };
}

/** Расстояние от точки до отрезка. */
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function pointInPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x;
    const yi = pts[i].y;
    const xj = pts[j].x;
    const yj = pts[j].y;
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToPoly(px, py, pts) {
  let d = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    d = Math.min(d, distToSegment(px, py, a.x, a.y, b.x, b.y));
  }
  return d;
}

/** Приближённое расстояние от точки до эллипса (через выборку). */
function distToEllipse(px, py, cx, cy, ra, rb) {
  const N = 64;
  let prevX = cx + ra;
  let prevY = cy;
  let d = Infinity;
  for (let i = 1; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const x = cx + Math.cos(a) * ra;
    const y = cy + Math.sin(a) * rb;
    d = Math.min(d, distToSegment(px, py, prevX, prevY, x, y));
    prevX = x;
    prevY = y;
  }
  return d;
}

export function hitShape(shape, pt, tol = 6) {
  const kind = shape.kind;
  const strokeOpacity = shape.strokeOpacity == null ? 1 : shape.strokeOpacity;
  const strokeWidthH = shape.strokeWidth != null ? shape.strokeWidth : (shape.width || 0);
  const strokeEnabled = (shape.strokeEnabled !== false && strokeWidthH > 0 && strokeOpacity > 0);
  const fillEnabled = ((shape.fillEnabled != null ? shape.fillEnabled : shape.fill) && kind !== 'line' && kind !== 'arrow' && kind !== 'ring');
  const t = Math.max(tol, (shape.width || 0) / 2 + 2);

  if (kind === 'line' || kind === 'arrow') {
    if (!strokeEnabled) return false;
    return distToSegment(pt.x, pt.y, shape.x1, shape.y1, shape.x2, shape.y2) <= t;
  }

  const b = shapeBounds(shape);
  const { rx, ry, rw, rh } = { rx: b.x, ry: b.y, rw: b.width, rh: b.height };

  if (kind === 'circle' || kind === 'ring') {
    const cx = rx + rw / 2;
    const cy = ry + rh / 2;
    const ra = rw / 2;
    const rb = rh / 2;
    if (ra <= 0 || rb <= 0) return false;
    const nx = (pt.x - cx) / ra;
    const ny = (pt.y - cy) / rb;
    // Заливка включена — клик внутри выделяет фигуру целиком.
    if (fillEnabled && nx * nx + ny * ny <= 1) return true;
    // Обводка и заливка выключены — объект невидим, но остаётся выделяемым.
    if (!strokeEnabled && !fillEnabled) return nx * nx + ny * ny <= 1;
    if (!strokeEnabled) return false;
    // Круг/окружность без заливки — только контур (эллипс подходит для овала).
    return distToEllipse(pt.x, pt.y, cx, cy, ra, rb) <= t;
  }

  const pts = shapePoints(shape);
  if (fillEnabled && pointInPoly(pt.x, pt.y, pts)) return true;
  // Обводка и заливка выключены — объект невидим, но остаётся выделяемым.
  if (!strokeEnabled && !fillEnabled) return pointInPoly(pt.x, pt.y, pts);
  if (strokeEnabled && distToPoly(pt.x, pt.y, pts) <= t) return true;
  return false;
}

export function moveShape(shape, dx, dy) {
  shape.x1 += dx;
  shape.y1 += dy;
  shape.x2 += dx;
  shape.y2 += dy;
  if (Array.isArray(shape.points)) {
    for (const p of shape.points) {
      p.x += dx;
      p.y += dy;
    }
  }
}

/** Опорные точки фигуры. */
export function shapeCorners(shape) {
  if (shape.kind === 'line' || shape.kind === 'arrow') {
    return [
      { x: shape.x1, y: shape.y1 },
      { x: shape.x2, y: shape.y2 },
    ];
  }
  if (shape.kind === 'triangle' && Array.isArray(shape.points) && shape.points.length === 3) {
    // Маркеры — на вершинах произвольного треугольника.
    return shape.points.map((p) => ({ x: p.x, y: p.y }));
  }
  const b = shapeBounds(shape);
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x + b.width, y: b.y + b.height },
    { x: b.x, y: b.y + b.height },
  ];
}
