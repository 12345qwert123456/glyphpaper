/* Математика, шум и цвет. Без зависимостей. */
(function (GP) {
  'use strict';

  var TAU = Math.PI * 2;
  var U = GP.util = { TAU: TAU };

  U.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.smooth = function (t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
  U.easeOut = function (t) { t = t < 0 ? 0 : t > 1 ? 1 : t; var u = 1 - t; return 1 - u * u * u; };

  /** Детерминированный генератор случайных чисел. */
  U.rng = function (seed) {
    var a = seed >>> 0;
    var r = function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.range = function (lo, hi) { return lo + (hi - lo) * r(); };
    r.sign = function () { return r() < 0.5 ? -1 : 1; };
    r.pick = function (arr) { return arr[(r() * arr.length) | 0]; };
    return r;
  };

  /** Целочисленный хэш ячейки → [0, 1). */
  U.hash = function (i, j, seed) {
    var h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1103515245);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  /** Плавный одномерный value noise, [0, 1]. */
  U.noise1 = function (x, seed) {
    var i = Math.floor(x), f = x - i;
    var a = U.hash(i, 17, seed), b = U.hash(i + 1, 17, seed);
    return a + (b - a) * f * f * (3 - 2 * f);
  };

  /** Плавный двумерный value noise, [0, 1]. */
  U.noise2 = function (x, y, seed) {
    var i = Math.floor(x), j = Math.floor(y);
    var fx = x - i, fy = y - j;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var a = U.hash(i, j, seed), b = U.hash(i + 1, j, seed);
    var c = U.hash(i, j + 1, seed), d = U.hash(i + 1, j + 1, seed);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };

  /** Кратчайшая разница углов b − a в (−π, π]. */
  U.angDiff = function (a, b) {
    var d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
    return d;
  };

  /** Поворот к цели с ограничением шага. */
  U.turnToward = function (cur, target, maxStep) {
    var d = U.angDiff(cur, target);
    if (d > maxStep) d = maxStep; else if (d < -maxStep) d = -maxStep;
    return cur + d;
  };

  // ---------------------------------------------------------------- цвет

  var C = GP.color = {};

  C.hex = function (hex) {
    var h = String(hex).trim().replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h.slice(0, 6), 16);
    if (isNaN(n)) return [128, 128, 128];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };

  C.css = function (c) {
    return 'rgb(' + (c[0] + 0.5 | 0) + ',' + (c[1] + 0.5 | 0) + ',' + (c[2] + 0.5 | 0) + ')';
  };

  C.mix = function (a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };

  C.toHsl = function (c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0;
    if (mx !== mn) {
      var d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  };

  function hue2rgb(p, q, t) {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }

  C.fromHsl = function (h, s, l) {
    h = ((h % 1) + 1) % 1;
    if (s === 0) return [l * 255, l * 255, l * 255];
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [hue2rgb(p, q, h + 1 / 3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1 / 3) * 255];
  };

  /** Сдвиг оттенка на долю круга (0.06 = 6%). */
  C.shiftHue = function (c, amount) {
    if (!amount) return c;
    var hsl = C.toHsl(c);
    if (hsl[1] < 0.04) return c;
    return C.fromHsl(hsl[0] + amount, hsl[1], hsl[2]);
  };

  function toLin(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function toSrgb(v) {
    v = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return v < 0 ? 0 : v > 1 ? 255 : v * 255;
  }

  /** sRGB → OKLCH: [L 0..1, C, H в градусах]. */
  C.toOklch = function (c) {
    var r = toLin(c[0]), g = toLin(c[1]), b = toLin(c[2]);
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    var L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    var A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    var B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    var h = Math.atan2(B, A) * 180 / Math.PI;
    return [L, Math.sqrt(A * A + B * B), h < 0 ? h + 360 : h];
  };

  function oklchRaw(L, Cc, H) {
    var h = H * Math.PI / 180, A = Cc * Math.cos(h), B = Cc * Math.sin(h);
    var l = L + 0.3963377774 * A + 0.2158037573 * B;
    var m = L - 0.1055613458 * A - 0.0638541728 * B;
    var s = L - 0.0894841775 * A - 1.2914855480 * B;
    l = l * l * l; m = m * m * m; s = s * s * s;
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    ];
  }

  /** OKLCH → sRGB; насыщенность ужимается, пока цвет не попадёт в охват. */
  C.fromOklch = function (L, Cc, H) {
    var rgb = oklchRaw(L, Cc, H), n = 0;
    while (n++ < 24 && (rgb[0] < -0.001 || rgb[0] > 1.001 || rgb[1] < -0.001 || rgb[1] > 1.001 ||
      rgb[2] < -0.001 || rgb[2] > 1.001)) {
      Cc *= 0.9;
      rgb = oklchRaw(L, Cc, H);
    }
    return [toSrgb(rgb[0]), toSrgb(rgb[1]), toSrgb(rgb[2])];
  };

  /** Воспринимаемая светлота 0..1 (OKLab L). */
  C.lightness = function (c) { return C.toOklch(c)[0]; };
})(window.GP);
