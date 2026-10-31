'use strict';

/* ==========================================================================
   GUSketch — выделение и трансформации объектов.
   Перемещение, масштаб, поворот, копирование, дублирование, удаление.
   ========================================================================== */

import { activeDoc, app, selectedObjects, setSelection, emit } from './state.js';
import { board } from './board.js';
import * as shapes from './shapes.js';
import * as history from './history.js';
import { uid, deepClone } from './util.js';

/* ------------------------------- Хит-тест ------------------------------- */
function bbox(obj) {
  return board.objectBounds(obj);
}

/** Точный хит-тест объекта с учётом заливки/обводки фигур. */
export function hitObject(obj, pt, tol = 6) {
  const local = toLocal(obj, pt);
  if (obj.shape) return shapes.hitShape(obj.shape, local, tol);
  if (obj.kind === 'image' || obj.type === 'text') {
    const b = bbox(obj);
    if (!b) return false;
    return (
      local.x >= b.x - tol &&
      local.x <= b.x + b.width + tol &&
      local.y >= b.y - tol &&
      local.y <= b.y + b.height + tol
    );
  }
  if (obj.points) return pointNearStroke(obj, local, tol);
  return false;
}

/** Найти объекты, которых касается отрезок ластика (мировые координаты). */
export function objectsTouchingSegment(doc, a, b, radius = 0) {
  const d = doc || activeDoc();
  if (!d) return [];
  const out = [];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const step = Math.max(2, radius);
  const n = Math.max(1, Math.ceil(len / step));
  for (const o of d.strokes) {
    if (o.type === 'eraser') continue;
    const bnd = bbox(o);
    if (!bnd) continue;
    const bx0 = Math.min(a.x, b.x) - radius;
    const by0 = Math.min(a.y, b.y) - radius;
    const bx1 = Math.max(a.x, b.x) + radius;
    const by1 = Math.max(a.y, b.y) + radius;
    if (bnd.x > bx1 || bnd.x + bnd.width < bx0 || bnd.y > by1 || bnd.y + bnd.height < by0) continue;
    let hit = false;
    for (let i = 0; i <= n && !hit; i++) {
      const t = n ? i / n : 0;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (hitObject(o, p, radius)) hit = true;
    }
    if (hit) out.push(o);
  }
  return out;
}

export function hitTestTop(doc, world) {
  const d = doc || activeDoc();
  if (!d) return null;
  for (let i = d.strokes.length - 1; i >= 0; i--) {
    const o = d.strokes[i];
    if (o.type === 'eraser') continue;
    const b = bbox(o);
    if (!b) continue;
    // Быстрая отбраковка по bbox.
    if (world.x < b.x - 6 || world.x > b.x + b.width + 6 || world.y < b.y - 6 || world.y > b.y + b.height + 6) {
      continue;
    }
    if (hitObject(o, world, 6)) return o;
  }
  return null;
}

function toLocal(obj, pt) {
  const rot = obj.rotation || 0;
  if (!rot) return pt;
  const c = board.objectCenterWorld(obj);
  const cos = Math.cos(-rot);
  const sin = Math.sin(-rot);
  const dx = pt.x - c.x;
  const dy = pt.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

function pointNearStroke(s, pt, tol) {
  const pts = s.points;
  const t = tol == null ? Math.max(8, (s.width || 4) / 2 + 4) : tol;
  for (let i = 1; i < pts.length; i++) {
    if (segDist(pt, pts[i - 1], pts[i]) <= t) return true;
  }
  if (pts.length === 1) return Math.hypot(pt.x - pts[0].x, pt.y - pts[0].y) <= t;
  return false;
}

function segDist(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  let u = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  u = Math.max(0, Math.min(1, u));
  return Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy));
}

/* ------------------------------- Область ------------------------------- */
export function objectsInRect(doc, rect) {
  const d = doc || activeDoc();
  if (!d) return [];
  const rx = Math.min(rect.x0, rect.x1);
  const ry = Math.min(rect.y0, rect.y1);
  const rr = Math.max(rect.x0, rect.x1);
  const rb = Math.max(rect.y0, rect.y1);
  const out = [];
  for (const o of d.strokes) {
    if (o.type === 'eraser') continue;
    const b = bbox(o);
    if (!b) continue;
    const intersects = b.x <= rr && b.x + b.width >= rx && b.y <= rb && b.y + b.height >= ry;
    if (intersects) out.push(o);
  }
  return out;
}

function pointInPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x;
    const yi = pts[i].y;
    const xj = pts[j].x;
    const yj = pts[j].y;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function objectsInPolygon(doc, points) {
  const d = doc || activeDoc();
  if (!d || points.length < 3) return [];
  const out = [];
  for (const o of d.strokes) {
    if (o.type === 'eraser') continue;
    const b = bbox(o);
    if (!b) continue;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    if (pointInPoly(cx, cy, points)) {
      out.push(o);
      continue;
    }
    // Частичное пересечение: любой угол bbox внутри контура.
    const corners = [
      { x: b.x, y: b.y },
      { x: b.x + b.width, y: b.y },
      { x: b.x + b.width, y: b.y + b.height },
      { x: b.x, y: b.y + b.height },
    ];
    if (corners.some((c) => pointInPoly(c.x, c.y, points))) out.push(o);
  }
  return out;
}

/* ------------------------------- Трансформации ------------------------------- */
export function moveObjects(objs, dx, dy) {
  for (const o of objs) {
    if (o.kind === 'image' || o.type === 'text') {
      o.x += dx;
      o.y += dy;
    } else if (o.shape) {
      o.shape.x1 += dx;
      o.shape.y1 += dy;
      o.shape.x2 += dx;
      o.shape.y2 += dy;
      if (Array.isArray(o.shape.points)) {
        for (const p of o.shape.points) {
          p.x += dx;
          p.y += dy;
        }
      }
    } else if (o.points) {
      for (const p of o.points) {
        p.x += dx;
        p.y += dy;
      }
    }
  }
}

function scalePoint(x, y, sx, sy, ax, ay) {
  return { x: ax + (x - ax) * sx, y: ay + (y - ay) * sy };
}

export function scaleObject(obj, sx, sy, ax, ay) {
  const k = (Math.abs(sx) + Math.abs(sy)) / 2 || 1;
  if (obj.kind === 'image') {
    const c = scalePoint(obj.x, obj.y, sx, sy, ax, ay);
    obj.x = c.x;
    obj.y = c.y;
    obj.width = Math.max(8, obj.width * Math.abs(sx));
    obj.height = Math.max(8, obj.height * Math.abs(sy));
    // Перетаскивание через ноль отражает изображение по оси.
    if (sx < 0) obj.flipX = !obj.flipX;
    if (sy < 0) obj.flipY = !obj.flipY;
  } else if (obj.shape) {
    const p1 = scalePoint(obj.shape.x1, obj.shape.y1, sx, sy, ax, ay);
    const p2 = scalePoint(obj.shape.x2, obj.shape.y2, sx, sy, ax, ay);
    obj.shape.x1 = p1.x;
    obj.shape.y1 = p1.y;
    obj.shape.x2 = p2.x;
    obj.shape.y2 = p2.y;
    if (Array.isArray(obj.shape.points)) {
      for (const p of obj.shape.points) {
        const np = scalePoint(p.x, p.y, sx, sy, ax, ay);
        p.x = np.x;
        p.y = np.y;
      }
      // Произвольный треугольник: bbox всегда выражается из вершин.
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of obj.shape.points) {
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
    obj.shape.width = Math.max(1, (obj.shape.width || 1) * k);
    // Перетаскивание через ноль отражает фигуру по оси.
    if (sx < 0) obj.shape.flipX = !obj.shape.flipX;
    if (sy < 0) obj.shape.flipY = !obj.shape.flipY;
  } else if (obj.type === 'text') {
    const c = scalePoint(obj.x, obj.y, sx, sy, ax, ay);
    obj.x = c.x;
    obj.y = c.y;
    obj.size = Math.max(8, (obj.size || 24) * k);
    // Перетаскивание через ноль отражает текст по оси.
    if (sx < 0) obj.flipX = !obj.flipX;
    if (sy < 0) obj.flipY = !obj.flipY;
  } else if (obj.points) {
    for (const p of obj.points) {
      const np = scalePoint(p.x, p.y, sx, sy, ax, ay);
      p.x = np.x;
      p.y = np.y;
    }
    obj.width = Math.max(0.5, (obj.width || 1) * k);
  }
}

export function rotateObjectAbout(obj, cx, cy, delta) {
  const c = board.objectCenterWorld(obj);
  const cos = Math.cos(delta);
  const sin = Math.sin(delta);
  const dx = c.x - cx;
  const dy = c.y - cy;
  const nx = cx + dx * cos - dy * sin;
  const ny = cy + dx * sin + dy * cos;

  if (obj.kind === 'image') {
    obj.x += nx - c.x;
    obj.y += ny - c.y;
  } else if (obj.shape) {
    moveObjects([obj], nx - c.x, ny - c.y);
  } else if (obj.type === 'text') {
    obj.x += nx - c.x;
    obj.y += ny - c.y;
  } else if (obj.points) {
    for (const p of obj.points) {
      p.x += nx - c.x;
      p.y += ny - c.y;
    }
  }
  obj.rotation = (obj.rotation || 0) + delta;
}

/* ------------------------------- Копирование ------------------------------- */
export function cloneObject(obj, regenerate = true) {
  const copy = deepClone(obj);
  if (regenerate) {
    copy.id = uid(obj.kind || obj.shape ? 'obj' : 'obj');
    if (copy.shape) copy.shape = { ...copy.shape };
  }
  return copy;
}

export function copySelection() {
  const d = activeDoc();
  const objs = selectedObjects(d);
  if (!objs.length) return false;
  app.clipboard = objs.map((o) => cloneObject(o, false));
  emit('toast', { text: `Скопировано: ${objs.length}` });
  return true;
}

export function cutSelection() {
  const d = activeDoc();
  const objs = selectedObjects(d);
  if (!objs.length) return false;
  app.clipboard = objs.map((o) => cloneObject(o, false));
  history.pushHistory(d);
  const ids = new Set(objs.map((o) => o.id));
  d.strokes = d.strokes.filter((o) => !ids.has(o.id));
  setSelection(d, []);
  emit('doc-changed', d);
  board.requestRender();
  return true;
}

export function pasteClipboard(offset = 24) {
  const d = activeDoc();
  if (!d || !app.clipboard.length) return false;
  history.pushHistory(d);
  const ids = [];
  for (const src of app.clipboard) {
    const copy = cloneObject(src, true);
    moveObjects([copy], offset, offset);
    d.strokes.push(copy);
    ids.push(copy.id);
  }
  // Обновим буфер, чтобы повторная вставка шла со сдвигом.
  app.clipboard = app.clipboard.map((o) => {
    const c = cloneObject(o, false);
    moveObjects([c], offset, offset);
    return c;
  });
  setSelection(d, ids);
  emit('doc-changed', d);
  board.requestRender();
  emit('toast', { text: `Вставлено: ${ids.length}` });
  return true;
}

export function duplicateSelection(offset = 20) {
  const d = activeDoc();
  const objs = selectedObjects(d);
  if (!objs.length) return false;
  history.pushHistory(d);
  const ids = [];
  for (const src of objs) {
    const copy = cloneObject(src, true);
    moveObjects([copy], offset, offset);
    d.strokes.push(copy);
    ids.push(copy.id);
  }
  setSelection(d, ids);
  emit('doc-changed', d);
  board.requestRender();
  return true;
}

export function deleteSelection() {
  const d = activeDoc();
  const objs = selectedObjects(d);
  if (!objs.length) return false;
  history.pushHistory(d);
  const ids = new Set(objs.map((o) => o.id));
  d.strokes = d.strokes.filter((o) => !ids.has(o.id));
  setSelection(d, []);
  emit('doc-changed', d);
  board.requestRender();
  return true;
}

export function selectAll() {
  const d = activeDoc();
  if (!d) return;
  const ids = d.strokes.filter((o) => o.type !== 'eraser').map((o) => o.id);
  setSelection(d, ids);
  emit('doc-changed', d);
  board.requestRender();
}
