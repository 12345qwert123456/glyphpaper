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

  /** Интегрирует положение: собственная скорость + затухающий толчок. */
  Cr.move = function (c, dt, env, vx, vy) {
    var m = env.mouse, dx, dy, d, f;
    if (m.active) {
      dx = c.x - m.x; dy = c.y - m.y;
      d = Math.sqrt(dx * dx + dy * dy);
      if (d < CFG.CURSOR_RADIUS) {
        f = 1 - d / CFG.CURSOR_RADIUS; f *= f;
        if (d < 1) { dx = 1; dy = 0; d = 1; }
        c.pushX += dx / d * CFG.CURSOR_FORCE * f * dt;
        c.pushY += dy / d * CFG.CURSOR_FORCE * f * dt;
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

    // ушли за край целиком — возвращаемся с другой стороны
    var mg = c.radius + env.cell * 2, sx = 0, sy = 0;
    if (c.x < -mg) sx = env.W + 2 * mg; else if (c.x > env.W + mg) sx = -(env.W + 2 * mg);
    if (c.y < -mg) sy = env.H + 2 * mg; else if (c.y > env.H + mg) sy = -(env.H + 2 * mg);
    if (sx || sy) {
      c.x += sx; c.y += sy;
      if (c.shift) c.shift(sx, sy);
    }
  };

  /** Толчок от клика. */
  Cr.impulse = function (c, x, y, strength) {
    var dx = c.x - x, dy = c.y - y;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    var f = strength / (1 + d / 260);
    c.pushX += dx / d * f; c.pushY += dy / d * f;
    c.excite = 1;
    if (c.onScare) c.onScare(dx / d, dy / d);
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
