'use strict';

/* ==========================================================================
   GUSketch — изображения: загрузка, кэш, отрисовка, геометрия.
   ========================================================================== */

import { uid, fitSize } from './util.js';
import { emit } from './state.js';

const cache = new Map(); // src -> { img, loaded, error }

export function getRecord(src) {
  if (!src) return null;
  let rec = cache.get(src);
  if (rec) return rec;

  const img = new Image();
  rec = { img, loaded: false, error: false };
  cache.set(src, rec);

  img.onload = () => {
    rec.loaded = true;
    emit('image-loaded', src);
  };
  img.onerror = () => {
    rec.error = true;
    emit('image-loaded', src);
  };
  img.decoding = 'async';
  img.src = src;
  return rec;
}

export function preload(src) {
  const rec = getRecord(src);
  if (!rec) return Promise.resolve(null);
  if (rec.loaded || rec.error) return Promise.resolve(rec);
  return new Promise((resolve) => {
    const check = () => {
      if (rec.loaded || rec.error) resolve(rec);
      else setTimeout(check, 30);
    };
    check();
  });
}

export async function ensureLoaded(doc, timeoutMs = 3000) {
  if (!doc) return;
  const srcs = doc.strokes.filter((s) => s.kind === 'image' && s.src).map((s) => s.src);
  if (!srcs.length) return;
  await Promise.race([
    Promise.all(srcs.map((s) => preload(s))),
    new Promise((r) => setTimeout(r, timeoutMs)),
  ]);
}

/** Создать объект изображения из { dataUrl, name, mime }. */
export function createImageObject(file, maxSide = 600) {
  return new Promise((resolve) => {
    const img = new Image();
    const finalize = () => {
      const natW = img.naturalWidth || 400;
      const natH = img.naturalHeight || 300;
      const size = fitSize(natW, natH, maxSide);
      resolve({
        id: uid('img'),
        kind: 'image',
        name: file.name || 'image',
        src: file.dataUrl,
        x: 0,
        y: 0,
        width: size.width,
        height: size.height,
        rotation: 0,
        opacity: 1,
      });
    };
    img.onload = finalize;
    img.onerror = finalize;
    img.src = file.dataUrl;
    // на случай, если onload не сработает
    setTimeout(() => {
      if (!img.naturalWidth) {
        /* оставляем как есть */
      }
    }, 2500);
  });
}

export function drawImageObj(ctx, obj) {
  const rec = getRecord(obj.src);
  const cx = obj.x + obj.width / 2;
  const cy = obj.y + obj.height / 2;

  ctx.save();
  ctx.globalAlpha = obj.opacity == null ? 1 : obj.opacity;
  ctx.translate(cx, cy);
  if (obj.rotation) ctx.rotate(obj.rotation);
  // Отражение при перетаскивании через ноль (negative scale).
  if (obj.flipX || obj.flipY) ctx.scale(obj.flipX ? -1 : 1, obj.flipY ? -1 : 1);
  ctx.translate(-obj.width / 2, -obj.height / 2);

  if (rec && rec.loaded) {
    try {
      ctx.drawImage(rec.img, 0, 0, obj.width, obj.height);
    } catch (_) {
      /* noop */
    }
  } else {
    // заглушка, пока изображение грузится
    ctx.fillStyle = 'rgba(128,128,128,0.18)';
    ctx.fillRect(0, 0, obj.width, obj.height);
    ctx.strokeStyle = 'rgba(128,128,128,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, obj.width, obj.height);
  }
  ctx.restore();
}

export function imageCorners(obj) {
  const cx = obj.x + obj.width / 2;
  const cy = obj.y + obj.height / 2;
  const hw = obj.width / 2;
  const hh = obj.height / 2;
  const rot = obj.rotation || 0;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const pts = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
  return pts.map((p) => ({ x: cx + p.x * cos - p.y * sin, y: cy + p.x * sin + p.y * cos }));
}

export function imageBounds(obj) {
  const c = imageCorners(obj);
  const xs = c.map((p) => p.x);
  const ys = c.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

export function hitImage(obj, pt) {
  const cx = obj.x + obj.width / 2;
  const cy = obj.y + obj.height / 2;
  const rot = obj.rotation || 0;
  const cos = Math.cos(-rot);
  const sin = Math.sin(-rot);
  const dx = pt.x - cx;
  const dy = pt.y - cy;
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  return Math.abs(lx) <= obj.width / 2 && Math.abs(ly) <= obj.height / 2;
}

export function moveImage(obj, dx, dy) {
  obj.x += dx;
  obj.y += dy;
}
