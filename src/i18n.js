'use strict';

/* ==========================================================================
   GUSketch — интернационализация (i18n).
   Поддерживаемые языки: ru, en. Режим 'auto' определяет по navigator.language.
   ========================================================================== */

export const I18N = {
  ru: {
    // Общие
    appName: 'GUSketch',
    save: 'Сохранить',
    cancel: 'Отмена',
    delete: 'Удалить',
    close: 'Закрыть',
    ok: 'OK',
    apply: 'Применить',
    done: 'Готово',
    collapse: 'Свернуть',
    expand: 'Развернуть',
    pin: 'Закрепить',
    unpin: 'Открепить',
    rename: 'Переименовать',
    duplicate: 'Дублировать',
    copy: 'Копировать',
    cut: 'Вырезать',
    paste: 'Вставить',
    selectAll: 'Выделить всё',
    undo: 'Отменить',
    redo: 'Повторить',
    confirm: 'Подтвердить',
    yes: 'Да',
    no: 'Нет',
    loading: 'Загрузка...',
    error: 'Ошибка',
    success: 'Успешно',

    // Статусы
    statusSaved: 'Сохранено',
    statusModified: 'Есть изменения',
    statusEmpty: 'Пустая тема',
    statusSaving: 'Сохранение…',
    autoSaved: 'Автосохранено',

    // Тултипы для кнопок истории
    toolUndo: 'Отменить',
    toolRedo: 'Повторить',
    keyUndo: 'Ctrl+Z',
    keyRedo: 'Ctrl+Shift+Z',

    // Тултипы инструментов
    toolBrush: 'Ручка',
    toolMarker: 'Маркер',
    toolEraser: 'Стереть',
    toolMove: 'Переместить',
    toolShape: 'Фигуры',
    toolArrow: 'Стрелка',
    toolLine: 'Линия',
    toolText: 'Текст',
    toolLasso: 'Лассо',
    toolHand: 'Рука',

    // Горячие клавиши (для тултипов)
    keyBrush: 'B',
    keyMarker: 'M',
    keyEraser: 'E',
    keyMove: 'V',
    keyShape: 'S',
    keyArrow: 'A',
    keyLine: 'L',
    keyText: 'T',
    keyLasso: 'Q',
    keyHand: 'H',

    // Прочее UI
    themeDark: 'Тёмная тема',
    themeLight: 'Светлая тема',
    gridTitle: 'Сетка',
    keyGrid: 'G',
    toolImage: 'Загрузить фото',
    settingTitle: 'Настройки',
    menuNewTab: 'Новая вкладка',
    keyNewTab: 'Ctrl+T',
    menuNewSheet: 'Новый лист',

    // Панель параметров - заголовки инструментов
    paramBrush: 'РУЧКА',
    paramMarker: 'МАРКЕР',
    paramEraser: 'СТЕРЕТЬ',
    paramShape: 'ФИГУРЫ',
    paramText: 'ТЕКСТ',
    paramLine: 'ЛИНИЯ',
    paramArrow: 'СТРЕЛКА',

    // Панель параметров - подписи
    paramColor: 'Цвет',
    paramWidth: 'Толщина',
    paramOpacity: 'Прозрачность',
    paramSize: 'Размер',
    paramFont: 'Шрифт',
    paramFill: 'Заливка',
    paramStroke: 'Обводка',
    paramStrokeOpacity: 'Прозрачность обводки',
    paramStrokeWidth: 'Толщина обводки',
    paramFillOpacity: 'Прозрачность заливки',
    paramFillColor: 'Цвет заливки',
    paramStrokeColor: 'Цвет обводки',
    paramEnabled: 'Вкл',
    paramDisabled: 'Выкл',
    paramMode: 'Режим',
    paramModeObject: 'Объектный',
    paramModeHole: 'Дырявый',

    // Кнопки панели параметров
    btnDone: 'Готово',
    btnCollapse: 'Свернуть',
    btnExpand: 'Развернуть',
    btnDelete: 'Удалить',
    btnFront: 'На передний',
    btnBack: 'На задний',
    btnPin: 'Закрепить',
    btnApply: 'Применить',

    // Подсказки (hints)
    hintEraserHole: 'Ластик выгрызает часть объекта. Отверстия двигаются вместе с объектом.',
    hintEraserObject: 'Ластик удаляет объект целиком при касании.',
    hintMove: 'Тяните мышью, чтобы выделить рамкой. Перетаскивайте объекты и маркеры.',
    hintLasso: 'Обведите объекты произвольным контуром.',
    hintHand: 'Тяните холст, чтобы перемещать вид.',

    // Настройки - разделы
    settingsTitle: 'Настройки',
    settingsAppearance: 'Внешний вид',
    settingsDrawing: 'Рисование',
    settingsFiles: 'Файлы',
    settingsBehavior: 'Поведение',
    settingsCanvas: 'Холст',
    settingsAbout: 'О программе',
    settingsAboutDevs: 'О разработчиках',

    // Настройки - внешний вид
    settingTheme: 'Тема',
    themeDark: 'Тёмная',
    themeLight: 'Светлая',
    themeSystem: 'Системная',
    settingUIScale: 'Масштаб интерфейса',
    settingAccentColor: 'Цвет акцента',
    settingDefaultWidth: 'Толщина кисти по умолчанию',
    settingDefaultColor: 'Цвет кисти по умолчанию',
    settingSmoothing: 'Сглаживание штрихов',
    settingStabilizer: 'Стабилизация пера',
    settingBoundsPadding: 'Отступ границы холста',
    settingGridColor: 'Цвет сетки',
    settingGridColorReset: 'Тема',

    // Настройки - файлы
    settingAutosave: 'Автосохранение',
    settingAutosaveInterval: 'Интервал автосохранения',
    settingDefaultFolder: 'Папка по умолчанию',
    settingChooseFolder: 'Выбрать…',
    settingFolderNotSelected: 'Папка не выбрана',

    // Настройки - поведение
    settingRestoreTabs: 'Восстанавливать вкладки при запуске',
    settingConfirmTabDelete: 'Подтверждать удаление раздела',
    settingConfirmSheetDelete: 'Подтверждать удаление листа',
    settingConfirmPresetDelete: 'Подтверждать удаление плитки',
    settingWarnOccupiedName: 'Предупреждать о занятом имени',
    settingCloseBehavior: 'Что делать при нажатии на крестик',
    closeBehaviorQuit: 'Закрыть программу',
    closeBehaviorTray: 'Свернуть в трей',
    closeBehaviorNothing: 'Ничего не делать',

    // Настройки - о программе
    settingVersion: 'Версия',

    // О разработчиках
    aboutTeamTitle: 'О нашей команде',
    aboutTeamSubtitle: 'Кто мы такие',
    aboutTeamText: 'Мы — программисты, дизайнеры и другие IT-специалисты, работающие на общее благо нашей команды. Вместе мы создаём востребованные цифровые продукты, которыми хочется пользоваться каждый день.',
    aboutTeamCTA: 'Подробнее о Great User Team',
    aboutFeatureCustomization: 'Кастомизация',
    aboutFeatureCustomizationDesc: 'Пользователь сам выбирает тот интерфейс, который ему по душе, а не тот, который решила сделать корпорация.',
    aboutFeatureOptimization: 'Оптимизация',
    aboutFeatureOptimizationDesc: 'Безупречная работа, без лагов и задержек.',
    aboutFeatureFreedom: 'Свобода',
    aboutFeatureFreedomDesc: 'Никакой слежки и сбора данных. Все наши продукты абсолютно бесплатны и с открытым кодом.',
    aboutResourcesTitle: 'Ресурсы GUTeam:',
    aboutResourceSite: 'Сайт',
    aboutResourceTGChannel: 'TG-канал',
    aboutResourceTGForum: 'TG-форум',
    aboutResourceGitHub: 'GitHub',
    aboutAllProducts: 'Все продукты GUT',

    // Вкладки
    tabUntitled: 'Без имени',
    sheetUntitled: 'Лист',
    tabClose: 'Закрыть вкладку',
    sheetClose: 'Удалить лист',

    // Диалоги подтверждения
    confirmDeleteTabTitle: 'Удаление раздела',
    confirmDeleteTabMsg: 'Удалить раздел «{name}»? Вместе с ним будут удалены все подвкладки (листы). Действие нельзя отменить.',
    confirmDeleteSheetTitle: 'Удаление листа',
    confirmDeleteSheetMsg: 'Удалить лист «{name}»? Это действие нельзя отменить.',
    confirmDeletePresetTitle: 'Удалить плитку?',
    confirmDeletePresetMsg: 'Плитка-пресет будет удалена.',
    confirmCloseUnsavedTitle: 'Несохранённые изменения',
    confirmCloseUnsavedMsg: 'Сохранить изменения перед выходом?',
    confirmRenameOccupiedTitle: 'Имя занято',
    confirmRenameOccupiedMsg: 'Раздел с таким именем уже существует.',

    // Уведомления/тосты
    toastSaved: 'Сохранено',
    toastHasChanges: 'Есть изменения',
    toastEmptyCanvas: 'Пустая тема',
    toastNameOccupied: 'Имя уже занято',
    toastRenameFailed: 'Не удалось переименовать',
    toastExportPNG: 'PNG экспортирован',
    toastExportPDF: 'PDF экспортирован',
    toastCopyImage: 'Скопировано в буфер обмена',
    toastPasteImage: 'Фото добавлено',
    toastCopied: 'Скопировано: {count}',
    toastCut: 'Вырезано: {count}',
    toastPasted: 'Вставлено: {count}',
    toastDuplicated: 'Дублировано: {count}',
    toastDeleted: 'Удалено',
    toastTabAdded: 'Добавлено разделов: {count}',
    toastSettingsSaved: 'Настройки сохранены',

    // Меню (нативное Electron)
    menuFile: 'Файл',
    menuEdit: 'Правка',
    menuView: 'Вид',
    menuHelp: 'Помощь',
    menuNewTab: 'Новый',
    menuNewSheet: 'Новый лист',
    menuNextSheet: 'Следующий лист',
    menuPrevSheet: 'Предыдущий лист',
    menuSave: 'Сохранить',
    menuSaveAll: 'Сохранить всё',
    menuExport: 'Экспорт',
    menuExportPNG: 'В PNG…',
    menuExportPDF: 'В PDF…',
    menuExportPDFAll: 'Все вкладки в PDF…',
    menuCopyImage: 'Копировать как изображение',
    menuCloseTab: 'Удалить текущую вкладку',
    menuQuit: 'Выход',
    menuUndo: 'Отменить',
    menuRedo: 'Повторить',
    menuCut: 'Вырезать',
    menuCopy: 'Копировать',
    menuPaste: 'Вставить',
    menuDuplicate: 'Дублировать',
    menuDelete: 'Удалить',
    menuSelectAll: 'Выделить всё',
    menuThemeDark: 'Тёмная тема',
    menuThemeLight: 'Светлая тема',
    menuFullscreen: 'Полный экран',
    menuZoomReset: 'Масштаб 100%',
    menuZoomIn: 'Увеличить',
    menuZoomOut: 'Уменьшить',
    menuAbout: 'О программе GUSketch',
    menuWebsite: 'guteam.net',
    menuGitHub: 'GitHub',
    menuTelegram: 'Telegram',
    menuForum: 'Форум',

    // Экспорт
    exportBackground: 'Фон изображения',
    exportBgTransparent: 'Прозрачный',
    exportBgWhite: 'Белый',

    // Сетка
    gridNone: 'Нет',
    gridSquares: 'Клетка',
    gridLines: 'Линейка',
    gridDots: 'Точки',
    gridSize: 'Размер',

    // Фигуры
    shapeSquare: 'Квадрат',
    shapeRect: 'Прямоугольник',
    shapeTrapezoid: 'Трапеция',
    shapeRightTrapezoid: 'Прямоугольная трапеция',
    shapeCircle: 'Круг',
    shapeRing: 'Окружность',
    shapeRhombus: 'Ромб',
    shapeParallelogram: 'Параллелограмм',
    shapeTriangleEquilateral: 'Равносторонний треугольник',
    shapeTriangleRight: 'Прямоугольный треугольник',
    shapeTriangle: 'Треугольник',

    // Языки
    langAuto: 'Авто',
    langRU: 'RU',
    langEN: 'EN',
    settingLanguage: 'Язык интерфейса',
  },

  en: {
    // General
    appName: 'GUSketch',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    close: 'Close',
    ok: 'OK',
    apply: 'Apply',
    done: 'Done',
    collapse: 'Collapse',
    expand: 'Expand',
    pin: 'Pin',
    unpin: 'Unpin',
    rename: 'Rename',
    duplicate: 'Duplicate',
    copy: 'Copy',
    cut: 'Cut',
    paste: 'Paste',
    selectAll: 'Select All',
    undo: 'Undo',
    redo: 'Redo',
    confirm: 'Confirm',
    yes: 'Yes',
    no: 'No',
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',

    // Statuses
    statusSaved: 'Saved',
    statusModified: 'Has changes',
    statusEmpty: 'Empty canvas',
    statusSaving: 'Saving…',
    autoSaved: 'Auto-saved',

    // Tool tooltips for history buttons
    toolUndo: 'Undo',
    toolRedo: 'Redo',
    keyUndo: 'Ctrl+Z',
    keyRedo: 'Ctrl+Shift+Z',

    // Tool tooltips
    toolBrush: 'Brush',
    toolMarker: 'Marker',
    toolEraser: 'Erase',
    toolMove: 'Move',
    toolShape: 'Shapes',
    toolArrow: 'Arrow',
    toolLine: 'Line',
    toolText: 'Text',
    toolLasso: 'Lasso',
    toolHand: 'Hand',

    // Hotkeys (for tooltips)
    keyBrush: 'B',
    keyMarker: 'M',
    keyEraser: 'E',
    keyMove: 'V',
    keyShape: 'S',
    keyArrow: 'A',
    keyLine: 'L',
    keyText: 'T',
    keyLasso: 'Q',
    keyHand: 'H',

    // Other UI
    themeDark: 'Dark Theme',
    themeLight: 'Light Theme',
    gridTitle: 'Grid',
    keyGrid: 'G',
    toolImage: 'Load Image',
    settingTitle: 'Settings',
    menuNewTab: 'New Tab',
    keyNewTab: 'Ctrl+T',
    menuNewSheet: 'New Sheet',

    // Parameter panel - tool titles
    paramBrush: 'BRUSH',
    paramMarker: 'MARKER',
    paramEraser: 'ERASER',
    paramShape: 'SHAPES',
    paramText: 'TEXT',
    paramLine: 'LINE',
    paramArrow: 'ARROW',

    // Parameter panel - labels
    paramColor: 'Color',
    paramWidth: 'Width',
    paramOpacity: 'Opacity',
    paramSize: 'Size',
    paramFont: 'Font',
    paramFill: 'Fill',
    paramStroke: 'Stroke',
    paramStrokeOpacity: 'Stroke Opacity',
    paramStrokeWidth: 'Stroke Width',
    paramFillOpacity: 'Fill Opacity',
    paramFillColor: 'Fill Color',
    paramStrokeColor: 'Stroke Color',
    paramEnabled: 'On',
    paramDisabled: 'Off',
    paramMode: 'Mode',
    paramModeObject: 'Object',
    paramModeHole: 'Hole',

    // Parameter panel buttons
    btnDone: 'Done',
    btnCollapse: 'Collapse',
    btnExpand: 'Expand',
    btnDelete: 'Delete',
    btnFront: 'Bring to Front',
    btnBack: 'Send to Back',
    btnPin: 'Pin',
    btnApply: 'Apply',

    // Hints
    hintEraserHole: 'Eraser cuts out part of the object. Holes move with the object.',
    hintEraserObject: 'Eraser deletes the entire object on contact.',
    hintMove: 'Drag to select with a marquee. Drag objects and handles.',
    hintLasso: 'Draw a freeform selection around objects.',
    hintHand: 'Drag the canvas to pan the view.',

    // Settings - sections
    settingsTitle: 'Settings',
    settingsAppearance: 'Appearance',
    settingsDrawing: 'Drawing',
    settingsFiles: 'Files',
    settingsBehavior: 'Behavior',
    settingsCanvas: 'Canvas',
    settingsAbout: 'About',
    settingsAboutDevs: 'About Developers',

    // Settings - appearance
    settingTheme: 'Theme',
    themeDark: 'Dark',
    themeLight: 'Light',
    themeSystem: 'System',
    settingUIScale: 'UI Scale',
    settingAccentColor: 'Accent Color',
    settingDefaultWidth: 'Default Brush Width',
    settingDefaultColor: 'Default Brush Color',
    settingSmoothing: 'Stroke Smoothing',
    settingStabilizer: 'Pen Stabilizer',
    settingBoundsPadding: 'Canvas Bounds Padding',
    settingGridColor: 'Grid Color',
    settingGridColorReset: 'Theme',

    // Settings - files
    settingAutosave: 'Autosave',
    settingAutosaveInterval: 'Autosave Interval',
    settingDefaultFolder: 'Default Folder',
    settingChooseFolder: 'Choose…',
    settingFolderNotSelected: 'No folder selected',

    // Settings - behavior
    settingRestoreTabs: 'Restore tabs on startup',
    settingConfirmTabDelete: 'Confirm tab deletion',
    settingConfirmSheetDelete: 'Confirm sheet deletion',
    settingConfirmPresetDelete: 'Confirm preset deletion',
    settingWarnOccupiedName: 'Warn about occupied name',
    settingCloseBehavior: 'When closing the window',
    closeBehaviorQuit: 'Quit the app',
    closeBehaviorTray: 'Minimize to tray',
    closeBehaviorNothing: 'Do nothing',

    // Settings - about
    settingVersion: 'Version',

    // About developers
    aboutTeamTitle: 'About Our Team',
    aboutTeamSubtitle: 'Who we are',
    aboutTeamText: 'We are programmers, designers, and other IT specialists working for the common good of our team. Together we create in-demand digital products that you want to use every day.',
    aboutTeamCTA: 'More about Great User Team',
    aboutFeatureCustomization: 'Customization',
    aboutFeatureCustomizationDesc: 'The user chooses the interface they like, not the one a corporation decided to make.',
    aboutFeatureOptimization: 'Optimization',
    aboutFeatureOptimizationDesc: 'Flawless performance, no lags or delays.',
    aboutFeatureFreedom: 'Freedom',
    aboutFeatureFreedomDesc: 'No tracking or data collection. All our products are completely free and open source.',
    aboutResourcesTitle: 'GUTeam Resources:',
    aboutResourceSite: 'Website',
    aboutResourceTGChannel: 'TG Channel',
    aboutResourceTGForum: 'TG Forum',
    aboutResourceGitHub: 'GitHub',
    aboutAllProducts: 'All GUT Products',

    // Tabs
    tabUntitled: 'Untitled',
    sheetUntitled: 'Sheet',
    tabClose: 'Close tab',
    sheetClose: 'Delete sheet',

    // Confirmation dialogs
    confirmDeleteTabTitle: 'Delete Tab',
    confirmDeleteTabMsg: 'Delete tab "{name}"? All sheets will be deleted. This cannot be undone.',
    confirmDeleteSheetTitle: 'Delete Sheet',
    confirmDeleteSheetMsg: 'Delete sheet "{name}"? This cannot be undone.',
    confirmDeletePresetTitle: 'Delete Preset?',
    confirmDeletePresetMsg: 'The preset tile will be deleted.',
    confirmCloseUnsavedTitle: 'Unsaved Changes',
    confirmCloseUnsavedMsg: 'Save changes before closing?',
    confirmRenameOccupiedTitle: 'Name Taken',
    confirmRenameOccupiedMsg: 'A tab with this name already exists.',

    // Notifications/toasts
    toastSaved: 'Saved',
    toastHasChanges: 'Has changes',
    toastEmptyCanvas: 'Empty canvas',
    toastNameOccupied: 'Name already taken',
    toastRenameFailed: 'Failed to rename',
    toastExportPNG: 'PNG exported',
    toastExportPDF: 'PDF exported',
    toastCopyImage: 'Copied to clipboard',
    toastPasteImage: 'Photo added',
    toastCopied: 'Copied: {count}',
    toastCut: 'Cut: {count}',
    toastPasted: 'Pasted: {count}',
    toastDuplicated: 'Duplicated: {count}',
    toastDeleted: 'Deleted',
    toastTabAdded: 'Added tabs: {count}',
    toastSettingsSaved: 'Settings saved',

    // Menu (native Electron)
    menuFile: 'File',
    menuEdit: 'Edit',
    menuView: 'View',
    menuHelp: 'Help',
    menuNewTab: 'New',
    menuNewSheet: 'New Sheet',
    menuNextSheet: 'Next Sheet',
    menuPrevSheet: 'Previous Sheet',
    menuSave: 'Save',
    menuSaveAll: 'Save All',
    menuExport: 'Export',
    menuExportPNG: 'As PNG…',
    menuExportPDF: 'As PDF…',
    menuExportPDFAll: 'All Tabs to PDF…',
    menuCopyImage: 'Copy as Image',
    menuCloseTab: 'Close Current Tab',
    menuQuit: 'Quit',
    menuUndo: 'Undo',
    menuRedo: 'Redo',
    menuCut: 'Cut',
    menuCopy: 'Copy',
    menuPaste: 'Paste',
    menuDuplicate: 'Duplicate',
    menuDelete: 'Delete',
    menuSelectAll: 'Select All',
    menuThemeDark: 'Dark Theme',
    menuThemeLight: 'Light Theme',
    menuFullscreen: 'Fullscreen',
    menuZoomReset: 'Zoom 100%',
    menuZoomIn: 'Zoom In',
    menuZoomOut: 'Zoom Out',
    menuAbout: 'About GUSketch',
    menuWebsite: 'guteam.net',
    menuGitHub: 'GitHub',
    menuTelegram: 'Telegram',
    menuForum: 'Forum',

    // Export
    exportBackground: 'Image Background',
    exportBgTransparent: 'Transparent',
    exportBgWhite: 'White',

    // Grid
    gridNone: 'None',
    gridSquares: 'Squares',
    gridLines: 'Lines',
    gridDots: 'Dots',
    gridSize: 'Size',

    // Shapes
    shapeSquare: 'Square',
    shapeRect: 'Rectangle',
    shapeTrapezoid: 'Trapezoid',
    shapeRightTrapezoid: 'Right Trapezoid',
    shapeCircle: 'Circle',
    shapeRing: 'Ring',
    shapeRhombus: 'Rhombus',
    shapeParallelogram: 'Parallelogram',
    shapeTriangleEquilateral: 'Equilateral Triangle',
    shapeTriangleRight: 'Right Triangle',
    shapeTriangle: 'Triangle',

    // Languages
    langAuto: 'Auto',
    langRU: 'RU',
    langEN: 'EN',
    settingLanguage: 'Interface Language',
  },
};

let currentLang = 'ru';

/** Получить текущий язык. */
export function getLang() {
  return currentLang;
}

/** Установить язык ('ru' | 'en'). */
export function setLang(lang) {
  if (lang === 'ru' || lang === 'en') {
    currentLang = lang;
  }
}

/** Разрешить язык из настройки ('auto' | 'ru' | 'en'). */
export function resolveLang(setting) {
  if (setting === 'auto' || !setting) {
    const navLang = (navigator.language || 'en').toLowerCase();
    if (navLang.startsWith('ru') || navLang.startsWith('be') || navLang.startsWith('kk') || navLang.startsWith('uk')) {
      return 'ru';
    }
    return 'en';
  }
  return setting;
}

/** Функция перевода. Принимает ключ и опциональные параметры для интерполяции. */
export function t(key, params = {}) {
  const dict = I18N[currentLang] || I18N.ru;
  let str = dict[key] || key;
  // Простая интерполяция {key}
  for (const [k, v] of Object.entries(params)) {
    str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return str;
}

/** Применить язык ко всем элементам с data-i18n атрибутом. */
export function applyLang() {
  document.documentElement.lang = currentLang;
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const key = el.dataset.i18n;
    const params = el.dataset.i18nParams ? JSON.parse(el.dataset.i18nParams) : {};
    const translation = t(key, params);
    if (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit' || el.type === 'reset')) {
      el.value = translation;
    } else if (el.tagName === 'INPUT' && el.type === 'text') {
      el.placeholder = translation;
    } else if (el.tagName === 'OPTION') {
      el.textContent = translation;
    } else {
      el.textContent = translation;
    }
  }
  // title attributes
  for (const el of document.querySelectorAll('[data-i18n-title]')) {
    const key = el.dataset.i18nTitle;
    el.title = t(key);
  }
  // aria-label attributes
  for (const el of document.querySelectorAll('[data-i18n-aria]')) {
    const key = el.dataset.i18nAria;
    el.setAttribute('aria-label', t(key));
  }
  // data-tip attributes (tooltips)
  for (const el of document.querySelectorAll('[data-i18n-tip]')) {
    const key = el.dataset.i18nTip;
    el.dataset.tip = t(key);
  }
  // data-key attributes (hotkey hints)
  for (const el of document.querySelectorAll('[data-i18n-key]')) {
    const key = el.dataset.i18nKey;
    el.dataset.key = t(key);
  }
}

/** Инициализировать i18n при старте. */
export function initI18n() {
  const saved = localStorage.getItem('gusketch:lang') || 'auto';
  const resolved = resolveLang(saved);
  setLang(resolved);
  applyLang();
}