/* Ladybug — вид сверху: красный купол с чёрными пятнами, чёрная голова, шесть ног, усики.
 * Шустро бегает короткими перебежками, замирает и шевелит усиками. */
(function (GP) {
  'use strict';

  // ------------------------------------------------------------ параметры
  var COUNT = 14;
  var ENV = 'meadow';        // среда вида (см. js/ambient.js)
  var DRIFT = 0.4;           // насколько ветер сносит существо
  var PALETTE = {
    dot: '#ee3b2c',
    materials: [
      { role: 'error', stops: ['#6e1210', '#c4201a', '#ee3b2c', '#ff8a72'] },          // надкрылья
      { role: 'on_surface_variant', stops: ['#12151b', '#2a303a', '#4b5463', '#8a94a4'] }, // голова, пятна, ноги
      { role: 'on_surface_variant', stops: ['#2a3f66', '#5f86c4', '#a9c8f0'] }          // среда: луг
    ]
  };
  var UNIT = 1.15;           // масштаб тела в ячейках
  var SIZE = [0.75, 1.35];
  var PAUSE = [0.4, 2.6];    // сек
  var RUN = [0.4, 1.5];      // сек
  var RUN_SPEED = [35, 85];  // px/с
  var WOBBLE = 1.6;          // рад/с — виляние при беге
  // пятна: x, y (единиц тела), радиус
  var SPOTS = [[0.55, 0.62, 0.3], [0.55, -0.62, 0.3], [-0.35, 0.72, 0.32], [-0.35, -0.72, 0.32], [-0.95, 0.2, 0.24], [-0.95, -0.2, 0.24]];
  // ----------------------------------------------------------------------

  var U = GP.util, R = GP.Raster, Cr = GP.Creature;

  function Ladybug(env, rnd, x, y) {
    var k = rnd();
    Cr.init(this, SPECIES, env, rnd, { depth: k, x: x, y: y });
    this.size = U.lerp(SIZE[0], SIZE[1], k);
    this.state = 0;                       // 0 стоит, 1 бежит
    this.timer = rnd.range(0.2, PAUSE[1]);
    this.tau = 0; this.dur = 0.8; this.peak = 50;
    this.legPh = rnd() * U.TAU;
    this.moving = 0;
    this.wob = rnd() * U.TAU;
    this.geom(env);
    this.cos = Math.cos(this.heading); this.sin = Math.sin(this.heading);
  }

  Ladybug.prototype.geom = function (env) {
    this.cell = env.cell;
    this.u = UNIT * this.size * env.cell;
    this.radius = this.u * 2.6;
  };

  Ladybug.prototype.onScare = function () { if (this.state === 0) this.timer = Math.min(this.timer, 0.1); };

  Ladybug.prototype.update = function (dt, env) {
    if (env.cell !== this.cell) this.geom(env);
    this.t += dt;
    var busy = this.held || this.thrown, v = 0;

    if (busy) { this.state = 0; this.timer = Math.max(this.timer, 0.5); }
    else if (this.state === 0) {
      this.timer -= dt * (1 + 2 * this.excite);
      if (this.timer <= 0) {
        this.state = 1; this.tau = 0;
        this.dur = this.rnd.range(RUN[0], RUN[1]);
        this.peak = this.rnd.range(RUN_SPEED[0], RUN_SPEED[1]) * this.speedMul;
        this.heading = Cr.inwardBias(this, env, this.heading + this.rnd.range(-0.9, 0.9), 100);
      }
    } else {
      this.tau += dt / this.dur;
      v = this.peak * Math.sin(Math.PI * Math.min(1, this.tau));        // разгон и торможение
      this.heading += Math.sin(this.t * 7 + this.wob) * WOBBLE * dt;     // виляет на бегу
      if (this.tau >= 1) { this.state = 0; this.timer = this.rnd.range(PAUSE[0], PAUSE[1]); }
    }
    this.cos = Math.cos(this.heading); this.sin = Math.sin(this.heading);
    Cr.move(this, dt, env, this.cos * v, this.sin * v);
    this.cos = Math.cos(this.heading); this.sin = Math.sin(this.heading);

    this.moving += ((this.state || busy ? 1 : 0) - this.moving) * Math.min(1, dt * 10);
    this.legPh += dt * (busy ? 40 : v * 0.28);                         // ножки бегут в такт скорости
  };

  Ladybug.prototype.bounds = function (b) {
    var r = this.radius;
    b.x0 = this.x - r; b.y0 = this.y - r; b.x1 = this.x + r; b.y1 = this.y + r;
  };

  Ladybug.prototype.sample = function (x, y) {
    var dx = x - this.x, dy = y - this.y;
    var lx = dx * this.cos + dy * this.sin, ly = -dx * this.sin + dy * this.cos;
    var u = this.u, ex, ey, q, i;
    R.u = lx / this.cell + 30; R.v = ly / this.cell + 30;
    // голова
    ex = lx - 1.75 * u;
    if (ex * ex + ly * ly < 0.26 * u * u) { R.m = 1; return 0.62; }
    // надкрылья — купол с чёрным швом и пятнами
    ex = (lx + 0.1 * u) / (1.55 * u); ey = ly / (1.3 * u);
    q = ex * ex + ey * ey;
    if (q >= 1) return 0;
    if (lx > 0.95 * u) { R.m = 1; return 0.5; }                         // переднеспинка
    if (Math.abs(ly) < 0.1 * u) { R.m = 1; return 0.28; }               // шов
    for (i = 0; i < SPOTS.length; i++) {
      var sx = lx - SPOTS[i][0] * u, sy = ly - SPOTS[i][1] * u;
      if (sx * sx + sy * sy < SPOTS[i][2] * SPOTS[i][2] * u * u) { R.m = 1; return 0.45; }
    }
    R.m = 0;
    return 0.52 + 0.3 * (1 - q) + (ly < -0.3 * u ? 0.14 : 0);           // блик на куполе
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
        var reach = 1.9 * u + Math.sin(ph) * 0.35 * u * mv;
        line(rx, sd * 0.85 * u, rx + (k - 1) * -0.25 * u + Math.cos(ph) * 0.3 * u * mv, sd * reach, 0.5);
      }
      // усики шевелятся
      var w = Math.sin(this.t * 6 + sd) * 0.25;
      line(2.0 * u, sd * 0.25 * u, 2.75 * u, sd * (0.55 + w) * u, 0.6);
    }
  };

  var SPECIES = GP.species.ladybug = {
    id: 'ladybug', env: ENV, drift: DRIFT, label: 'Ladybug', count: COUNT, palette: PALETTE,
    hueJitter: 0.5, flicker: 0.14,
    create: function (env, rnd, x, y) { return new Ladybug(env, rnd, x, y); }
  };
})(window.GP);
