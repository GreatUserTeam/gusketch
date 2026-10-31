'use strict';

/* ==========================================================================
   GUSketch — собственный выбор цвета (HSV + Hue + Alpha).
   Два представления одного и того же контроллера:
   • openColorPicker — модальное окно (настройки и т.п.);
   • openMiniPicker  — компактная всплывающая панель рядом с плиткой/элементом.
   Поля защищены: # и каркас rgba( , ) , запятые не редактируются.
   ========================================================================== */

import { clamp, clampToViewport } from './util.js';

/* ------------------------------- Цветовые утилиты ------------------------------- */
function hsvToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

function parseColor(str) {
  if (!str || typeof str !== 'string') return null;
  const s = str.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) {
    const c = m[1];
    return {
      r: parseInt(c[0] + c[0], 16),
      g: parseInt(c[1] + c[1], 16),
      b: parseInt(c[2] + c[2], 16),
      a: 1,
    };
  }
  m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) {
    const c = m[1];
    return { r: parseInt(c.slice(0, 2), 16), g: parseInt(c.slice(2, 4), 16), b: parseInt(c.slice(4, 6), 16), a: 1 };
  }
  m = /^#([0-9a-f]{8})$/i.exec(s);
  if (m) {
    const c = m[1];
    return {
      r: parseInt(c.slice(0, 2), 16),
      g: parseInt(c.slice(2, 4), 16),
      b: parseInt(c.slice(4, 6), 16),
      a: parseInt(c.slice(6, 8), 16) / 255,
    };
  }
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s);
  if (m) {
    return {
      r: clamp(Math.round(Number(m[1])), 0, 255),
      g: clamp(Math.round(Number(m[2])), 0, 255),
      b: clamp(Math.round(Number(m[3])), 0, 255),
      a: m[4] == null ? 1 : clamp(Number(m[4]), 0, 1),
    };
  }
  return null;
}

function hex2(n) {
  return n.toString(16).padStart(2, '0');
}

function toHex(r, g, b, a, withAlpha) {
  if (withAlpha && a < 1) return `#${hex2(r)}${hex2(g)}${hex2(b)}${hex2(Math.round(a * 255))}`;
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

function toHexDigits(r, g, b, a, withAlpha) {
  return toHex(r, g, b, a, withAlpha).slice(1);
}

function toRgba(r, g, b, a) {
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 100) / 100})`;
}

function clampInt(v, min, max) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return min;
  return clamp(n, min, max);
}

/* ------------------------------- Разметка тела ------------------------------- */
function bodyMarkup() {
  return `
    <div class="cp-body">
      <div class="cp-sv"><span class="cp-sv-knob"></span></div>
      <div class="cp-hue"><span class="cp-hue-knob"></span></div>
      <div class="cp-alpha"><span class="cp-alpha-knob"></span></div>
      <div class="cp-readout">
        <span class="cp-preview"></span>
        <div class="cp-fields">
          <label class="cp-field">
            <span class="cp-label">HEX</span>
            <span class="cp-input cp-input--hex">
              <span class="cp-prefix">#</span>
              <input class="cp-hex-input" type="text" spellcheck="false" autocomplete="off" />
            </span>
          </label>
          <div class="cp-field">
            <span class="cp-label">RGBA</span>
            <span class="cp-input cp-input--rgba">
              <span class="cp-prefix">rgba(</span>
              <input class="cp-num cp-num--r" type="text" inputmode="numeric" autocomplete="off" />
              <span class="cp-sep">,</span>
              <input class="cp-num cp-num--g" type="text" inputmode="numeric" autocomplete="off" />
              <span class="cp-sep">,</span>
              <input class="cp-num cp-num--b" type="text" inputmode="numeric" autocomplete="off" />
              <span class="cp-sep">,</span>
              <input class="cp-num cp-num--a" type="text" inputmode="decimal" autocomplete="off" />
              <span class="cp-prefix">)</span>
            </span>
          </div>
        </div>
      </div>
    </div>`;
}

function collectRefs(root) {
  return {
    sv: root.querySelector('.cp-sv'),
    knob: root.querySelector('.cp-sv-knob'),
    hueWrap: root.querySelector('.cp-hue'),
    hueKnob: root.querySelector('.cp-hue-knob'),
    alphaWrap: root.querySelector('.cp-alpha'),
    alphaKnob: root.querySelector('.cp-alpha-knob'),
    preview: root.querySelector('.cp-preview'),
    hexDigits: root.querySelector('.cp-hex-input'),
    r: root.querySelector('.cp-num--r'),
    g: root.querySelector('.cp-num--g'),
    b: root.querySelector('.cp-num--b'),
    a: root.querySelector('.cp-num--a'),
  };
}

/* ------------------------------- Контроллер ------------------------------- */
function createController(refs) {
  const st = { h: 0, s: 1, v: 1, a: 1, alpha: true, editing: false, dragging: false };

  function rgb() {
    return hsvToRgb(st.h, st.s, st.v);
  }

  function paint() {
    const { r, g, b } = rgb();
    refs.sv.style.setProperty('--cp-hue', String(st.h));
    refs.knob.style.left = `${st.s * 100}%`;
    refs.knob.style.top = `${(1 - st.v) * 100}%`;
    refs.knob.style.background = `rgb(${r}, ${g}, ${b})`;
    refs.hueKnob.style.left = `${(st.h / 360) * 100}%`;
    refs.alphaKnob.style.left = `${st.a * 100}%`;
    refs.alphaKnob.style.background = `rgb(${r}, ${g}, ${b})`;
    refs.alphaWrap.style.setProperty('--cp-color', `rgb(${r}, ${g}, ${b})`);
    refs.alphaWrap.classList.toggle('is-disabled', !st.alpha);
    refs.preview.style.backgroundImage =
      'linear-gradient(45deg, #999 25%, transparent 25%), linear-gradient(-45deg, #999 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #999 75%), linear-gradient(-45deg, transparent 75%, #999 75%)';
    refs.preview.style.backgroundSize = '10px 10px';
    refs.preview.style.backgroundPosition = '0 0, 0 5px, 5px -5px, -5px 0';
    refs.preview.style.boxShadow = `inset 0 0 0 100px ${toRgba(r, g, b, st.a)}`;
    if (!st.editing) {
      refs.hexDigits.value = toHexDigits(r, g, b, st.a, st.alpha);
      refs.r.value = String(r);
      refs.g.value = String(g);
      refs.b.value = String(b);
      refs.a.value = String(Math.round(st.a * 100) / 100);
    }
  }

  function applyParsed(p) {
    const hsv = rgbToHsv(p.r, p.g, p.b);
    st.h = hsv.h;
    st.s = hsv.s;
    st.v = hsv.v;
    st.a = p.a;
    paint();
  }

  function setColor(str) {
    const p = parseColor(str) || { r: 255, g: 77, b: 48, a: 1 };
    applyParsed(p);
  }

  function setAlpha(enabled) {
    st.alpha = enabled !== false;
  }

  function getColor() {
    const { r, g, b } = rgb();
    return toHex(r, g, b, st.a, st.alpha);
  }

  /* --- Ввод HEX (только hex-цифры, # — отдельный неизменяемый префикс) --- */
  function bindHex() {
    const input = refs.hexDigits;
    input.addEventListener('beforeinput', (e) => {
      if (e.inputType && e.inputType.indexOf('delete') === 0) return;
      const data = e.data || '';
      if (data && !/^[0-9a-fA-F]*$/.test(data)) e.preventDefault();
    });
    input.addEventListener('input', () => {
      const max = st.alpha ? 8 : 6;
      let v = input.value.replace(/[^0-9a-fA-F]/g, '');
      if (v.length > max) v = v.slice(0, max);
      if (v !== input.value) input.value = v;
      if (v.length === 3 || v.length === 6 || v.length === 8) {
        const p = parseColor('#' + v);
        if (p) {
          st.editing = true;
          applyParsed(p);
          st.editing = false;
        }
      }
    });
    input.addEventListener('blur', () => {
      st.editing = false;
      paint();
    });
  }

  /* --- Ввод RGBA (четыре числовых поля, каркас неизменяем) --- */
  function bindRgba() {
    const nums = [refs.r, refs.g, refs.b, refs.a];
    const maxLen = (el) => (el === refs.a ? 4 : 3);
    for (const el of nums) {
      el.addEventListener('beforeinput', (e) => {
        if (e.inputType && e.inputType.indexOf('delete') === 0) return;
        const data = e.data || '';
        const ok = el === refs.a ? /^[0-9.]*$/.test(data) : /^[0-9]*$/.test(data);
        if (data && !ok) e.preventDefault();
      });
      el.addEventListener('input', () => {
        let v = el.value.replace(/[^0-9.]/g, '');
        v = v.replace(/(\..*)\./g, '$1');
        if (el !== refs.a) v = v.replace(/\./g, '');
        if (v.length > maxLen(el)) v = v.slice(0, maxLen(el));
        if (v !== el.value) el.value = v;
        const vals = [refs.r.value, refs.g.value, refs.b.value, refs.a.value];
        if (vals.some((x) => x.trim() === '' || Number.isNaN(Number(x)))) return;
        st.editing = true;
        applyParsed({
          r: clampInt(refs.r.value, 0, 255),
          g: clampInt(refs.g.value, 0, 255),
          b: clampInt(refs.b.value, 0, 255),
          a: clamp(Number(refs.a.value), 0, 1),
        });
        st.editing = false;
      });
      el.addEventListener('blur', () => {
        st.editing = false;
        paint();
      });
    }
  }

  function bindArea(wrap, onMove) {
    let drag = false;
    wrap.addEventListener('pointerdown', (e) => {
      drag = true;
      try { wrap.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
      onMove(e);
    });
    wrap.addEventListener('pointermove', (e) => {
      if (drag) onMove(e);
    });
    wrap.addEventListener('pointerup', (e) => {
      drag = false;
      try { wrap.releasePointerCapture(e.pointerId); } catch (_) { /* noop */ }
    });
  }

  function bind() {
    bindArea(refs.sv, (e) => {
      const r = refs.sv.getBoundingClientRect();
      st.s = clamp((e.clientX - r.left) / r.width, 0, 1);
      st.v = clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
      st.editing = false;
      paint();
    });
    bindArea(refs.hueWrap, (e) => {
      const r = refs.hueWrap.getBoundingClientRect();
      st.h = clamp((e.clientX - r.left) / r.width, 0, 1) * 360;
      st.editing = false;
      paint();
    });
    bindArea(refs.alphaWrap, (e) => {
      if (!st.alpha) return;
      const r = refs.alphaWrap.getBoundingClientRect();
      st.a = clamp((e.clientX - r.left) / r.width, 0, 1);
      st.editing = false;
      paint();
    });
    bindHex();
    bindRgba();
  }

  return { st, rgb, paint, applyParsed, setColor, setAlpha, getColor, bind };
}

/* ------------------------------- Модальное окно ------------------------------- */
let modal = null;
let modalRefs = null;
let modalCtl = null;
let modalResolver = null;

function ensureDom() {
  if (modal) return;
  modal = document.createElement('div');
  modal.className = 'modal cp-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal__backdrop" data-cp-close></div>
    <div class="modal__dialog cp-dialog" role="dialog" aria-modal="true" aria-label="Выбор цвета">
      <div class="cp-head">
        <h2 class="modal__title cp-title">Цвет</h2>
        <button class="icon-btn" type="button" data-cp-close aria-label="Закрыть">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
      </div>
      ${bodyMarkup()}
      <div class="cp-actions">
        <button class="btn" type="button" data-cp-cancel>Отмена</button>
        <button class="btn btn--primary" type="button" data-cp-apply>Применить</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  modalRefs = collectRefs(modal);
  modalCtl = createController(modalRefs);
  modalCtl.bind();

  modal.querySelector('[data-cp-apply]').addEventListener('click', () => closeModal(modalCtl.getColor()));
  modal.querySelector('[data-cp-cancel]').addEventListener('click', () => closeModal(null));
  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-cp-close]')) closeModal(null);
  });
}

function closeModal(value) {
  modal.hidden = true;
  document.removeEventListener('keydown', onModalKey, true);
  const res = modalResolver;
  modalResolver = null;
  if (res) res(value);
}

function onModalKey(e) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    closeModal(null);
  }
}

/**
 * Открыть модальное окно выбора цвета.
 * @param {{ value?: string, alpha?: boolean, title?: string }} opts
 * @returns {Promise<string|null>} цвет в HEX (#rrggbb или #rrggbbaa) либо null
 */
export function openColorPicker(opts = {}) {
  ensureDom();
  modalCtl.setAlpha(opts.alpha !== false);
  modalCtl.setColor(opts.value || '#ff4d30');
  const titleEl = modal.querySelector('.cp-title');
  if (titleEl) titleEl.textContent = opts.title || 'Цвет';
  modal.hidden = false;
  document.addEventListener('keydown', onModalKey, true);
  return new Promise((resolve) => {
    modalResolver = resolve;
  });
}

/* ------------------------------- Мини-панель ------------------------------- */
let mini = null;
let miniRefs = null;
let miniCtl = null;
let miniResolver = null;
let miniOutside = null;

function ensureMiniDom() {
  if (mini) return;
  mini = document.createElement('div');
  mini.className = 'cp-mini';
  mini.hidden = true;
  mini.innerHTML = `
    <div class="cp-mini__head">Цвет</div>
    ${bodyMarkup()}
    <div class="cp-actions cp-mini__actions">
      <button class="btn btn--sm" type="button" data-cp-cancel>Отмена</button>
      <button class="btn btn--primary btn--sm" type="button" data-cp-apply>Применить</button>
    </div>`;
  document.body.appendChild(mini);

  miniRefs = collectRefs(mini);
  miniCtl = createController(miniRefs);
  miniCtl.bind();

  mini.querySelector('[data-cp-apply]').addEventListener('click', () => closeMini(miniCtl.getColor()));
  mini.querySelector('[data-cp-cancel]').addEventListener('click', () => closeMini(null));
  mini.addEventListener('pointerdown', (e) => e.stopPropagation());
}

function closeMini(value) {
  if (!mini || mini.hidden) return;
  mini.hidden = true;
  if (miniOutside) {
    document.removeEventListener('pointerdown', miniOutside, true);
    miniOutside = null;
  }
  const res = miniResolver;
  miniResolver = null;
  if (res) res(value);
}

/**
 * Открыть компактную панель выбора цвета рядом с элементом.
 * @param {HTMLElement} anchor
 * @param {{ value?: string, alpha?: boolean }} opts
 * @returns {Promise<string|null>}
 */
export function openMiniPicker(anchor, opts = {}) {
  ensureMiniDom();
  miniCtl.setAlpha(opts.alpha !== false);
  miniCtl.setColor(opts.value || '#ff4d30');
  mini.hidden = false;

  // Позиционируем: справа от якоря → слева → поверх панели ближе к центру экрана.
  const r = anchor
    ? anchor.getBoundingClientRect()
    : { left: 40, top: 120, right: 76, bottom: 156, width: 36, height: 36 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 8;
  const mw = mini.offsetWidth || 264;
  const mh = mini.offsetHeight || 320;
  let left;
  if (r.right + margin + mw <= vw - margin) {
    // влезает справа
    left = r.right + margin;
  } else if (r.left - margin - mw >= margin) {
    // не влезает справа — показываем слева
    left = r.left - margin - mw;
  } else {
    // не влезает ни справа, ни слева — поверх, ближе к центру экрана
    left = Math.max(margin, Math.min(vw - mw - margin, (vw - mw) / 2));
  }
  let top = r.top;
  if (top + mh > vh - margin) top = vh - mh - margin;
  if (top < margin) top = margin;
  mini.style.left = `${Math.round(left)}px`;
  mini.style.top = `${Math.round(top)}px`;
  clampToViewport(mini, margin);

  // Закрытие по клику вне панели.
  miniOutside = (e) => {
    if (!mini.contains(e.target)) closeMini(null);
  };
  setTimeout(() => {
    if (!mini.hidden) document.addEventListener('pointerdown', miniOutside, true);
  }, 0);

  return new Promise((resolve) => {
    miniResolver = resolve;
  });
}
