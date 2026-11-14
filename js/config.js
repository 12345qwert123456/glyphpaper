/* Glyph Pond — общие константы сцены.
 * Параметры конкретных существ (палитра, число, скорости) лежат в начале
 * файлов js/creatures/*.js. */
(function (GP) {
  'use strict';

  GP.config = {
    // --- сетка ---
    CELL: 9,              // размер ячейки по умолчанию, CSS px
    CELL_MIN: 6,
    CELL_MAX: 14,
    DPR_MAX: 2,           // ограничение devicePixelRatio
    SUPERSAMPLE: 3,       // покрытие ячейки считается по сетке 3×3

    // --- фон ---
    BG: '#0b0d13',        // почти чёрный с синим оттенком
    GRID_RGB: [150, 170, 220],
    GRID_ALPHA_BASE: 0.012, // сетка вдали от существ почти растворяется
    GRID_ALPHA_NEAR: 0.05,  // сетка рядом с существом
    HALO_CELLS: 7,          // на сколько ячеек сетка «подсвечивается» вокруг

    // --- глифы ---
    RAMP: '.:-=+*#%@',    // рампа плотности, от редкого к плотному
    STROKES: '-/|\\',     // штрихи по направлению (0°, 45°, 90°, 135°)
    DUST: ".,':/*+o-",    // символы «пыли»
    FONT_MONO: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace',
    GLYPH_SCALE: 0.92,    // размер символа относительно ячейки
    GLYPH_DENSITY: 0.85,  // доля ячеек с символом (настройка «плотность символов»)

    // --- тайлы ---
    TILE_ALPHA_MIN: 0.26, // альфа самой тёмной ячейки
    TILE_ALPHA_MAX: 0.90, // никаких 100% заливок
    SHADES: 24,           // число ступеней в цветовой рампе существа
    FLICKER: 0.25,        // случайная яркость ячейки ±25%
    HUE_JITTER: 0.06,     // сдвиг оттенка особи ±6% круга

    // --- сцена ---
    REF_AREA: 1920 * 1080, // стартовые количества заданы для 1080p
    SIZE_VARIATION: 0.4,   // размер ±40%
    CURSOR_RADIUS: 140,
    CURSOR_FORCE: 900,     // px/s² у самого курсора
    CLICK_IMPULSE: 620,    // px/s
    PUSH_DAMPING: 1.6,     // 1/s: возврат к норме за 2–3 с
    SEPARATION: 46,        // px/s² при полном перекрытии
    CENTER_AVOID: 34,      // px/s² выталкивание из зоны интерфейса
    DISSOLVE_MS: [400, 600],
    ASSEMBLE_MS: [600, 900],
    ASSEMBLE_DELAY_MS: 320,

    // --- частицы ---
    PARTICLES_MAX: 400,
    PARTICLE_LIFE: [0.5, 2.0],
    DEBRIS_MAX: 7000,

    // --- производительность ---
    FPS_LOW: 45,           // ниже этого 3 с подряд — снижаем качество
    FPS_WINDOW: 3,
    FPS_SAVER: 30,         // неактивное окно и «экономия батареи»
    FPS_WALLPAPER: 30,

    // --- палитра системы (раздел 11 ТЗ) ---
    PALETTE_URL: 'http://127.0.0.1:8765/palette.json',
    PALETTE_POLL_MS: 3000,
    PALETTE_FADE_MS: 600,

    // --- поиск на обычной странице ---
    SEARCH_URL: 'https://duckduckgo.com/?q=%s',

    SPECIES_ORDER: ['butterfly', 'jellyfish', 'dragonfly', 'koi', 'frog', 'crane', 'crab'],
    DEFAULT_SPECIES: 'butterfly'
  };

  GP.species = {};   // сюда регистрируются существа
})(window.GP = window.GP || {});
