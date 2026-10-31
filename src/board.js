'use strict';

/* ==========================================================================
   GUSketch — движок холста.
   Слои: #grid (сетка/границы) снизу, #board (штрихи/фигуры/фото) сверху.
   Координаты объектов — мировые. Камера активного документа задаёт
   перевод world -> screen: screen = world * scale + offset.
   ========================================================================== */

import { activeDoc, app, gridColor, on, selectedObjects } from './state.js';
import { settings } from './settings.js';
import * as shapes from './shapes.js';
import * as images from './images.js';

const measureCanvas = document.createElement('canvas');
const measureCtx = measureCanvas.getContext('2d');

function textFont(obj) {
  const weight = obj.weight || 500;
  const size = obj.size || 24;
  const family = obj.font || 'Inter';
  return `${weight} ${size}px "${family}", "Segoe UI", sans-serif`;
}

function textBounds(obj) {
  measureCtx.font = textFont(obj);
  const lines = String(obj.text || '').split('\n');
  let w = 0;
  for (const line of lines) w = Math.max(w, measureCtx.measureText(line).width);
  const lineHeight = (obj.size || 24) * 1.25;
  return { x: obj.x, y: obj.y, width: w, height: lineHeight * lines.length };
}

function aabbOfPoints(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (!isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export const board = {
  boardCanvas: null,
  boardCtx: null,
  gridCanvas: null,
  gridCtx: null,
  cursorEl: null,
  preview: null,
  liveStroke: null,
  liveStrokeRendered: 0,
  marquee: null, // { x0, y0, x1, y1 } в мировых координатах
  lasso: null, // массив мировых точек
  dpr: 1,
  cssW: 0,
  cssH: 0,
  pointer: { x: 0, y: 0, worldX: 0, worldY: 0, inside: false },
  spaceDown: false,
  hasRendered: false,
  _queued: false,
  // Интерактивный кэш: статичная часть сцены, отрисованная один раз
  // в начале жеста (создание фигуры / трансформация выделения).
  _interaction: null,
  _baseCanvas: null,
  // Ревизия документа — нужна для кэша сетки/подсказки границ.
  _docRevision: 0,
  _gridKey: '',

  init() {
    this.boardCanvas = document.getElementById('board');
    this.boardCtx = this.boardCanvas.getContext('2d');
    this.gridCanvas = document.getElementById('grid');
    this.gridCtx = this.gridCanvas.getContext('2d');
    this.cursorEl = document.getElementById('cursorRing');

    window.addEventListener('resize', () => this.requestRender());
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => this.requestRender()).observe(this.boardCanvas);
    }

    // Всё, что меняет содержимое документа/вид сетки, увеличивает ревизию.
    // Это позволяет не перерисовывать сетку и подсказку границ каждый кадр.
    const invalidate = () => {
      this._docRevision++;
      this.requestRender();
    };
    on('doc-changed', invalidate);
    on('history-changed', invalidate);
    on('image-loaded', invalidate);
    on('settings-changed', invalidate);
    on('tabs-changed', invalidate);
    // Выделение не меняет пиксели документа — сетку перерисовывать не нужно.
    on('selection-changed', () => this.requestRender());

    this.requestRender();
  },

  view() {
    const d = activeDoc();
    return d ? d.view : { scale: 1, offsetX: 0, offsetY: 0 };
  },

  toWorld(sx, sy) {
    const v = this.view();
    return { x: (sx - v.offsetX) / v.scale, y: (sy - v.offsetY) / v.scale };
  },

  toScreen(wx, wy) {
    const v = this.view();
    return { x: wx * v.scale + v.offsetX, y: wy * v.scale + v.offsetY };
  },

  requestRender() {
    if (this._queued) return;
    this._queued = true;
    requestAnimationFrame(() => {
      this._queued = false;
      this.render();
    });
  },

  _resize(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const pw = Math.max(1, Math.round(w * dpr));
    const ph = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    return { dpr, cssW: w, cssH: h, pw, ph };
  },

  render() {
    const doc = activeDoc();
    const b = this._resize(this.boardCanvas);
    this._resize(this.gridCanvas);
    this.dpr = b.dpr;
    this.cssW = b.cssW;
    this.cssH = b.cssH;

    // Если интерактивный кэш больше не соответствует размеру канвы,
    // сбрасываем его — ниже сработает обычный полный рендер.
    const iv = this._interaction && doc ? this._interaction.view : null;
    const interactive =
      this._interaction &&
      doc &&
      this._interaction.docId === doc.id &&
      iv.scale === doc.view.scale &&
      iv.offsetX === doc.view.offsetX &&
      iv.offsetY === doc.view.offsetY &&
      this._interaction.pw === b.pw &&
      this._interaction.ph === b.ph &&
      this._interaction.dpr === b.dpr;
    if (this._interaction && !interactive) this._interaction = null;

    // Во время жеста вид не меняется, поэтому сетку не трогаем.
    if (!interactive) this.renderGridCached(doc, b);

    const ctx = this.boardCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, b.pw, b.ph);

    if (interactive) {
      // Быстрый путь: копируем заранее отрисованный фон и рисуем поверх
      // только изменяемые объекты (выделение) и превью.
      ctx.drawImage(this._interaction.base, 0, 0);
      if (doc) {
        const v = doc.view;
        const k = v.scale * b.dpr;
        ctx.setTransform(k, 0, 0, k, v.offsetX * b.dpr, v.offsetY * b.dpr);
        const exclude = this._interaction.excludeIds;
        if (exclude && exclude.size) {
          for (const obj of doc.strokes) {
            if (exclude.has(obj.id)) this.drawObject(ctx, obj);
          }
        }
        if (this.liveStroke) this.drawObject(ctx, this.liveStroke);
        if (this.preview) this.drawObject(ctx, this.preview);
      }
    } else if (doc) {
      const v = doc.view;
      const k = v.scale * b.dpr;
      ctx.setTransform(k, 0, 0, k, v.offsetX * b.dpr, v.offsetY * b.dpr);
      for (const obj of doc.strokes) this.drawObject(ctx, obj);
      if (this.liveStroke) this.drawObject(ctx, this.liveStroke);
      if (this.preview) this.drawObject(ctx, this.preview);
    }
    this.liveStrokeRendered = doc && this.liveStroke ? this.liveStroke.points.length : 0;

    // Оверлей выделения — в экранных координатах.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(b.dpr, b.dpr);
    if (doc) {
      this.drawSelection(ctx, doc);
      this.drawMarquee(ctx);
    }

    this.updateCursor(doc);
    this.hasRendered = true;
  },

  /**
   * Начать интерактивный жест. Статичная часть документа (всё, кроме
   * объектов из excludeIds) один раз рисуется в offscreen-канву.
   * Дальше каждый кадр достаточно скопировать её и дорисовать только
   * изменяемые объекты/превью — полный проход по документу не нужен.
   */
  beginInteraction(excludeIds) {
    const doc = activeDoc();
    if (!doc) return false;
    const b = this._resize(this.boardCanvas);
    this._resize(this.gridCanvas);
    this.dpr = b.dpr;
    this.cssW = b.cssW;
    this.cssH = b.cssH;
    // Во время жеста render() не будет перерисовывать сетку — готовим её
    // заранее, чтобы изменение размера канвы не оставило пустой слой.
    this.renderGridCached(doc, b);

    let cv = this._baseCanvas;
    if (!cv) cv = this._baseCanvas = document.createElement('canvas');
    if (cv.width !== b.pw || cv.height !== b.ph) {
      cv.width = b.pw;
      cv.height = b.ph;
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);

    const v = doc.view;
    const k = v.scale * b.dpr;
    ctx.setTransform(k, 0, 0, k, v.offsetX * b.dpr, v.offsetY * b.dpr);
    const exclude = excludeIds && excludeIds.length ? new Set(excludeIds) : null;
    for (const obj of doc.strokes) {
      if (exclude && exclude.has(obj.id)) continue;
      this.drawObject(ctx, obj);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    this._interaction = {
      base: cv,
      excludeIds: exclude,
      docId: doc.id,
      view: { scale: v.scale, offsetX: v.offsetX, offsetY: v.offsetY },
      dpr: b.dpr,
      pw: b.pw,
      ph: b.ph,
    };
    return true;
  },

  /** Завершить жест и вернуться к обычному полному рендеру. */
  endInteraction() {
    this._interaction = null;
    this.requestRender();
  },

  /** Ключ, от которого зависит содержимое слоя сетки. */
  gridKey(doc, b) {
    if (!doc) return `none|${b.pw}|${b.ph}|${b.dpr}`;
    const v = doc.view;
    const grid = doc.grid || { mode: 'none', size: 25 };
    return [
      this._docRevision,
      b.pw,
      b.ph,
      b.dpr,
      doc.id,
      v.scale,
      v.offsetX,
      v.offsetY,
      grid.mode,
      grid.size,
      settings.gridColor || '',
      settings.boundsPadding,
    ].join('|');
  },

  /** Перерисовать сетку только если изменился вид/документ/настройки. */
  renderGridCached(doc, b) {
    const key = this.gridKey(doc, b);
    if (key === this._gridKey) return;
    this._gridKey = key;
    this.renderGrid(doc, b);
  },

  /**
   * Дорисовать только новые сегменты живого штриха поверх уже
   * отрисованного холста. Это убирает полный перерендер документа
   * на каждом pointermove.
   */
  appendLiveStroke() {
    const doc = activeDoc();
    const s = this.liveStroke;
    if (!doc || !s || !Array.isArray(s.points) || s.points.length < 2) return false;
    const from = this.liveStrokeRendered | 0;
    if (from >= s.points.length) return true;

    const v = doc.view;
    const k = v.scale * this.dpr;
    const ctx = this.boardCtx;
    ctx.setTransform(k, 0, 0, k, v.offsetX * this.dpr, v.offsetY * this.dpr);
    this.drawStroke(ctx, s, from, s.points.length);
    this.liveStrokeRendered = s.points.length;
    return true;
  },

  /**
   * Нарисовать начало живого штриха (точку) без полного рендера.
   * Возвращает false, если холст ещё ни разу не отрисовывался.
   */
  drawLiveStrokeStart() {
    const doc = activeDoc();
    const s = this.liveStroke;
    if (!this.hasRendered || !doc || !s || !Array.isArray(s.points) || !s.points.length) return false;
    const v = doc.view;
    const k = v.scale * this.dpr;
    const ctx = this.boardCtx;
    ctx.setTransform(k, 0, 0, k, v.offsetX * this.dpr, v.offsetY * this.dpr);
    this.drawStroke(ctx, s, 0, s.points.length);
    this.liveStrokeRendered = s.points.length;
    return true;
  },

  /**
   * Мгновенно стереть участок на уже нарисованном холсте.
   * Модель документа обновляется отдельно; полный перерендер нужен
   * только в конце жеста.
   */
  eraseLiveSegment(from, to, width) {
    const doc = activeDoc();
    if (!doc || !from || !to) return;
    const v = doc.view;
    const k = v.scale * this.dpr;
    const w = Math.max(Number(width) || 1, 0.5);
    const ctx = this.boardCtx;
    ctx.save();
    ctx.setTransform(k, 0, 0, k, v.offsetX * this.dpr, v.offsetY * this.dpr);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#000';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = w;
    if (Math.hypot(to.x - from.x, to.y - from.y) < 0.01) {
      ctx.beginPath();
      ctx.arc(from.x, from.y, w / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
    ctx.restore();
  },

  /** Мировые границы объекта с запасом на толщину/наконечник стрелки. */
  objectWorldBounds(obj) {
    const b = obj.rotation ? aabbOfPoints(this.objectCornersWorld(obj)) : this.objectBounds(obj);
    if (!b) return null;
    let pad = 4;
    if (obj.shape) {
      const w = Number(obj.shape.width != null ? obj.shape.width : obj.shape.strokeWidth) || 0;
      pad = Math.max(12, w * 4 + 10);
    } else if (obj.points) {
      const w = Number(obj.width) || 0;
      pad = Math.max(4, w * 4 + 10);
    }
    return { x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 };
  },

  /**
   * Перерисовать только прямоугольную область в мировых координатах.
   * Нужно для ластика в режиме удаления объектов: удалённый объект
   * исчезает сразу, но остальной документ не перерисовывается целиком.
   * Возвращает false, если область слишком большая — тогда вызывающий
   * код делает обычный полный рендер.
   */
  redrawWorldRegion(rect) {
    const doc = activeDoc();
    if (!this.hasRendered || !doc || !rect) return false;
    const oldW = this.boardCanvas.width;
    const oldH = this.boardCanvas.height;
    const b = this._resize(this.boardCanvas);
    this.dpr = b.dpr;
    this.cssW = b.cssW;
    this.cssH = b.cssH;
    // Если канва изменила размер, её содержимое уже очищено — нужен
    // обычный полный рендер, иначе потеряется остальной документ.
    if (this.boardCanvas.width !== oldW || this.boardCanvas.height !== oldH) return false;
    const v = doc.view;
    const k = v.scale * b.dpr;
    const pad = 2;
    const x0 = Math.max(0, Math.floor((rect.x * v.scale + v.offsetX) * b.dpr) - pad);
    const y0 = Math.max(0, Math.floor((rect.y * v.scale + v.offsetY) * b.dpr) - pad);
    const x1 = Math.min(b.pw, Math.ceil(((rect.x + rect.width) * v.scale + v.offsetX) * b.dpr) + pad);
    const y1 = Math.min(b.ph, Math.ceil(((rect.y + rect.height) * v.scale + v.offsetY) * b.dpr) + pad);
    const w = x1 - x0;
    const h = y1 - y0;
    if (w <= 0 || h <= 0) return true;
    if (w * h > b.pw * b.ph * 0.45) return false;

    const ctx = this.boardCtx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(x0, y0, w, h);

    const wx = (x0 - v.offsetX * b.dpr) / k;
    const wy = (y0 - v.offsetY * b.dpr) / k;
    const ww = w / k;
    const wh = h / k;
    ctx.setTransform(k, 0, 0, k, v.offsetX * b.dpr, v.offsetY * b.dpr);
    ctx.beginPath();
    ctx.rect(wx, wy, ww, wh);
    ctx.clip();

    for (const obj of doc.strokes) {
      const ob = this.objectWorldBounds(obj);
      if (!ob) continue;
      if (
        ob.x > rect.x + rect.width ||
        ob.x + ob.width < rect.x ||
        ob.y > rect.y + rect.height ||
        ob.y + ob.height < rect.y
      ) {
        continue;
      }
      this.drawObject(ctx, obj);
    }
    ctx.restore();

    // Вернуть оверлей выделения в очищенную область (не задевая
    // пиксели за её пределами).
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(b.dpr, b.dpr);
    ctx.beginPath();
    ctx.rect(x0 / b.dpr, y0 / b.dpr, w / b.dpr, h / b.dpr);
    ctx.clip();
    this.drawSelection(ctx, doc);
    ctx.restore();

    this.updateCursor(doc);
    return true;
  },

  renderGrid(doc, b) {
    const ctx = this.gridCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, b.pw, b.ph);
    if (!doc) return;

    const v = doc.view;
    const k = v.scale * b.dpr;
    ctx.setTransform(k, 0, 0, k, v.offsetX * b.dpr, v.offsetY * b.dpr);

    const x0 = (0 - v.offsetX) / v.scale;
    const y0 = (0 - v.offsetY) / v.scale;
    const x1 = (this.cssW - v.offsetX) / v.scale;
    const y1 = (this.cssH - v.offsetY) / v.scale;

    const mode = doc.grid.mode || 'none';
    const size = doc.grid.size || 25;

    if (mode !== 'none') {
      const gc = (settings && settings.gridColor) || gridColor();
      ctx.strokeStyle = gc;
      ctx.fillStyle = gc;
      ctx.lineWidth = 1 / v.scale;
      ctx.beginPath();

      if (mode === 'squares' || mode === 'lines') {
        const startX = Math.floor(x0 / size) * size;
        if (mode === 'squares') {
          for (let x = startX; x <= x1; x += size) {
            ctx.moveTo(x, y0);
            ctx.lineTo(x, y1);
          }
        }
        const startY = Math.floor(y0 / size) * size;
        for (let y = startY; y <= y1; y += size) {
          ctx.moveTo(x0, y);
          ctx.lineTo(x1, y);
        }
        ctx.stroke();
      } else if (mode === 'dots') {
        const r = Math.max(1, 1.4 / v.scale);
        const startX = Math.floor(x0 / size) * size;
        const startY = Math.floor(y0 / size) * size;
        for (let x = startX; x <= x1; x += size) {
          for (let y = startY; y <= y1; y += size) {
            ctx.moveTo(x + r, y);
            ctx.arc(x, y, r, 0, Math.PI * 2);
          }
        }
        ctx.fill();
      }
    }

    // Визуализация границы холста по мере приближения.
    this.drawBoundsHint(ctx, doc, v);
  },

  boundsRect(doc) {
    const d = doc || activeDoc();
    if (!d) return null;
    const content = this.contentBounds(d);
    if (!content) return null;
    const pad = (settings && Number(settings.boundsPadding)) || 500;
    return {
      x: content.x - pad,
      y: content.y - pad,
      width: content.width + pad * 2,
      height: content.height + pad * 2,
    };
  },

  boundsLimit(doc) {
    const d = doc || activeDoc();
    if (!d) return null;
    const rect = this.boundsRect(d);
    if (!rect) return null;
    const v = d.view;
    const viewL = (0 - v.offsetX) / v.scale;
    const viewT = (0 - v.offsetY) / v.scale;
    const viewR = (this.cssW - v.offsetX) / v.scale;
    const viewB = (this.cssH - v.offsetY) / v.scale;
    return { rect, view: { l: viewL, t: viewT, r: viewR, b: viewB } };
  },

  drawBoundsHint(ctx, doc, v) {
    const info = this.boundsLimit(doc);
    if (!info) return;
    const { rect, view } = info;
    const margin = 100 / v.scale;
    const near =
      view.l < rect.x + margin ||
      view.t < rect.y + margin ||
      view.r > rect.x + rect.width - margin ||
      view.b > rect.y + rect.height - margin;
    if (!near) return;

    const bl = rect.x;
    const bt = rect.y;
    const br = rect.x + rect.width;
    const bb = rect.y + rect.height;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,77,48,0.3)';
    ctx.lineWidth = 2 / v.scale;
    ctx.setLineDash([12 / v.scale, 8 / v.scale]);
    ctx.strokeRect(bl, bt, br - bl, bb - bt);
    ctx.restore();
  },

  objectCenterWorld(obj) {
    if (obj.kind === 'image') return { x: obj.x + obj.width / 2, y: obj.y + obj.height / 2 };
    const b = this.objectBounds(obj) || { x: 0, y: 0, width: 0, height: 0 };
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  },

  drawObject(ctx, obj) {
    if (!obj) return;
    if (obj.holes && obj.holes.length) {
      this.drawHoledObject(ctx, obj);
      return;
    }
    if (obj.kind === 'image') {
      images.drawImageObj(ctx, obj);
      return;
    }
    const rot = obj.rotation || 0;
    if (rot) {
      const c = this.objectCenterWorld(obj);
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(rot);
      ctx.translate(-c.x, -c.y);
      this._drawRaw(ctx, obj);
      ctx.restore();
    } else {
      this._drawRaw(ctx, obj);
    }
  },

  /**
   * Отрисовка объекта с «дырками» (ластик в режиме «Дырявый»).
   * Рисуем объект на отдельном холсте, вырезаем отверстия через
   * destination-out и переносим результат. Таким образом выгрызенные
   * участки прозрачны и не «замазывают» фон, а двигаются вместе с объектом.
   */
  drawHoledObject(ctx, obj) {
    const m = ctx.getTransform();
    const a = m.a || 1;
    const d = m.d || a;
    const corners = this.objectCornersWorld(obj);
    if (!corners.length) {
      this._drawRaw(ctx, obj);
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of corners) {
      const sx = p.x * a + m.e;
      const sy = p.y * d + m.f;
      if (sx < minX) minX = sx;
      if (sy < minY) minY = sy;
      if (sx > maxX) maxX = sx;
      if (sy > maxY) maxY = sy;
    }
    let wWorld = obj.width || (obj.shape && obj.shape.width) || 6;
    if (obj.holes && obj.holes.length) {
      const lbox = this.objectLocalBox(obj);
      for (const hole of obj.holes) {
        const hw = hole.nw != null && lbox ? hole.nw * Math.max(lbox.width, lbox.height, 1) : hole.width || 1;
        if (hw > wWorld) wWorld = hw;
      }
    }
    const pad = (wWorld / 2 + 4) * Math.abs(a);
    minX = Math.floor(minX - pad);
    minY = Math.floor(minY - pad);
    maxX = Math.ceil(maxX + pad);
    maxY = Math.ceil(maxY + pad);
    const w = maxX - minX;
    const h = maxY - minY;
    if (w <= 0 || h <= 0 || w > 8000 || h > 8000) {
      this._drawRaw(ctx, obj);
      return;
    }

    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const octx = off.getContext('2d');
    const applyTransform = () => octx.setTransform(a, 0, 0, d, m.e - minX, m.f - minY);
    applyTransform();
    const rot = obj.rotation || 0;
    if (rot && obj.kind !== 'image') {
      const c = this.objectCenterWorld(obj);
      octx.translate(c.x, c.y);
      octx.rotate(rot);
      octx.translate(-c.x, -c.y);
    }
    this._drawRaw(octx, obj);

    // Дырки хранятся в локальной системе координат объекта (до поворота и
    // отражения). Применяем ту же трансформацию, что и к самому объекту:
    // поворот вокруг центра + отражение. Тогда маска автоматически едет и
    // масштабируется вместе с объектом (штрих, фигура, фото, текст).
    applyTransform();
    const fx = obj.flipX || (obj.shape && obj.shape.flipX);
    const fy = obj.flipY || (obj.shape && obj.shape.flipY);
    if (rot || fx || fy) {
      const c = this.objectCenterWorld(obj);
      octx.translate(c.x, c.y);
      if (rot) octx.rotate(rot);
      if (fx || fy) octx.scale(fx ? -1 : 1, fy ? -1 : 1);
      octx.translate(-c.x, -c.y);
    }
    octx.globalCompositeOperation = 'destination-out';
    octx.lineCap = 'round';
    octx.lineJoin = 'round';
    octx.strokeStyle = '#000';
    octx.fillStyle = '#000';
    const lbox = this.objectLocalBox(obj);
    for (const hole of obj.holes) {
      let pts;
      let lw;
      if (hole.pts && lbox) {
        // Новый формат: точки маски в локальных НОРМИРОВАННЫХ координатах
        // объекта (0..1). Пересчитываем в локальный прямоугольник при каждом
        // рендере — поэтому маска едет и масштабируется вместе с объектом.
        const bw = Math.max(lbox.width, lbox.height, 1);
        pts = hole.pts.map((pt) => ({ x: lbox.x + pt.u * lbox.width, y: lbox.y + pt.v * lbox.height }));
        lw = (hole.nw || 0) * bw;
      } else {
        // Старый формат (мировые координаты) — оставляем для совместимости.
        pts = hole.points || [];
        lw = hole.width || 1;
      }
      if (!pts.length) continue;
      octx.lineWidth = Math.max(lw, 0.5);
      if (pts.length === 1) {
        octx.beginPath();
        octx.arc(pts[0].x, pts[0].y, octx.lineWidth / 2, 0, Math.PI * 2);
        octx.fill();
      } else {
        octx.beginPath();
        octx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) octx.lineTo(pts[i].x, pts[i].y);
        octx.stroke();
      }
    }

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(off, minX, minY);
    ctx.restore();
  },

  _drawRaw(ctx, obj) {
    if (obj.kind === 'image') {
      images.drawImageObj(ctx, obj);
    } else if (obj.shape) {
      let sh = obj.shape;
      if (sh.auto) {
        // За темой следует только цвет обводки; цвет заливки независим.
        sh = { ...sh, color: app.ink };
      }
      shapes.drawShape(ctx, sh);
    } else if (obj.type === 'text') {
      this.drawText(ctx, obj);
    } else {
      this.drawStroke(ctx, obj);
    }
  },

  drawText(ctx, obj) {
    ctx.save();
    ctx.fillStyle = obj.auto ? app.ink : obj.color;
    ctx.font = textFont(obj);
    ctx.textBaseline = 'top';
    ctx.textAlign = obj.align || 'left';
    const lines = String(obj.text || '').split('\n');
    const lineHeight = (obj.size || 24) * 1.25;
    const b = textBounds(obj);
    // Отражение текста при перетаскивании маркера через ноль.
    if (obj.flipX || obj.flipY) {
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      ctx.translate(cx, cy);
      ctx.scale(obj.flipX ? -1 : 1, obj.flipY ? -1 : 1);
      ctx.translate(-cx, -cy);
    }
    let tx = obj.x;
    if (obj.align === 'center') tx = obj.x + b.width / 2;
    else if (obj.align === 'right') tx = obj.x + b.width;
    lines.forEach((line, i) => ctx.fillText(line, tx, obj.y + i * lineHeight));
    ctx.restore();
  },

  drawStroke(ctx, s, fromIndex, toIndex) {
    const pts = s.points;
    if (!pts || pts.length === 0) return;
    const start = Math.max(1, fromIndex == null ? 1 : fromIndex | 0);
    const end = Math.min(pts.length, toIndex == null ? pts.length : toIndex | 0);

    const color = s.auto ? app.ink : s.color;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (s.type === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = '#000';
      ctx.fillStyle = '#000';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      if (s.type === 'marker' || s.alpha != null) {
        ctx.globalAlpha = s.alpha == null ? 0.4 : s.alpha;
      }
    }

    const ps = (p) => {
      const val = typeof p === 'number' && isFinite(p) && p > 0 ? p : 0.5;
      return Math.min(Math.max(val / 0.5, 0.12), 2.4);
    };
    // Маркер не зависит от нажатия — постоянная толщина.
    const pressureFor = (p) => (s.type === 'marker' ? 1 : ps(p));

    if (pts.length === 1) {
      const w = Math.max(s.width * pressureFor(pts[0].pressure), 0.5);
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    if (start >= end) {
      ctx.restore();
      return;
    }

    // Батчинг: раньше каждый сегмент стоил отдельного beginPath/stroke.
    // Теперь сегменты группируются по толщине (с шагом ~3% от базовой
    // ширины) и рисуются одной панелью за проход. Для мыши/маркера
    // толщина постоянна — получается один путь на весь штрих.
    const baseW = Math.max(Number(s.width) || 1, 0.5);
    const step = Math.max(0.5, baseW * 0.03);
    const buckets = new Map();
    for (let i = start; i < end; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const w = Math.max(baseW * ((pressureFor(a.pressure) + pressureFor(b.pressure)) / 2), 0.5);
      const q = Math.max(0.5, Math.round(w / step) * step);
      let seg = buckets.get(q);
      if (!seg) {
        seg = [];
        buckets.set(q, seg);
      }
      seg.push(a.x, a.y, b.x, b.y);
    }
    for (const [w, seg] of buckets) {
      ctx.lineWidth = w;
      ctx.beginPath();
      for (let j = 0; j < seg.length; j += 4) {
        ctx.moveTo(seg[j], seg[j + 1]);
        ctx.lineTo(seg[j + 2], seg[j + 3]);
      }
      ctx.stroke();
    }
    ctx.restore();
  },

  objectLocalBox(obj) {
    if (!obj) return null;
    if (obj.kind === 'image') return { x: obj.x, y: obj.y, width: obj.width, height: obj.height };
    if (obj.shape) return shapes.shapeBounds(obj.shape);
    if (obj.type === 'text') return textBounds(obj);
    if (obj.type === 'eraser') return null;
    if (obj.points && obj.points.length) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of obj.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      const pad = (obj.width || 0) / 2;
      return {
        x: minX - pad,
        y: minY - pad,
        width: maxX - minX + pad * 2,
        height: maxY - minY + pad * 2,
      };
    }
    return null;
  },

  localFlip(obj) {
    if (obj.shape) return { fx: !!obj.shape.flipX, fy: !!obj.shape.flipY };
    return { fx: !!obj.flipX, fy: !!obj.flipY };
  },

  /**
   * Мировая точка -> локальная (до поворота и отражения).
   * Локальная система координат = система ДО применения трансформации
   * (позиция, поворот, масштаб). Используется для хранения маски ластика.
   */
  worldToLocalPoint(obj, p) {
    const box = this.objectLocalBox(obj);
    if (!box) return { x: p.x, y: p.y };
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const rot = obj.rotation || 0;
    const cos = Math.cos(-rot);
    const sin = Math.sin(-rot);
    let dx = p.x - cx;
    let dy = p.y - cy;
    let rx = dx * cos - dy * sin;
    let ry = dx * sin + dy * cos;
    const { fx, fy } = this.localFlip(obj);
    if (fx) rx = -rx;
    if (fy) ry = -ry;
    return { x: cx + rx, y: cy + ry };
  },

  objectBounds(obj) {
    if (!obj) return null;
    if (obj.kind === 'image') return images.imageBounds(obj);
    if (obj.shape) return shapes.shapeBounds(obj.shape);
    if (obj.type === 'text') return textBounds(obj);
    if (obj.type === 'eraser') return null;
    if (obj.points && obj.points.length) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of obj.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      const pad = (obj.width || 0) / 2;
      return {
        x: minX - pad,
        y: minY - pad,
        width: maxX - minX + pad * 2,
        height: maxY - minY + pad * 2,
      };
    }
    return null;
  },

  objectCornersWorld(obj) {
    if (obj.kind === 'image') return images.imageCorners(obj);
    const b = this.objectBounds(obj);
    if (!b) return [];
    const base =
      obj.shape &&
      obj.shape.kind === 'triangle' &&
      Array.isArray(obj.shape.points) &&
      obj.shape.points.length === 3
        ? shapes.shapePoints(obj.shape)
        : [
            { x: b.x, y: b.y },
            { x: b.x + b.width, y: b.y },
            { x: b.x + b.width, y: b.y + b.height },
            { x: b.x, y: b.y + b.height },
          ];
    const rot = obj.rotation || 0;
    if (!rot) return base;
    const c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    return base.map((p) => {
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
    });
  },

  contentBounds(doc) {
    const d = doc || activeDoc();
    if (!d) return null;
    const pts = [];
    for (const obj of d.strokes) {
      for (const c of this.objectCornersWorld(obj)) pts.push(c);
    }
    return aabbOfPoints(pts);
  },

  /**
   * Отрисовать документ в offscreen-канву и вернуть dataURL PNG.
   * Используется для экспорта и превью. opts:
   *   scale, padding, maxSize, background, mime.
   */
  renderToCanvas(doc, opts = {}) {
    const d = doc || activeDoc();
    const pad = opts.padding == null ? 40 : opts.padding;
    const maxSize = opts.maxSize || 4000;
    const content = d ? this.contentBounds(d) : null;
    let rect;
    if (content && content.width > 0 && content.height > 0) {
      rect = {
        x: content.x - pad,
        y: content.y - pad,
        width: content.width + pad * 2,
        height: content.height + pad * 2,
      };
    } else {
      rect = { x: 0, y: 0, width: 800, height: 600 };
    }

    let s = opts.scale || 1;
    const longest = Math.max(rect.width, rect.height);
    if (longest * s > maxSize) s = maxSize / longest;

    const w = Math.max(1, Math.round(rect.width * s));
    const h = Math.max(1, Math.round(rect.height * s));
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    if (opts.background) {
      ctx.fillStyle = opts.background;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.setTransform(s, 0, 0, s, -rect.x * s, -rect.y * s);
    if (d) {
      for (const obj of d.strokes) this.drawObject(ctx, obj);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return cv;
  },

  // Кадр выделения в мировых координатах.
  getSelectionFrame(doc) {
    const d = doc || activeDoc();
    const objs = selectedObjects(d);
    if (!objs.length) return null;

    // Одиночная линия/стрелка — только две концевые точки.
    if (objs.length === 1 && objs[0].shape && (objs[0].shape.kind === 'line' || objs[0].shape.kind === 'arrow')) {
      const obj = objs[0];
      const s = obj.shape;
      const c = this.objectCenterWorld(obj);
      const rot = obj.rotation || 0;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const rotP = (p) => {
        const dx = p.x - c.x;
        const dy = p.y - c.y;
        return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
      };
      return {
        kind: 'line',
        center: c,
        rotation: rot,
        handles: [
          { type: 'p0', ...rotP({ x: s.x1, y: s.y1 }) },
          { type: 'p1', ...rotP({ x: s.x2, y: s.y2 }) },
        ],
      };
    }

    // Одиночный произвольный треугольник — маркеры ставятся на вершины,
    // чтобы каждую можно было тянуть независимо.
    if (
      objs.length === 1 &&
      objs[0].shape &&
      objs[0].shape.kind === 'triangle' &&
      Array.isArray(objs[0].shape.points) &&
      objs[0].shape.points.length === 3
    ) {
      const obj = objs[0];
      const s = obj.shape;
      const b = this.objectBounds(obj) || { x: 0, y: 0, width: 0, height: 0 };
      const l = b.x;
      const t = b.y;
      const r = b.x + b.width;
      const btm = b.y + b.height;
      const cx = (l + r) / 2;
      const cy = (t + btm) / 2;
      const v = this.view();
      const handles = s.points.map((p, i) => ({ type: 'p' + i, x: p.x, y: p.y }));
      handles.push({ type: 'rot', x: cx, y: t - 28 / v.scale });
      return { kind: 'poly', rect: b, center: { x: cx, y: cy }, rotation: 0, handles, cornersOnly: true };
    }

    const pts = [];
    for (const obj of objs) for (const c of this.objectCornersWorld(obj)) pts.push(c);
    const rect = aabbOfPoints(pts);
    if (!rect) return null;

    const cornersOnly = objs.length === 1 && objs[0].shape && shapes.shapeCornersOnly(objs[0].shape.kind);
    const l = rect.x;
    const t = rect.y;
    const r = rect.x + rect.width;
    const b = rect.y + rect.height;
    const cx = (l + r) / 2;
    const cy = (t + b) / 2;

    const handles = [
      { type: 'nw', x: l, y: t },
      { type: 'ne', x: r, y: t },
      { type: 'se', x: r, y: b },
      { type: 'sw', x: l, y: b },
    ];
    if (!cornersOnly) {
      handles.push(
        { type: 'n', x: cx, y: t },
        { type: 'e', x: r, y: cy },
        { type: 's', x: cx, y: b },
        { type: 'w', x: l, y: cy }
      );
    }
    const v = this.view();
    handles.push({ type: 'rot', x: cx, y: t - 28 / v.scale });

    return { kind: 'box', rect, center: { x: cx, y: cy }, rotation: 0, handles, cornersOnly };
  },

  drawMarquee(ctx) {
    if (this.marquee) {
      const p0 = this.toScreen(this.marquee.x0, this.marquee.y0);
      const p1 = this.toScreen(this.marquee.x1, this.marquee.y1);
      const x = Math.min(p0.x, p1.x);
      const y = Math.min(p0.y, p1.y);
      const w = Math.abs(p1.x - p0.x);
      const h = Math.abs(p1.y - p0.y);
      ctx.save();
      ctx.fillStyle = 'rgba(255,77,48,0.15)';
      ctx.strokeStyle = '#ff4d30';
      ctx.lineWidth = 1.4;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }
    if (this.lasso && this.lasso.length > 1) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,77,48,0.12)';
      ctx.strokeStyle = '#ff4d30';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      const first = this.toScreen(this.lasso[0].x, this.lasso[0].y);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < this.lasso.length; i++) {
        const p = this.toScreen(this.lasso[i].x, this.lasso[i].y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  },

  drawSelection(ctx, doc) {
    const objs = selectedObjects(doc);
    if (!objs.length) return;

    const accent = app.accent || '#ff4d30';

    // Подсветка каждого объекта.
    ctx.save();
    ctx.strokeStyle = 'rgba(46,168,255,0.9)';
    ctx.lineWidth = 1.2;
    for (const obj of objs) {
      const cs = this.objectCornersWorld(obj).map((p) => this.toScreen(p.x, p.y));
      if (cs.length < 2) continue;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(cs[0].x, cs[0].y);
      for (let i = 1; i < cs.length; i++) ctx.lineTo(cs[i].x, cs[i].y);
      if (cs.length > 2) ctx.closePath();
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();

    const frame = this.getSelectionFrame(doc);
    if (!frame) return;

    // Лассо-контур (если задан) — не рисуем здесь.

    ctx.save();
    if (frame.kind === 'line') {
      ctx.strokeStyle = accent;
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.5;
      const s0 = this.toScreen(frame.handles[0].x, frame.handles[0].y);
      const s1 = this.toScreen(frame.handles[1].x, frame.handles[1].y);
      ctx.beginPath();
      ctx.moveTo(s0.x, s0.y);
      ctx.lineTo(s1.x, s1.y);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const h of frame.handles) {
        const sp = this.toScreen(h.x, h.y);
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = accent;
        ctx.stroke();
      }
    } else {
      const r = frame.rect;
      ctx.strokeStyle = accent;
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.5;
      if (frame.kind === 'poly') {
        // Произвольный треугольник: пунктир по контуру, маркеры на вершинах.
        const vs = frame.handles
          .filter((h) => h.type !== 'rot')
          .map((h) => this.toScreen(h.x, h.y));
        if (vs.length >= 3) {
          ctx.beginPath();
          ctx.moveTo(vs[0].x, vs[0].y);
          for (let i = 1; i < vs.length; i++) ctx.lineTo(vs[i].x, vs[i].y);
          ctx.closePath();
          ctx.stroke();
        }
      } else {
        const tl = this.toScreen(r.x, r.y);
        const br = this.toScreen(r.x + r.width, r.y + r.height);
        ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
      }
      ctx.setLineDash([]);

      for (const h of frame.handles) {
        const sp = this.toScreen(h.x, h.y);
        if (h.type === 'rot') {
          // линия от верха к маркеру вращения
          const top = this.toScreen(frame.center.x, r.y);
          ctx.beginPath();
          ctx.moveTo(top.x, top.y);
          ctx.lineTo(sp.x, sp.y);
          ctx.strokeStyle = accent;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 7, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.strokeStyle = accent;
          ctx.stroke();
          // значок ↻
          ctx.save();
          ctx.fillStyle = accent;
          ctx.font = '11px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('↻', sp.x, sp.y + 0.5);
          ctx.restore();
        } else {
          const s = 9;
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = accent;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.rect(sp.x - s / 2, sp.y - s / 2, s, s);
          ctx.fill();
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  },

  /** Найти маркер выделения по экранной точке. */
  handleAt(doc, sx, sy) {
    const frame = this.getSelectionFrame(doc);
    if (!frame) return null;
    const tol = 12;
    for (const h of frame.handles) {
      const sp = this.toScreen(h.x, h.y);
      if (Math.hypot(sp.x - sx, sp.y - sy) <= (h.type === 'rot' ? 14 : tol)) {
        return { ...h, frame };
      }
    }
    return null;
  },

  updateCursor(doc) {
    const el = this.cursorEl;
    if (!el || !this.boardCanvas) return;
    const tool = app.tool;
    const ts = settings.tools && settings.tools[tool];
    const width = (ts && ts.width) || app.width;
    const ringTool = (tool === 'brush' || tool === 'eraser' || tool === 'marker') && !this.spaceDown && tool !== 'hand';

    this.boardCanvas.classList.toggle('tool-select', tool === 'move' || tool === 'lasso');
    this.boardCanvas.classList.toggle('tool-hand', tool === 'hand' || this.spaceDown);
    this.boardCanvas.classList.toggle('tool-text', tool === 'text');
    this.boardCanvas.classList.toggle('can-pan', tool === 'hand' || this.spaceDown);

    if (ringTool && this.pointer.inside) {
      const d = Math.max(4, width * this.view().scale);
      el.style.width = `${d}px`;
      el.style.height = `${d}px`;
      el.style.left = `${this.pointer.x}px`;
      el.style.top = `${this.pointer.y}px`;
      el.classList.toggle('is-eraser', tool === 'eraser');
      el.classList.toggle('is-marker', tool === 'marker');
      el.style.display = 'block';
      this.boardCanvas.style.cursor = 'none';
    } else {
      el.style.display = 'none';
      this.boardCanvas.style.cursor = '';
    }
  },
};

export { textBounds, textFont };
