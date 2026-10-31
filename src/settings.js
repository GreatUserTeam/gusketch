'use strict';

/* ==========================================================================
   GUSketch — настройки приложения.
   Хранятся в userData/settings.json, применяются мгновенно.
   ========================================================================== */

import { app, emit, inkColor } from './state.js';
import { throttle, deepClone } from './util.js';
import { openColorPicker } from './colorpicker.js';
import { setLang, resolveLang, applyLang } from './i18n.js';

/** Обновить CSS-переменную --range-progress для закраски трека слайдера до thumb'а. */
export function updateRangeProgress(input) {
  if (!input) return;
  const min = parseFloat(input.min) || 0;
  const max = parseFloat(input.max) || 100;
  const val = parseFloat(input.value) || 0;
  const pct = ((val - min) / (max - min)) * 100;
  input.style.setProperty('--range-progress', pct + '%');
}

/** Инициализировать все range-инпуты: выставить --range-progress и повесить делегирование. */
let rangeDelegationBound = false;
export function initRangeInputs() {
  // Инициализация существующих
  for (const input of document.querySelectorAll('input[type="range"]')) {
    updateRangeProgress(input);
  }
  // Делегирование на document для динамически создаваемых
  if (!rangeDelegationBound) {
    rangeDelegationBound = true;
    document.addEventListener('input', (e) => {
      if (e.target.matches('input[type="range"]')) {
        updateRangeProgress(e.target);
      }
    });
  }
}

export const FONT_LIST = [
  'Inter',
  'Arial',
  'Times New Roman',
  'Courier New',
  'Georgia',
  'Verdana',
  'Trebuchet MS',
];

function defaultBrushPresets() {
  return [
    { width: 2, color: '' },
    { width: 5, color: '' },
    { width: 10, color: '' },
    { width: 20, color: '' },
    { width: 40, color: '' },
    { width: 80, color: '' },
  ];
}

function defaultMarkerPresets() {
  return [
    { width: 12, color: '#ffd93d', opacity: 40 },
    { width: 20, color: '#ffd93d', opacity: 40 },
    { width: 12, color: '#7bed9f', opacity: 40 },
    { width: 12, color: '#70a1ff', opacity: 40 },
    { width: 12, color: '#ff6b81', opacity: 40 },
    { width: 30, color: '#ffd93d', opacity: 40 },
  ];
}

/** Стандартный набор из 10 плиток цвета. Первая — «Тема» (''). */
export function defaultPalette() {
  return ['', '#ffffff', '#000000', '#ff4d30', '#ff9800', '#ffeb3b', '#4caf50', '#2196f3', '#3f51b5', '#9c27b0'];
}

function defaultArrowPresets() {
  return [
    { width: 2, color: '' },
    { width: 4, color: '' },
    { width: 6, color: '#ff4d30' },
    { width: 10, color: '' },
    { width: 16, color: '#ffb020' },
  ];
}

function defaultTools() {
  return {
    brush: { width: 10, color: '' },
    marker: { width: 20, color: '', opacity: 40 },
    eraser: { width: 24, mode: 'object' },
    shape: {
      width: 5,
      color: '',
      strokeEnabled: true,
      strokeOpacity: 100,
      fill: false,
      fillColor: '#ff4d30',
      fillOpacity: 100,
      kind: 'rect',
    },
    line: { width: 5, color: '' },
    arrow: { width: 5, color: '', opacity: 100 },
    text: { font: 'Inter', size: 24, color: '', align: 'left' },
  };
}

export const DEFAULT_SETTINGS = {
  theme: 'dark', // dark | light | system
  uiScale: 1, // 1 | 1.25 | 1.5
  accent: '#ff4d30',
  defaultWidth: 10,
  defaultColor: '', // '' => автоматом под тему
  smoothing: true,
  stabilizer: 0, // 0..100
  autosave: true,
  autosaveInterval: 5, // секунды (1..300)
  saveFolder: '',
  restoreTabs: true,
  askBeforeDelete: true,
  // Раздельные подтверждения для вкладок, листов и пресетов.
  askBeforeDeleteTab: true,
  askBeforeDeleteSheet: true,
  askBeforeDeletePreset: true,
  // Предупреждать о занятом имени при переименовании вкладки.
  warnOccupiedName: true,
  // Язык интерфейса: 'auto' | 'ru' | 'en'
  lang: 'auto',
  // Поведение при нажатии на крестик: 'quit' | 'tray' | 'nothing'
  closeBehavior: 'quit',
  // Последняя активная вкладка (по имени) — восстанавливается при запуске.
  activeTabName: '',
  // Путь системной папки проектов (заполняется при запуске).
  projectsPath: '',
  boundsPadding: 500, // 100..5000
  gridColor: '', // '' => автоматом под тему
  tools: defaultTools(),
  presets: { brush: defaultBrushPresets(), marker: defaultMarkerPresets(), arrow: defaultArrowPresets() },
  palette: {
    stroke: defaultPalette(),
    fill: defaultPalette(),
    text: defaultPalette(),
    arrow: defaultPalette(),
    line: defaultPalette(),
  },
  bubble: { x: 0, y: 200 },
};

export const settings = deepClone(DEFAULT_SETTINGS);

let systemMedia = null;

/* ------------------------------ Загрузка/сохранение ------------------------------ */
export async function load() {
  try {
    const saved = await window.gusketch.settingsLoad();
    if (saved && typeof saved === 'object') {
      Object.assign(settings, DEFAULT_SETTINGS, saved);
      // Значение могло быть сохранено старой версией или вручную — валидируем.
      if (!['quit', 'tray', 'nothing'].includes(settings.closeBehavior)) {
        settings.closeBehavior = 'quit';
      }
      // Глубокое слияние вложенных структур, чтобы не потерять новые поля.
      settings.tools = { ...defaultTools(), ...(saved.tools || {}) };
      for (const k of Object.keys(defaultTools())) {
        settings.tools[k] = { ...defaultTools()[k], ...(saved.tools && saved.tools[k]) };
      }
      settings.presets = {
        brush: defaultBrushPresets(),
        marker: defaultMarkerPresets(),
        arrow: defaultArrowPresets(),
        ...(saved.presets || {}),
      };
      if (!settings.palette) settings.palette = {};
      for (const k of ['stroke', 'fill', 'text', 'arrow', 'line']) {
        const p = settings.palette[k];
        if (!Array.isArray(p) || p.length !== 10) {
          settings.palette[k] = defaultPalette();
        } else {
          settings.palette[k] = p.slice();
        }
      }
      if (Array.isArray(saved.palette) && saved.palette.length === 10 && !settings.palette.stroke) {
        // миграция старой единой палитры
        for (const k of ['stroke', 'fill', 'text', 'arrow', 'line']) {
          settings.palette[k] = saved.palette.slice();
        }
      }
      settings.bubble = { x: 0, y: 200, ...(saved.bubble || {}) };
      // Миграция: старое единое «спрашивать перед удалением».
      if (saved.askBeforeDelete === false) {
        if (saved.askBeforeDeleteTab == null) settings.askBeforeDeleteTab = false;
        if (saved.askBeforeDeleteSheet == null) settings.askBeforeDeleteSheet = false;
        if (saved.askBeforeDeletePreset == null) settings.askBeforeDeletePreset = false;
      }
    }
  } catch (err) {
    console.warn('Не удалось загрузить настройки', err);
  }
  try {
    const pd = await window.gusketch.projectsDir();
    if (pd && pd.ok && pd.dir) settings.projectsPath = pd.dir;
  } catch (_) {
    /* noop */
  }
  app.settings = settings;
  try {
    window.gusketch.setCloseBehavior(settings.closeBehavior);
  } catch (_) {
    /* noop */
  }
  // Применить язык
  setLang(resolveLang(settings.lang));
  applyLang();
  return settings;
}

const persist = throttle(() => {
  try {
    window.gusketch.settingsSave(JSON.stringify(settings, null, 2));
  } catch (err) {
    console.warn('Не удалось сохранить настройки', err);
  }
}, 250);

export function save() {
  persist();
}

/* ------------------------------ Настройки инструментов ------------------------------ */
export function getToolSettings(tool) {
  if (!settings.tools) settings.tools = defaultTools();
  if (!settings.tools[tool]) settings.tools[tool] = {};
  return settings.tools[tool];
}

/** Толщина инструмента. */
export function toolWidth(tool) {
  const ts = getToolSettings(tool);
  if (ts.width != null) return ts.width;
  return settings.defaultWidth || 10;
}

/** Цвет инструмента: { color, auto }. */
export function toolInk(tool) {
  const ts = getToolSettings(tool);
  if (ts.color) return { color: ts.color, auto: false };
  if (settings.defaultColor) return { color: settings.defaultColor, auto: false };
  return { color: app.ink || inkColor(), auto: true };
}

/* ------------------------------ Применение ------------------------------ */
function resolveTheme() {
  if (settings.theme === 'system') {
    return systemMedia && systemMedia.matches ? 'dark' : 'light';
  }
  return settings.theme === 'light' ? 'light' : 'dark';
}

export function apply() {
  const theme = resolveTheme();
  app.theme = theme;
  document.documentElement.dataset.theme = theme;
  app.ink = inkColor();

  document.documentElement.style.setProperty('--accent', settings.accent || '#ff4d30');
  app.accent = settings.accent || '#ff4d30';
  document.documentElement.style.setProperty('--ui-scale', String(settings.uiScale || 1));

  // Синхронизировать сегменты темы в шапке и в окне настроек.
  const header = document.getElementById('themeSeg');
  if (header) {
    const index = theme === 'light' ? 1 : 0;
    header.style.setProperty('--seg-index', String(index));
    for (const b of header.querySelectorAll('.seg__btn')) {
      b.classList.toggle('is-active', b.dataset.themeValue === theme);
    }
  }

  try {
    window.gusketch.setTheme(settings.theme);
  } catch (_) {
    /* noop */
  }

  emit('settings-changed', settings);
}

export function setTheme(theme) {
  settings.theme = theme;
  apply();
  save();
  syncSettingsUI();
}

/* ------------------------------ Окно настроек ------------------------------ */
function setSeg(segEl, value) {
  if (!segEl) return;
  const buttons = Array.from(segEl.querySelectorAll('.seg__btn'));
  const index = buttons.findIndex((b) => b.dataset.value === String(value));
  const safe = index < 0 ? 0 : index;
  segEl.style.setProperty('--seg-index', String(safe));
  buttons.forEach((b, i) => b.classList.toggle('is-active', i === safe));
}

const CLOSE_BEHAVIOR_VALUES = ['quit', 'tray', 'nothing'];

function closeCloseBehaviorDropdown(root) {
  if (!root) return;
  const trigger = root.querySelector('.set-dropdown__trigger');
  const menu = root.querySelector('.set-dropdown__menu');
  if (menu) menu.hidden = true;
  root.classList.remove('is-open');
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
}

function syncCloseBehaviorDropdown(root, value) {
  if (!root) return;
  const safe = CLOSE_BEHAVIOR_VALUES.includes(value) ? value : 'quit';
  const trigger = root.querySelector('.set-dropdown__trigger');
  const triggerValue = root.querySelector('.set-dropdown__value');
  let label = '';

  for (const item of root.querySelectorAll('.set-dropdown__item')) {
    const active = item.dataset.value === safe;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-selected', active ? 'true' : 'false');
    if (active) label = item.textContent.trim();
  }

  if (trigger) trigger.dataset.value = safe;
  if (triggerValue && label) triggerValue.textContent = label;
}

/** Отрисовать цвет на кнопке-образце. color='' => показать «тема». */
function paintSwatch(btn, color, auto) {
  if (!btn) return;
  btn.classList.toggle('is-auto', !!auto || !color);
  btn.style.background = auto || !color ? '' : color;
  btn.title = auto || !color ? 'Цвет темы' : color;
}

export function syncSettingsUI() {
  setSeg(document.getElementById('setTheme'), settings.theme);
  setSeg(document.getElementById('setLang'), settings.lang);

  const closeBehaviorDropdown = document.getElementById('setCloseBehavior');
  if (closeBehaviorDropdown) {
    syncCloseBehaviorDropdown(closeBehaviorDropdown, settings.closeBehavior);
  }

  const uiScaleRange = document.getElementById('uiScaleRange');
  const uiScaleRangeVal = document.getElementById('uiScaleRangeVal');
  if (uiScaleRange) uiScaleRange.value = String(Math.round(settings.uiScale * 100));
  if (uiScaleRangeVal) uiScaleRangeVal.textContent = `${Math.round(settings.uiScale * 100)}%`;
  updateRangeProgress(uiScaleRange);

  paintSwatch(document.getElementById('setAccentBtn'), settings.accent || '#ff4d30');
  paintSwatch(document.getElementById('setDefColorBtn'), settings.defaultColor, !settings.defaultColor);
  paintSwatch(document.getElementById('setGridColorBtn'), settings.gridColor, !settings.gridColor);

  const dw = document.getElementById('setDefWidth');
  if (dw) dw.value = String(settings.defaultWidth);
  const dwv = document.getElementById('setDefWidthVal');
  if (dwv) dwv.textContent = `${settings.defaultWidth} px`;

  const sm = document.getElementById('setSmoothing');
  if (sm) sm.checked = !!settings.smoothing;

  const st = document.getElementById('setStabilizer');
  if (st) st.value = String(settings.stabilizer);
  const stv = document.getElementById('setStabilizerVal');
  if (stv) stv.textContent = `${settings.stabilizer}%`;

  const as = document.getElementById('setAutosave');
  if (as) as.checked = !!settings.autosave;

  const iv = document.getElementById('setInterval');
  if (iv) iv.value = String(settings.autosaveInterval);
  const ivv = document.getElementById('setIntervalVal');
  if (ivv) ivv.textContent = `${settings.autosaveInterval} сек`;

  const bp = document.getElementById('setBounds');
  if (bp) bp.value = String(settings.boundsPadding);
  const bpv = document.getElementById('setBoundsVal');
  if (bpv) bpv.textContent = `${settings.boundsPadding} px`;

  const rt = document.getElementById('setRestoreTabs');
  if (rt) rt.checked = !!settings.restoreTabs;

  const ctd = document.getElementById('setConfirmTabDelete');
  if (ctd) ctd.checked = settings.askBeforeDeleteTab !== false;

  const csd = document.getElementById('setConfirmSheetDelete');
  if (csd) csd.checked = settings.askBeforeDeleteSheet !== false;

  const cpd = document.getElementById('setConfirmPresetDelete');
  if (cpd) cpd.checked = settings.askBeforeDeletePreset !== false;

  const wn = document.getElementById('setWarnName');
  if (wn) wn.checked = settings.warnOccupiedName !== false;

  const hint = document.getElementById('setFolderHint');
  const defaultFolder = settings.saveFolder || settings.projectsPath;
  if (hint) hint.textContent = defaultFolder || 'Папка не выбрана';
  if (hint) hint.title = defaultFolder || '';

  const ver = document.getElementById('aboutVersion');
  if (ver) ver.textContent = '1.0.0';
}

export function openSettingsModal() {
  // Окно настроек (оверлей .settings-overlay) — открывается по кнопке-шестерёнке.
  const modal = document.getElementById('settingsOverlay');
  if (!modal) return;
  syncSettingsUI();
  modal.hidden = false;
}

export function closeSettingsModal() {
  const modal = document.getElementById('settingsOverlay');
  if (modal) modal.hidden = true;
}

let bound = false;

export function initSettingsUI() {
  if (bound) return;
  bound = true;

  if (typeof window !== 'undefined' && window.matchMedia) {
    systemMedia = window.matchMedia('(prefers-color-scheme: dark)');
    systemMedia.addEventListener('change', () => {
      if (settings.theme === 'system') apply();
    });
  }

  const modal = document.getElementById('settingsOverlay');
  if (!modal) return;

  modal.addEventListener('click', (e) => {
    const urlBtn = e.target.closest('[data-url]');
    if (urlBtn) {
      if (urlBtn.dataset.url) window.gusketch.openExternal(urlBtn.dataset.url);
      return;
    }
    if (e.target.closest('[data-close]')) {
      closeSettingsModal();
      return;
    }
    // Клик по фону оверлея (вне окна настроек) — закрыть.
    // Клики внутри .settings-header / .settings-body не закрывают окно.
    if (e.target === modal) closeSettingsModal();
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && modal && !modal.hidden) closeSettingsModal();
  });

  const themeSeg = document.getElementById('setTheme');
  if (themeSeg) {
    themeSeg.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg__btn');
      if (!btn) return;
      setTheme(btn.dataset.value);
    });
  }

  const langSeg = document.getElementById('setLang');
  if (langSeg) {
    langSeg.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg__btn');
      if (!btn) return;
      settings.lang = btn.dataset.value;
      setLang(resolveLang(settings.lang));
      applyLang();
      save();
      syncSettingsUI();
    });
  }

  const uiScaleRange = document.getElementById('uiScaleRange');
  const uiScaleRangeVal = document.getElementById('uiScaleRangeVal');
  if (uiScaleRange) {
    const updateUiScaleLabel = () => {
      if (uiScaleRangeVal) uiScaleRangeVal.textContent = `${uiScaleRange.value}%`;
      updateRangeProgress(uiScaleRange);
    };

    // Во время перетаскивания — только цифра, без изменения масштаба.
    uiScaleRange.addEventListener('input', updateUiScaleLabel);

    // После отпускания бегунка — применить масштаб и сохранить.
    uiScaleRange.addEventListener('change', () => {
      settings.uiScale = Number(uiScaleRange.value) / 100;
      updateUiScaleLabel();
      apply();
      save();
    });
  }

  const accent = document.getElementById('setAccentBtn');
  if (accent) {
    accent.addEventListener('click', async () => {
      const color = await openColorPicker({
        value: settings.accent || '#ff4d30',
        alpha: false,
        title: 'Цвет акцента',
      });
      if (!color) return;
      settings.accent = color;
      apply();
      save();
      syncSettingsUI();
    });
  }

  const dw = document.getElementById('setDefWidth');
  if (dw) {
    dw.addEventListener('input', () => {
      settings.defaultWidth = Number(dw.value);
      const out = document.getElementById('setDefWidthVal');
      if (out) out.textContent = `${settings.defaultWidth} px`;
      save();
      emit('settings-changed', settings);
    });
  }

  const dc = document.getElementById('setDefColorBtn');
  if (dc) {
    dc.addEventListener('click', async () => {
      const color = await openColorPicker({
        value: settings.defaultColor || app.ink || '#f0f0f0',
        alpha: false,
        title: 'Цвет кисти по умолчанию',
      });
      if (!color) return;
      settings.defaultColor = color;
      save();
      syncSettingsUI();
      emit('settings-changed', settings);
    });
  }

  const gcd = document.getElementById('setGridColorBtn');
  if (gcd) {
    gcd.addEventListener('click', async () => {
      const color = await openColorPicker({
        value: settings.gridColor || '#888888',
        alpha: true,
        title: 'Цвет сетки',
      });
      if (!color) return;
      settings.gridColor = color;
      save();
      syncSettingsUI();
      emit('settings-changed', settings);
    });
  }

  const gcr = document.getElementById('setGridColorReset');
  if (gcr) {
    gcr.addEventListener('click', () => {
      settings.gridColor = '';
      save();
      syncSettingsUI();
      emit('settings-changed', settings);
    });
  }

  const sm = document.getElementById('setSmoothing');
  if (sm) {
    sm.addEventListener('change', () => {
      settings.smoothing = sm.checked;
      save();
      emit('settings-changed', settings);
    });
  }

  const st = document.getElementById('setStabilizer');
  if (st) {
    st.addEventListener('input', () => {
      settings.stabilizer = Number(st.value);
      const out = document.getElementById('setStabilizerVal');
      if (out) out.textContent = `${settings.stabilizer}%`;
      save();
    });
  }

  const as = document.getElementById('setAutosave');
  if (as) {
    as.addEventListener('change', () => {
      settings.autosave = as.checked;
      save();
      emit('settings-changed', settings);
    });
  }

  const iv = document.getElementById('setInterval');
  if (iv) {
    iv.addEventListener('input', () => {
      settings.autosaveInterval = Number(iv.value);
      const out = document.getElementById('setIntervalVal');
      if (out) out.textContent = `${settings.autosaveInterval} сек`;
      save();
      emit('settings-changed', settings);
    });
  }

  const bp = document.getElementById('setBounds');
  if (bp) {
    bp.addEventListener('input', () => {
      settings.boundsPadding = Number(bp.value);
      const out = document.getElementById('setBoundsVal');
      if (out) out.textContent = `${settings.boundsPadding} px`;
      save();
      emit('settings-changed', settings);
    });
  }

  const rt = document.getElementById('setRestoreTabs');
  if (rt) {
    rt.addEventListener('change', () => {
      settings.restoreTabs = rt.checked;
      save();
    });
  }

  const bindToggle = (id, key) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        settings[key] = el.checked;
        save();
      });
    }
  };
  bindToggle('setConfirmTabDelete', 'askBeforeDeleteTab');
  bindToggle('setConfirmSheetDelete', 'askBeforeDeleteSheet');
  bindToggle('setConfirmPresetDelete', 'askBeforeDeletePreset');
  bindToggle('setWarnName', 'warnOccupiedName');

  const closeBehaviorDropdown = document.getElementById('setCloseBehavior');
  if (closeBehaviorDropdown) {
    const trigger = closeBehaviorDropdown.querySelector('.set-dropdown__trigger');
    const menu = closeBehaviorDropdown.querySelector('.set-dropdown__menu');

    const choose = (value) => {
      if (!CLOSE_BEHAVIOR_VALUES.includes(value)) return;
      settings.closeBehavior = value;
      save();
      try {
        window.gusketch.setCloseBehavior(settings.closeBehavior);
      } catch (_) {
        /* noop */
      }
      syncCloseBehaviorDropdown(closeBehaviorDropdown, value);
      closeCloseBehaviorDropdown(closeBehaviorDropdown);
    };

    if (trigger && menu) {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = menu.hidden;
        menu.hidden = !open;
        closeBehaviorDropdown.classList.toggle('is-open', open);
        trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      });

      menu.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = e.target.closest('.set-dropdown__item');
        if (!item) return;
        choose(item.dataset.value);
      });

      closeBehaviorDropdown.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !menu.hidden) {
          closeCloseBehaviorDropdown(closeBehaviorDropdown);
          trigger.focus();
        }
      });

      document.addEventListener('click', (e) => {
        if (!closeBehaviorDropdown.contains(e.target)) {
          closeCloseBehaviorDropdown(closeBehaviorDropdown);
        }
      });
    }
  }

  const defaultFolderBtn = document.getElementById('setDefaultFolderBtn');
  if (defaultFolderBtn) {
    defaultFolderBtn.addEventListener('click', async () => {
      try {
        const res = await window.gusketch.chooseDirectory(
          settings.saveFolder || settings.projectsPath || undefined
        );
        if (res && !res.canceled && res.dirPath) {
          settings.saveFolder = res.dirPath;
          save();
          syncSettingsUI();
        }
      } catch (_) {
        /* noop */
      }
    });
  }
}

/* Текущий цвет кисти по умолчанию (с учётом темы). */
export function currentInk() {
  return settings.defaultColor || app.ink || inkColor();
}
