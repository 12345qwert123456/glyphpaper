/* Цвета существ и интерфейса.
 *
 * Natural  — фиксированные палитры из файлов существ.
 * Adaptive — те же рампы, перекрашенные в роли палитры системы (Noctalia / pywal).
 * Auto     — Adaptive, если палитра доступна, иначе Natural.
 *
 * Палитра меняется плавно: current перетекает к target за PALETTE_FADE_MS. */
(function (GP) {
  'use strict';

  var C = GP.color, U = GP.util, CFG = GP.config;

  var ROLES = ['surface', 'on_surface', 'on_surface_variant', 'primary', 'secondary',
    'tertiary', 'primary_container', 'error'];

  var P = GP.Palette = {
    mode: 'auto',        // настройка пользователя: auto | natural | adaptive
    active: 'natural',   // что реально показано
    system: null,        // нормализованные роли палитры системы или null
    version: 0,          // растёт при любом изменении текущих цветов
    onChange: null
  };

  var cur = null, from = null, to = null, fade = 1;
  var natural = null;

  // ------------------------------------------------------------ natural

  function buildNatural() {
    var out = { species: {}, bg: C.hex(CFG.BG), surface: [14, 16, 24], text: [255, 255, 255] };
    CFG.SPECIES_ORDER.forEach(function (id) {
      var pal = GP.species[id].palette;
      out.species[id] = {
        dot: C.hex(pal.dot),
        mats: pal.materials.map(function (m) { return m.stops.map(C.hex); })
      };
    });
    return out;
  }

  // ----------------------------------------------------------- adaptive

  var RED_ORANGE_HUE = 40; // OKLCH-оттенок красно-оранжевого

  function hueDist(a, b) { var d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }
  function lerpHue(a, b, t) { var d = ((b - a + 540) % 360) - 180; return a + d * t; }

  function roleColor(roles, role) {
    if (role === 'crab') {
      // error или tertiary — что ближе к красно-оранжевому
      var e = C.toOklch(roles.error), t = C.toOklch(roles.tertiary);
      return hueDist(e[2], RED_ORANGE_HUE) <= hueDist(t[2], RED_ORANGE_HUE) ? roles.error : roles.tertiary;
    }
    return roles[role] || roles.primary;
  }

  /** Перекрашивает натуральную рампу в базовый цвет роли: светлота берётся
   *  из натуральной рампы, оттенок и насыщенность — из палитры системы. */
  function recolor(stops, spec, roles, bgL) {
    var base = roleColor(roles, spec.role || 'primary');
    var b = C.toOklch(base);
    // контраст с фоном: если цвет слишком близок к фону, подтягиваем к on_surface
    if (Math.abs(b[0] - bgL) < 0.25) b = C.toOklch(C.mix(base, roles.on_surface, 0.5));
    var hue = b[2] + (spec.rotate || 0);
    if (spec.toward) hue = lerpHue(hue, spec.toward[0], spec.toward[1]);
    var nat = stops.map(C.toOklch);
    var cmax = 0.0001;
    nat.forEach(function (n) { if (n[1] > cmax) cmax = n[1]; });
    var gain = spec.chroma == null ? 1 : spec.chroma;
    return nat.map(function (n) {
      var L = Math.min(0.9, n[0]);                         // блик не светлее ~90%
      if (L - bgL < 0.12) L = bgL + 0.12;
      var chroma = cmax < 0.03 ? Math.min(b[1], 0.03) * (n[1] / cmax)   // серые рампы остаются серыми
        : b[1] * (n[1] / cmax) * gain;
      return C.fromOklch(L, chroma, hue);
    });
  }

  function buildAdaptive(roles) {
    var s = C.toOklch(roles.surface);
    var natBgL = C.toOklch(natural.bg)[0];
    // фон остаётся тёмным даже при светлой теме: берём только оттенок surface
    var bg = C.fromOklch(natBgL, Math.min(s[1], 0.03), s[2]);
    var out = {
      species: {},
      bg: bg,
      surface: C.fromOklch(natBgL + 0.035, Math.min(s[1], 0.035), s[2]),
      text: C.fromOklch(Math.max(0.9, C.toOklch(roles.on_surface)[0]),
        Math.min(C.toOklch(roles.on_surface)[1], 0.04), C.toOklch(roles.on_surface)[2])
    };
    if (roles.mode === 'light') {
      // в светлой теме on_surface тёмный — текст интерфейса всё равно светлый
      out.text = C.fromOklch(0.95, Math.min(s[1], 0.02), s[2]);
    }
    CFG.SPECIES_ORDER.forEach(function (id) {
      var pal = GP.species[id].palette;
      var rolesFixed = roles;
      if (roles.mode === 'light') {
        // «белые» материалы строятся от светлого surface, а не от тёмного on_surface
        rolesFixed = Object.assign({}, roles, {
          on_surface: roles.surface, on_surface_variant: C.mix(roles.surface, roles.on_surface, 0.35)
        });
      }
      var mats = pal.materials.map(function (m, i) {
        return recolor(natural.species[id].mats[i], m, rolesFixed, natBgL);
      });
      var main = mats[pal.dotMaterial || 0];
      out.species[id] = { dot: main[Math.min(main.length - 1, Math.ceil(main.length / 2))], mats: mats };
    });
    return out;
  }

  // -------------------------------------------------------------- state

  function clone(p) {
    var o = { species: {}, bg: p.bg.slice(), surface: p.surface.slice(), text: p.text.slice() };
    for (var id in p.species) {
      o.species[id] = {
        dot: p.species[id].dot.slice(),
        mats: p.species[id].mats.map(function (m) { return m.map(function (c) { return c.slice(); }); })
      };
    }
    return o;
  }

  function blend(a, b, t) {
    var o = { species: {}, bg: C.mix(a.bg, b.bg, t), surface: C.mix(a.surface, b.surface, t), text: C.mix(a.text, b.text, t) };
    for (var id in b.species) {
      var sa = a.species[id], sb = b.species[id];
      o.species[id] = {
        dot: C.mix(sa.dot, sb.dot, t),
        mats: sb.mats.map(function (m, i) {
          return m.map(function (c, k) { return C.mix(sa.mats[i][k], c, t); });
        })
      };
    }
    return o;
  }

  function applyCss() {
    var st = document.documentElement.style;
    st.setProperty('--scene-bg', C.css(cur.bg));
    st.setProperty('--ui-surface', cur.surface.map(Math.round).join(','));
    st.setProperty('--ui-text', cur.text.map(Math.round).join(','));
    for (var id in cur.species) st.setProperty('--dot-' + id, C.css(cur.species[id].dot));
  }

  function retarget(instant) {
    var useAdaptive = P.mode !== 'natural' && !!P.system;
    P.active = useAdaptive ? 'adaptive' : 'natural';
    var next = useAdaptive ? buildAdaptive(P.system) : natural;
    if (!cur || instant) {
      cur = clone(next); to = next; from = cur; fade = 1;
    } else {
      from = clone(cur); to = next; fade = 0;
    }
    P.version++;
    applyCss();
    if (P.onChange) P.onChange();
  }

  P.init = function (mode) {
    natural = buildNatural();
    P.mode = mode || 'auto';
    retarget(true);
  };

  P.setMode = function (mode) {
    if (mode === P.mode) return;
    P.mode = mode;
    retarget(false);
  };

  /** Принимает palette.json Noctalia, pywal colors.json или null. */
  P.setSystem = function (obj) {
    var roles = obj ? P.parse(obj) : null;
    var same = JSON.stringify(roles) === JSON.stringify(P.system);
    if (same) return;
    P.system = roles;
    if (cur) retarget(false);
  };

  /** Продвигает плавный переход; dt — реальное время в секундах. */
  P.tick = function (dt) {
    if (fade >= 1) return false;
    fade = Math.min(1, fade + dt * 1000 / CFG.PALETTE_FADE_MS);
    cur = fade >= 1 ? clone(to) : blend(from, to, U.smooth(fade));
    P.version++;
    applyCss();
    return true;
  };

  P.bg = function () { return cur.bg; };
  P.dot = function (id) { return cur.species[id].dot; };

  /** Готовые рампы особи: для каждого материала SHADES строк CSS и признак
   *  «светлая ячейка» (на ней символ рисуется тёмным). */
  P.rampsFor = function (id, hueShift) {
    var mats = cur.species[id].mats, n = CFG.SHADES, out = [];
    for (var m = 0; m < mats.length; m++) {
      var stops = mats[m];
      if (hueShift) stops = stops.map(function (c) { return C.shiftHue(c, hueShift); });
      var css = new Array(n), light = new Array(n);
      for (var k = 0; k < n; k++) {
        var f = k / (n - 1) * (stops.length - 1);
        var i = Math.min(stops.length - 2, Math.floor(f));
        var col = C.mix(stops[i], stops[i + 1], f - i);
        css[k] = C.css(col);
        light[k] = (0.2126 * col[0] + 0.7152 * col[1] + 0.0722 * col[2]) > 150;
      }
      out.push({ css: css, light: light });
    }
    return out;
  };

  /** Цвета «пыли» вида: по два оттенка (средний и светлый) на материал. */
  P.dustColors = function (id) {
    var mats = cur.species[id].mats, out = [];
    for (var m = 0; m < mats.length; m++) {
      var s = mats[m];
      out.push(C.css(s[Math.max(0, s.length - 2)]));
      out.push(C.css(s[s.length - 1]));
    }
    return out;
  };

  // ------------------------------------------------------------- parsing

  function pickKey(obj, key) {
    if (obj[key] != null) return obj[key];
    var camel = key.replace(/_(\w)/g, function (_, ch) { return ch.toUpperCase(); });
    return obj[camel];
  }

  P.parse = function (obj) {
    if (!obj || typeof obj !== 'object') return null;
    var roles = {};
    if (obj.special && obj.colors) {
      // pywal-совместимый colors.json
      var c = obj.colors, sp = obj.special;
      roles = {
        surface: sp.background, on_surface: sp.foreground,
        on_surface_variant: c.color8 || c.color7,
        primary: c.color4, secondary: c.color6, tertiary: c.color5,
        primary_container: c.color12 || c.color4, error: c.color1
      };
    } else {
      var src = obj.colors && typeof obj.colors === 'object' ? obj.colors : obj;
      roles.mode = obj.mode || src.mode;
      ROLES.forEach(function (r) { roles[r] = pickKey(src, r); });
    }
    if (!roles.surface || !roles.primary) return null;
    var out = { mode: String(roles.mode || 'dark').toLowerCase() === 'light' ? 'light' : 'dark' };
    out.surface = C.hex(roles.surface);
    out.primary = C.hex(roles.primary);
    out.on_surface = C.hex(roles.on_surface || '#e6e6e6');
    out.on_surface_variant = roles.on_surface_variant ? C.hex(roles.on_surface_variant) : C.mix(out.on_surface, out.surface, 0.35);
    out.secondary = C.hex(roles.secondary || roles.primary);
    out.tertiary = C.hex(roles.tertiary || roles.secondary || roles.primary);
    out.primary_container = C.hex(roles.primary_container || roles.primary);
    out.error = C.hex(roles.error || '#ff5a4d');
    // режим не указан (pywal, шаблон без поля mode): определяем по светлоте фона
    var m = String(roles.mode || '').toLowerCase();
    if (m !== 'light' && m !== 'dark') out.mode = C.lightness(out.surface) > 0.6 ? 'light' : 'dark';
    return out;
  };

  // ------------------------------------------------------------- polling

  var pollTimer = 0, pollUrl = '', fails = 0, lastText = null, busy = false, skip = 0;

  function poll() {
    if (busy || document.hidden || P.mode === 'natural' || !pollUrl) return;
    // сервер палитры не отвечает — спрашиваем реже (раз в 15 с, затем раз в минуту)
    if (skip > 0) { skip--; return; }
    busy = true;
    // cache: 'no-cache' заставляет браузер слать условный запрос (If-Modified-Since / ETag)
    fetch(pollUrl, { cache: 'no-cache', credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (text) {
      fails = 0;
      if (text !== lastText) { lastText = text; P.setSystem(JSON.parse(text)); }
    }).catch(function () {
      // сервер выключен или файла нет — молча возвращаемся к Natural
      if (++fails >= 2 && P.system) { lastText = null; P.setSystem(null); }
      if (fails >= 2) skip = fails >= 6 ? 19 : 4;
    }).then(function () { busy = false; });
  }

  P.startPolling = function (url) {
    P.stopPolling();
    pollUrl = url || '';
    if (!pollUrl || typeof fetch !== 'function') return;
    poll();
    pollTimer = setInterval(poll, CFG.PALETTE_POLL_MS);
  };

  P.stopPolling = function () {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = 0; fails = 0; lastText = null; skip = 0;
  };

  P.pollNow = poll;
})(window.GP);
