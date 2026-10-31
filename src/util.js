'use strict';

/* ==========================================================================
   GUSketch — общие утилиты.
   ========================================================================== */

let uidCounter = 0;

export function uid(prefix = 'id') {
  uidCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${uidCounter.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

export function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function debounce(fn, ms) {
  let t = 0;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function throttle(fn, ms) {
  let last = 0;
  let timer = 0;
  return (...args) => {
    const now = Date.now();
    const remaining = ms - (now - last);
    if (remaining <= 0) {
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = 0;
        fn(...args);
      }, remaining);
    }
  };
}

/** Преобразует data URL в { mime, ext, base64 }. */
export function parseDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || '');
  if (!m) return { mime: 'image/png', ext: 'png', base64: '' };
  const mime = m[1];
  const ext = (mime.split('/')[1] || 'png').replace('+xml', '').replace(/[^a-z0-9]/gi, '') || 'png';
  return { mime, ext, base64: m[2] };
}

/** Blob -> ArrayBuffer. */
export function blobToArrayBuffer(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

/** Canvas -> ArrayBuffer (PNG). */
export function canvasToArrayBuffer(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) return reject(new Error('Не удалось создать изображение'));
      try {
        resolve(await blobToArrayBuffer(blob));
      } catch (err) {
        reject(err);
      }
    }, 'image/png');
  });
}

/** Canvas -> data URL (PNG). */
export function canvasToDataUrl(canvas) {
  return canvas.toDataURL('image/png');
}

/** Гарантирует расширение у имени файла. */
export function ensureExt(name, ext) {
  const base = (name || 'GUSketch').replace(/[\\/:*?"<>|]+/g, '_');
  if (base.toLowerCase().endsWith('.' + ext.toLowerCase())) return base;
  // отрезаем прежнее расширение
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return `${stem}.${ext}`;
}

export function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Простой уникальный список без дублей. */
export function uniq(arr) {
  return Array.from(new Set(arr));
}

/** Ограничивает размер изображения по большей стороне. */
export function fitSize(w, h, max) {
  if (w <= max && h <= max) return { width: w, height: h };
  const k = max / Math.max(w, h);
  return { width: Math.round(w * k), height: Math.round(h * k) };
}

/**
 * Не даёт плавающей панели уйти за край окна.
 * Сдвиг делается через margin — это не конфликтует с left/top и анимациями.
 * margin — минимальный отступ от края (по умолчанию 8px).
 */
export function clampToViewport(el, margin = 8) {
  if (!el || el.hidden) return;
  el.style.marginLeft = '0px';
  el.style.marginTop = '0px';
  const rect = el.getBoundingClientRect();
  if (!rect.width && !rect.height) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let dx = 0;
  let dy = 0;
  if (rect.left < margin) dx = margin - rect.left;
  else if (rect.right > vw - margin) dx = vw - margin - rect.right;
  if (rect.top < margin) dy = margin - rect.top;
  else if (rect.bottom > vh - margin) dy = vh - margin - rect.bottom;

  if (dx) el.style.marginLeft = `${dx}px`;
  if (dy) el.style.marginTop = `${dy}px`;
}
