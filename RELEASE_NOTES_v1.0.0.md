# GUSketch 1.0.0 — Рисование, заметки и доски / Drawing, Notes and Boards

GUSketch — десктопное приложение для рисования, заметок и визуального планирования. Оно соединяет свободный холст в духе Figma с разделами и листами в духе OneNote и работает полностью локально. / GUSketch is a desktop app for drawing, notes and visual planning. It combines a free Figma-like canvas with OneNote-style sections and sheets, and works fully offline.

Первый публичный релиз: холст, инструменты рисования, формат `.gusketch`, автосохранение и экспорт. / First public release: canvas, drawing tools, the `.gusketch` format, autosave and export.

## Linux / Linux
- **Файлы / Files**: GUSketch_1.0.0_amd64.AppImage, GUSketch_1.0.0_amd64.deb, GUSketch-1.0.0-1.x86_64.rpm
- **Что нового / What's new**: свободный холст, кисть и маркер с давлением пера, фигуры, текст, лассо, изображения, разделы и листы, автосохранение, экспорт PNG/PDF / free canvas, pressure-sensitive brush and marker, shapes, text, lasso, images, sections and sheets, autosave, PNG/PDF export
- **Требования / Requirements**: x86_64, Wayland или X11 / x86_64, Wayland or X11

## Windows / Windows
- **Файлы / Files**: в этом релизе нет / no builds in this release
- **Статус / Status**: конфигурация NSIS и portable готова, бинарная сборка появится в следующих релизах / NSIS and portable configuration is ready, binary builds will appear in future releases
- **Требования / Requirements**: Windows 10/11 x64 / Windows 10/11 x64

## Возможности / Features
- **Холст / Canvas**: зум 10–800%, панорамирование, сетка, тёмная и светлая темы / 10–800% zoom, panning, grid, dark and light themes.
- **Инструменты / Tools**: кисть, маркер, ластик, прямоугольник, круг, линия, стрелка, текст, лассо, рука / brush, marker, eraser, rectangle, circle, line, arrow, text, lasso, hand.
- **Организация / Organization**: вкладки-проекты и листы внутри каждого проекта / project tabs and sheets inside each project.
- **Файлы / Files**: формат `.gusketch` на основе ZIP, изображения внутри архива, превью и метаданные / ZIP-based `.gusketch` format with embedded images, preview and metadata.
- **Экспорт / Export**: PNG с прозрачным или белым фоном, PDF листа и PDF всех листов / PNG with transparent or white background, single-sheet and all-sheets PDF.
- **Автосохранение / Autosave**: каждые 5 секунд по умолчанию, наблюдение за системной папкой проектов / every 5 seconds by default, system projects folder watching.
- **Локальность / Local-first**: без аккаунта, облака и телеметрии / no account, cloud or telemetry.

## Формат .gusketch / .gusketch format
ZIP-архив с `document.json`, `meta.json`, `preview.png` и папкой `images/`. Один файл хранит все листы проекта. / ZIP archive with `document.json`, `meta.json`, `preview.png` and the `images/` folder. One file stores every sheet of the project.

## Ссылки / Links
- **Страница проекта / Project page**: https://projects.guteam.net/gusketch
- **Документация / Documentation**: https://doc.guteam.net/gusketch
- **Сайт команды / Team website**: https://guteam.net
- **GitHub**: https://github.com/GreatUserTeam/gusketch
- **Лицензия / License**: MIT

## Исходный код / Source code
Исходный код доступен в этом репозитории. Инструкции по сборке — в [README](README.md). / Source code is available in this repository. Build instructions are in [README](README.md).
