/* Ladybug — вид сверху: круглый красный купол с чёрным швом и пятнами, чёрная голова
 * с белыми «щёчками», шесть ног, усики. Бегает перебежками, замирает, а иногда
 * раскрывает надкрылья и перелетает — тогда видны прозрачные крылья. */
(function (GP) {
  'use strict';

  // ------------------------------------------------------------ параметры
  var COUNT = 10;
  var ENV = 'meadow';        // среда вида (см. js/ambient.js)
  var DRIFT = 0.4;           // насколько ветер сносит существо
  var PALETTE = {
    dot: '#ee3b2c',
    materials: [
      { role: 'error', stops: ['#5a0e0c', '#b81c16', '#ee3b2c', '#ff8a72'] },            // надкрылья
      { role: 'on_surface_variant', stops: ['#07080b', '#15181e', '#2a303a', '#aab4c4'] }, // чёрное и светлые щёчки, крылья
      { role: 'on_surface_variant', stops: ['#2a3f66', '#5f86c4', '#a9c8f0'] }           // среда: луг
    ]
  };
  var UNIT = 2.7;            // масштаб тела в ячейках
  var SIZE = [0.7, 1.15];
  var PAUSE = [0.5, 2.4];    // сек
  var RUN = [0.4, 1.3];      // сек
  var RUN_SPEED = [30, 75];  // px/с
  var FLY_CHANCE = 0.22;     // доля перебежек, которые становятся перелётом
  var FLY_SPEED = [90, 150]; // px/с
  var WOBBLE = 1.4;          // рад/с — виляние на бегу
  var SEAM = 0.12;           // полуширина шва между надкрыльями, единиц тела
  // пятна на каждой половине: x, y от шва (единиц тела), радиус
  var SPOTS = [[0.45, 0.52, 0.2], [-0.4, 0.62, 0.23]];
  // ----------------------------------------------------------------------

  var U = GP.util, R = GP.Raster, Cr = GP.Creature;

  function Ladybug(env, rnd, x, y) {
    var k = rnd();
    Cr.init(this, SPECIES, env, rnd, { depth: k, x: x, y: y });
    this.size = U.lerp(SIZE[0], SIZE[1], k);
    this.state = 0;                       // 0 стоит, 1 бежит, 2 летит
    this.timer = rnd.range(0.2, PAUSE[1]);
    this.tau = 0; this.dur = 0.8; this.peak = 50;
    this.legPh = rnd() * U.TAU;
    this.moving = 0; this.wings = 0;      // wings: 0 — надкрылья закрыты, 1 — раскрыты
    this.wob = rnd() * U.TAU;
    this.geom(env);
    this.cos = Math.cos(this.heading); this.sin = Math.sin(this.heading);
  }

  Ladybug.prototype.geom = function (env) {
    this.cell = env.cell;
    this.u = UNIT * this.size * env.cell;
    this.radius = this.u * 2.4;
  };

  Ladybug.prototype.onScare = function () { if (this.state === 0) this.timer = Math.min(this.timer, 0.08); };

  Ladybug.prototype.update = function (dt, env) {
    if (env.cell !== this.cell) this.geom(env);
    this.t += dt;
    var busy = this.held || this.thrown, v = 0;

    if (busy) { this.state = 0; this.timer = Math.max(this.timer, 0.5); }
    else if (this.state === 0) {
      this.timer -= dt * (1 + 2 * this.excite);
      if (this.timer <= 0) {
        var fly = this.rnd() < FLY_CHANCE || this.excite > 0.5;
        this.state = fly ? 2 : 1; this.tau = 0;
        this.dur = fly ? this.rnd.range(0.7, 1.5) : this.rnd.range(RUN[0], RUN[1]);
        this.peak = (fly ? this.rnd.range(FLY_SPEED[0], FLY_SPEED[1]) : this.rnd.range(RUN_SPEED[0], RUN_SPEED[1])) * this.speedMul;
        this.heading = Cr.inwardBias(this, env, this.heading + this.rnd.range(-0.9, 0.9), 110);
      }
    } else {
      this.tau += dt / this.dur;
      v = this.peak * Math.sin(Math.PI * Math.min(1, this.tau));
      this.heading += Math.sin(this.t * 7 + this.wob) * WOBBLE * dt * (this.state === 2 ? 0.3 : 1);
      if (this.tau >= 1) { this.state = 0; this.timer = this.rnd.range(PAUSE[0], PAUSE[1]); }
    }
    this.cos = Math.cos(this.heading); this.sin = Math.sin(this.heading);
    Cr.move(this, dt, env, this.cos * v, this.sin * v);
    this.cos = Math.cos(this.heading); this.sin = Math.sin(this.heading);

    // в полёте и в руке надкрылья раскрываются
    var open = this.state === 2 || busy ? 1 : 0;
    this.wings += (open - this.wings) * Math.min(1, dt * 14);
    this.moving += (((this.state === 1) || busy ? 1 : 0) - this.moving) * Math.min(1, dt * 10);
    this.legPh += dt * (busy ? 40 : v * 0.3);
    this.flutter = Math.sin(this.t * 55);                  // крылья бьют быстро
  };

  Ladybug.prototype.bounds = function (b) {
    var r = this.radius * (1 + 0.6 * this.wings);
    b.x0 = this.x - r; b.y0 = this.y - r; b.x1 = this.x + r; b.y1 = this.y + r;
  };

  function cap(px, py, ax, ay, bx, by, r0, r1) {
    var ex = bx - ax, ey = by - ay;
    var t = ((px - ax) * ex + (py - ay) * ey) / (ex * ex + ey * ey || 1);
    if (t < 0) t = 0; else if (t > 1) t = 1;
    var qx = px - ax - ex * t, qy = py - ay - ey * t, rr = r0 + (r1 - r0) * t;
    cap.t = t;
    return (qx * qx + qy * qy) / (rr * rr);
  }

  Ladybug.prototype.sample = function (x, y) {
    var dx = x - this.x, dy = y - this.y;
    var lx = dx * this.cos + dy * this.sin, ly = -dx * this.sin + dy * this.cos;
    var u = this.u, w = this.wings, ay = Math.abs(ly), ex, ey, q, i;
    R.u = lx / this.cell + 30; R.v = ly / this.cell + 30;

    // голова: чёрная
    ex = lx - 1.62 * u;
    if (ex * ex + ly * ly < 0.3 * u * u) { R.m = 1; return 0.32; }

    // прозрачные крылья из-под раскрытых надкрылий
    if (w > 0.05) {
      var fl = 1 + 0.12 * this.flutter;
      q = cap(lx, ay, -0.2 * u, 0.5 * u, (-1.0 - 1.6 * w * fl) * u, (1.0 + 2.0 * w * fl) * u, 0.52 * u, 0.3 * u);
      if (q < 1) { R.m = 1; R.a = 0.55; return 0.82; }
    }

    // надкрылья: две половинки купола; шов широкий, чтобы читался в мозаике, и раздвигается при раскрытии
    var seam = (SEAM + 0.55 * w) * u, oy = ay - seam;
    ex = (lx + 0.1 * u) / (1.55 * u);
    if (oy >= 0) {
      ey = oy / (1.22 * u);
      q = ex * ex + ey * ey;
      if (q >= 1) return 0;
      if (lx > 0.95 * u) {                                     // переднеспинка чёрная, с белыми пятнами
        var px = lx - 1.18 * u, py = ay - 0.6 * u;
        if (px * px + py * py < 0.05 * u * u) { R.m = 1; return 1; }
        R.m = 1; return 0.3;
      }
      for (i = 0; i < SPOTS.length; i++) {
        var sx = lx - SPOTS[i][0] * u, sy = oy - SPOTS[i][1] * u;
        if (sx * sx + sy * sy < SPOTS[i][2] * SPOTS[i][2] * u * u) { R.m = 1; return 0.1; }   // чёрные пятна
      }
      R.m = 0;
      // объём: края темнее, блик у переднего края
      return 0.62 + 0.3 * (1 - q) - (q > 0.8 ? 0.14 : 0) + (oy < 0.7 * u && lx > -0.2 * u && lx < 0.8 * u ? 0.1 : 0);
    }
    // шов (или тёмное тело между раскрытыми половинками)
    ey = ay / (1.22 * u);
    if (ex * ex + ey * ey < 1 && lx < 1.0 * u) { R.m = 1; return 0.1; }
    return 0;
  };

  Ladybug.prototype.strokes = function (add) {
    var u = this.u, c = this.cos, s = this.sin, x = this.x, y = this.y, mv = this.moving;
    function line(ax, ay, bx, by, lum) {
      add(x + ax * c - ay * s, y + ax * s + ay * c, x + bx * c - by * s, y + bx * s + by * c, 1, lum, 1, 1);
    }
    for (var sd = -1; sd <= 1; sd += 2) {
      // три ноги с каждой стороны шагают по очереди
      for (var k = 0; k < 3; k++) {
        var ph = this.legPh + k * 2.1 + (sd > 0 ? Math.PI : 0), rx = (0.85 - 0.85 * k) * u;
        var reach = 1.95 * u + Math.sin(ph) * 0.3 * u * mv;
        line(rx, sd * 0.95 * u, rx + (k - 1) * -0.3 * u + Math.cos(ph) * 0.3 * u * mv, sd * reach, 0.3);
      }
      // усики шевелятся
      var wg = Math.sin(this.t * 6 + sd) * 0.25;
      line(1.9 * u, sd * 0.2 * u, 2.7 * u, sd * (0.55 + wg) * u, 0.35);
    }
  };

  var SPECIES = GP.species.ladybug = {
    id: 'ladybug', env: ENV, drift: DRIFT, label: 'Ladybug', count: COUNT, palette: PALETTE,
    hueJitter: 0.4, flicker: 0.1,
    create: function (env, rnd, x, y) { return new Ladybug(env, rnd, x, y); }
  };
})(window.GP);
