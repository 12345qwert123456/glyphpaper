/* Общая часть всех существ: размер и «глубина», сдвиг оттенка, реакция на
 * курсор, инерция от толчков, выход за край с возвратом с другой стороны. */
(function (GP) {
  'use strict';

  var CFG = GP.config, U = GP.util;

  var Cr = GP.Creature = {};

  /** Заполняет общие поля особи.
   *  opts.depth (0..1) — если вид сам задаёт размер; иначе размер ±40%. */
  Cr.init = function (c, species, env, rnd, opts) {
    opts = opts || {};
    c.species = species;
    c.rnd = rnd;
    c.seed = (rnd() * 0x7fffffff) | 0;
    var depth;
    if (opts.depth != null) {
      depth = opts.depth;
      c.size = 1;
    } else {
      var k = rnd() * 2 - 1;
      c.size = 1 + k * CFG.SIZE_VARIATION;
      depth = (k + 1) / 2;
    }
    c.depth = depth;
    // мелкие — тусклее и медленнее (ощущение глубины)
    c.bright = U.lerp(0.58, 1.0, depth);
    c.speedMul = U.lerp(0.7, 1.12, depth);
    c.hue = (rnd() * 2 - 1) * CFG.HUE_JITTER * (species.hueJitter == null ? 1 : species.hueJitter);
    c.flicker = species.flicker == null ? CFG.FLICKER : species.flicker;
    c.x = opts.x || 0; c.y = opts.y || 0;
    c.heading = rnd() * U.TAU;
    c.pushX = 0; c.pushY = 0;
    c.excite = 0;
    c.alpha = 1;
    c.asm = 0;                       // 0..1 — прогресс сборки из ячеек
    c.asmDur = rnd.range(CFG.ASSEMBLE_MS[0], CFG.ASSEMBLE_MS[1]) / 1000;
    c.asmDelay = 0;
    c.t = rnd() * 100;
    c.radius = 40;
    c.ramps = null; c.palVer = -1;
    return c;
  };

  /** Ушли за край целиком — возвращаемся с другой стороны. */
  Cr.wrap = function (c, env) {
    var mg = c.radius + env.cell * 2, sx = 0, sy = 0;
    if (c.x < -mg) sx = env.W + 2 * mg; else if (c.x > env.W + mg) sx = -(env.W + 2 * mg);
    if (c.y < -mg) sy = env.H + 2 * mg; else if (c.y > env.H + mg) sy = -(env.H + 2 * mg);
    if (sx || sy) {
      c.x += sx; c.y += sy;
      if (c.shift) c.shift(sx, sy);
    }
  };

  /** Интегрирует положение: собственная скорость + затухающий толчок. */
  Cr.move = function (c, dt, env, vx, vy) {
    var m = env.mouse, dx, dy, d, f;
    if (c.held) { Cr.holdStep(c, dt); return; }
    if (c.thrown) { Cr.thrownStep(c, dt, env, vx, vy); return; }
    if (m.active && env.react > 0) {
      dx = c.x - m.x; dy = c.y - m.y;
      d = Math.sqrt(dx * dx + dy * dy);
      if (d < CFG.CURSOR_RADIUS) {
        f = 1 - d / CFG.CURSOR_RADIUS; f *= f;
        if (d < 1) { dx = 1; dy = 0; d = 1; }
        c.pushX += dx / d * CFG.CURSOR_FORCE * env.react * f * dt;
        c.pushY += dy / d * CFG.CURSOR_FORCE * env.react * f * dt;
        if (f > c.excite) c.excite = f;
      }
    }
    var z = env.zone;
    if (z) {
      // центр экрана с приветствием населён реже
      dx = (c.x - z.x) / z.rx; dy = (c.y - z.y) / z.ry;
      d = dx * dx + dy * dy;
      if (d < 1) {
        f = 1 - d; d = Math.sqrt(d) || 1;
        c.pushX += dx / d * CFG.CENTER_AVOID * f * dt;
        c.pushY += dy / d * CFG.CENTER_AVOID * f * dt;
      }
    }
    var k = Math.exp(-CFG.PUSH_DAMPING * dt);
    c.pushX *= k; c.pushY *= k;
    c.excite *= Math.exp(-1.1 * dt);

    // ветер или течение сносит существо (species.drift — насколько сильно)
    var fl = GP.Ambient.flow, dr = c.species.drift || 0;
    c.x += (vx + c.pushX + fl.x * dr) * dt;
    c.y += (vy + c.pushY + fl.y * dr) * dt;
    Cr.wrap(c, env);
  };

  // ------------------------------------------- взять, тащить, бросить

  /** Взяли существо в точке (x, y): запоминаем, за какое место тела. */
  Cr.grab = function (c, x, y) {
    c.thrown = false;
    if (c.onGrab) { c.onGrab(x, y); return; }
    var dx = x - c.x, dy = y - c.y, cs = Math.cos(c.heading), sn = Math.sin(c.heading);
    var len = Math.sqrt(dx * dx + dy * dy);
    c.grabbed = {
      lx: dx * cs + dy * sn, ly: -dx * sn + dy * cs,   // точка хвата в осях тела
      len: len < Math.max(5, c.radius * 0.22) ? 0 : len,   // плечо: от центра тела до руки (у самого центра — без вращения)
      lever: U.clamp(len / (c.radius * 0.6), 0, 1),         // короткое плечо закручивает слабее
      vx: 0, vy: 0,                                     // скорость центра (для инерции)
      tvx: 0, tvy: 0, spin: 0                           // сглаженные скорость и закрутка (для броска)
    };
  };

  /** Существо «в руке»: взятая точка идёт за указателем, тело висит на ней
   *  жёстким плечом, отстаёт по инерции и разворачивается вслед за движением. */
  Cr.holdStep = function (c, dt) {
    var g = c.grabbed, h = c.held;
    c.pushX = c.pushY = 0;
    c.excite = 0.85;
    if (!g || dt <= 0) return;
    var ox = c.x, oy = c.y, oh = c.heading;
    if (!g.len) { c.x = h.x; c.y = h.y; }
    else {
      var k = Math.exp(-CFG.HOLD_DRAG * dt);
      var dx = c.x + g.vx * k * dt - h.x, dy = c.y + g.vy * k * dt - h.y;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      c.x = h.x + dx / d * g.len; c.y = h.y + dy / d * g.len;
      // тело поворачивается так, чтобы взятая точка осталась под рукой
      c.heading = Math.atan2(h.y - c.y, h.x - c.x) - Math.atan2(g.ly, g.lx);
    }
    g.vx = (c.x - ox) / dt; g.vy = (c.y - oy) / dt;
    var a = Math.min(1, dt * 22);
    g.tvx += (g.vx - g.tvx) * a; g.tvy += (g.vy - g.tvy) * a;
    g.spin += (U.angDiff(oh, c.heading) / dt - g.spin) * a;
  };

  /** Отпустили: существо летит дальше с набранной скоростью и закруткой. */
  Cr.release = function (c, handVx, handVy) {
    c.held = null;
    if (c.onRelease) { c.onRelease(handVx, handVy); return; }
    var g = c.grabbed;
    c.grabbed = null;
    if (!g) return;
    // центр тела уже несёт свою скорость; если держали за середину — это скорость руки
    var vx = g.len ? g.tvx : handVx, vy = g.len ? g.tvy : handVy;
    var sp = Math.sqrt(vx * vx + vy * vy);
    if (sp > CFG.THROW_MAX) { vx *= CFG.THROW_MAX / sp; vy *= CFG.THROW_MAX / sp; }
    c.tvx = vx; c.tvy = vy;
    c.spin = U.clamp(g.spin * g.lever, -CFG.SPIN_MAX, CFG.SPIN_MAX);
    c.thrown = true;
  };

  /** Полёт после броска: скорость и закрутка гаснут, управление возвращается
   *  постепенно — пока существо кувыркается, само оно почти не плывёт. */
  Cr.thrownStep = function (c, dt, env, vx, vy) {
    var sp = Math.sqrt(c.tvx * c.tvx + c.tvy * c.tvy), as = Math.abs(c.spin);
    var ctrl = 1 - U.clamp(sp / 240 + as / 3, 0, 1);
    var fl = GP.Ambient.flow, dr = c.species.drift || 0;
    c.x += (c.tvx + vx * ctrl + fl.x * dr) * dt;
    c.y += (c.tvy + vy * ctrl + fl.y * dr) * dt;
    c.heading += c.spin * dt;
    var kd = Math.exp(-(GP.Ambient.water ? CFG.THROW_DAMP_WATER : CFG.THROW_DAMP_AIR) * dt);
    c.tvx *= kd; c.tvy *= kd;
    c.spin *= Math.exp(-CFG.SPIN_DAMP * dt);
    c.pushX = c.pushY = 0;
    if (1 - ctrl > c.excite) c.excite = 1 - ctrl;
    if (sp < 20 && as < 0.3) {            // стабилизировалось
      c.thrown = false;
      c.pushX = c.tvx; c.pushY = c.tvy;
    }
    Cr.wrap(c, env);
  };

  /** Насколько точка близко к существу: < 1 — можно ухватить. */
  Cr.hit = function (c, x, y) {
    if (c.hit) return c.hit(x, y);
    var dx = x - (c.hx == null ? c.x : c.hx), dy = y - (c.hy == null ? c.y : c.hy);
    return Math.sqrt(dx * dx + dy * dy) / Math.max(CFG.GRAB_MIN_RADIUS, c.radius * 0.7);
  };

  /** Направление от точки внутрь экрана, если существо у края (для прыгающих и бегающих). */
  Cr.inwardBias = function (c, env, ang, margin) {
    var tx = 0, ty = 0;
    if (c.x < margin) tx = 1; else if (c.x > env.W - margin) tx = -1;
    if (c.y < margin) ty = 1; else if (c.y > env.H - margin) ty = -1;
    if (!tx && !ty) return ang;
    return Math.atan2(ty * 2 + Math.sin(ang), tx * 2 + Math.cos(ang));
  };
})(window.GP);
