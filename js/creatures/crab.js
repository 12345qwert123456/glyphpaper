/* Crab — вид сверху: панцирь, две клешни, шесть ног. Бежит боком короткими
 * рывками, останавливается, клешни открываются и закрываются. */
(function (GP) {
  'use strict';

  // ------------------------------------------------------------ параметры
  var COUNT = 9;
  var ENV = 'shore';       // среда вида (см. js/ambient.js)
  var DRIFT = 0;            // насколько ветер или течение сносит существо
  var PALETTE = {
    dot: '#ff6b3d',
    materials: [
      { role: 'crab', stops: ['#6e1a10', '#c8321e', '#ff6b3d', '#ffc09a'] },  // панцирь и клешни
      { role: 'crab', stops: ['#6e1a10', '#c8321e', '#ee5f39'] },              // ноги
      { role: 'on_surface_variant', stops: ['#5a4630', '#a88a5a', '#e6d3a8'] }   // среда: песчаный берег
    ]
  };
  var UNIT = 1.0;                       // масштаб в ячейках; ширина с ногами ≈ 9.5 единиц
  var SIZE = [0.7, 1.3];
  var RUN = [0.35, 1.1];                // сек — длительность рывка
  var PAUSE = [0.6, 2.6];               // сек — остановка
  var RUN_SPEED = [60, 130];            // px/с на пике рывка
  var CLAW_HZ = 3.2;                    // частота щёлканья клешнями
  var LEG_X = [0.75, -0.1, -0.95];      // крепление трёх ног вдоль тела
  // ----------------------------------------------------------------------

  var U = GP.util, R = GP.Raster, Cr = GP.Creature;

  function Crab(env, rnd, x, y) {
    var k = rnd();
    Cr.init(this, SPECIES, env, rnd, { depth: k, x: x, y: y });
    this.size = U.lerp(SIZE[0], SIZE[1], k);
    this.state = 0;                      // 0 стоит, 1 бежит
    this.timer = rnd.range(0.2, PAUSE[1]);
    this.dir = rnd.sign();
    this.tau = 0; this.dur = 0.6; this.peak = 90;
    this.walk = rnd() * U.TAU;
    this.open = 0.2;
    this.turn = 0; this.turnT = rnd.range(1, 4);
    this.moving = 0;
    this.claw = new Float32Array(20);
    this.geom(env);
  }

  Crab.prototype.geom = function (env) {
    this.cell = env.cell;
    this.u = UNIT * this.size * env.cell;
    this.radius = this.u * 5.2;
  };

  Crab.prototype.run = function (env, ax, ay) {
    var lx = -Math.sin(this.heading), ly = Math.cos(this.heading);   // боковая ось
    if (ax != null) this.dir = ax * lx + ay * ly >= 0 ? 1 : -1;
    else {
      this.dir = this.rnd.sign();
      // не убегать за край
      var m = 90, nx = this.x + lx * this.dir * 120, ny = this.y + ly * this.dir * 120;
      if (nx < m || nx > env.W - m || ny < m || ny > env.H - m) this.dir = -this.dir;
    }
    this.state = 1; this.tau = 0;
    this.dur = this.rnd.range(RUN[0], RUN[1]);
    this.peak = this.rnd.range(RUN_SPEED[0], RUN_SPEED[1]) * this.speedMul;
  };

  Crab.prototype.onScare = function (dx, dy) { this.run(this.env, dx, dy); this.peak *= 1.1; };

  Crab.prototype.update = function (dt, env) {
    if (env.cell !== this.cell) this.geom(env);
    this.env = env;
    this.t += dt;
    var vx = 0, vy = 0, v = 0;

    if (this.state === 0) {
      this.timer -= dt;
      this.turnT -= dt;
      if (this.turnT <= 0) { this.turnT = this.rnd.range(2, 6); this.turn = this.rnd.range(-0.9, 0.9); }
      var st = U.clamp(this.turn, -1.2 * dt, 1.2 * dt);
      this.heading += st; this.turn -= st;
      if (this.held) { /* ждёт, пока отпустят */ }
      else if (this.excite > 0.3 && env.mouse.active) this.run(env, this.x - env.mouse.x, this.y - env.mouse.y);
      else if (this.timer <= 0) this.run(env);
    } else {
      this.tau += dt / this.dur;
      v = this.peak * Math.sin(Math.PI * Math.min(1, this.tau));     // рывок: разгон и остановка
      vx = -Math.sin(this.heading) * this.dir * v; vy = Math.cos(this.heading) * this.dir * v;
      this.walk += v * dt / (this.u * 0.75);
      if (this.tau >= 1) { this.state = 0; this.timer = this.rnd.range(PAUSE[0], PAUSE[1]); }
      if (this.asm >= 1 && this.rnd() < dt * 7) {
        var bx = -vx / (v || 1) * this.u * 5.4, by = -vy / (v || 1) * this.u * 5.4;
        env.dust(this.x + bx + this.rnd.range(-1, 1) * this.u, this.y + by + this.rnd.range(-1, 1) * this.u,
          -vx * 0.15, -vy * 0.15, this.rnd.range(0.5, 0.9), this.rnd.pick(['.', ',', "'"]), this.rnd() < 0.5 ? 0 : 1, 0.6);
      }
    }
    if (this.held) { this.state = 0; this.timer = Math.max(this.timer, 0.4); this.walk += dt * 11; }   // в руке перебирает ногами
    this.moving += ((this.state || this.held ? 1 : 0) - this.moving) * Math.min(1, dt * 8);
    Cr.move(this, dt, env, vx, vy);
    this.cos = Math.cos(this.heading); this.sin = Math.sin(this.heading);

    // клешни: на остановке щёлкают, при беге и рядом с курсором подняты
    var snap = U.noise1(this.t * 0.35, this.seed) > 0.45 ? 0.5 + 0.5 * Math.sin(this.t * CLAW_HZ * U.TAU / 2) : 0.15;
    var want = Math.max(this.state ? 0.35 : snap, this.excite);
    this.open += (want - this.open) * Math.min(1, dt * 14);

    var u = this.u, raise = 0.5 * this.excite * u;
    for (var s = 0; s < 2; s++) {
      var sg = s ? 1 : -1, o = s * 10;
      var wx = 3.7 * u + raise, wy = sg * (2.5 * u);
      var base = Math.atan2(-sg * 0.75, 0.66);                 // пальцы смотрят вперёд и к центру
      this.claw[o] = wx; this.claw[o + 1] = wy;
      for (var f = 0; f < 2; f++) {
        var a = base + (f ? 1 : -1) * (0.1 + 0.5 * this.open);
        this.claw[o + 2 + f * 2] = Math.cos(a) * 1.6 * u;
        this.claw[o + 3 + f * 2] = Math.sin(a) * 1.6 * u;
      }
    }
  };

  Crab.prototype.bounds = function (b) {
    var r = this.u * 6.4 + this.cell;
    b.x0 = this.x - r; b.y0 = this.y - r; b.x1 = this.x + r; b.y1 = this.y + r;
  };

  Crab.prototype.sample = function (x, y) {
    var dx = x - this.x, dy = y - this.y;
    var lx = dx * this.cos + dy * this.sin, ly = -dx * this.sin + dy * this.cos;
    var u = this.u, ex, ey, q;
    R.u = lx / this.cell + 30; R.v = ly / this.cell + 30;
    // глаза
    ex = lx - 1.8 * u; ey = Math.abs(ly) - 0.7 * u;
    if (ex * ex + ey * ey < 0.16 * u * u) { R.m = 0; return 1; }
    // панцирь: шире, чем длиннее
    ex = lx / (1.6 * u); ey = ly / (2.5 * u);
    q = ex * ex + ey * ey;
    if (q < 1) {
      R.m = 0;
      var n = U.noise2(R.u * 0.55, R.v * 0.55, this.seed);
      return 0.42 + 0.3 * (1 - q) + 0.2 * (n - 0.5) + (lx > 0.6 * u ? 0.12 : 0);
    }
    // клешни
    var s = ly < 0 ? 0 : 1, o = s * 10, c = this.claw;
    var px = lx - c[o], py = ly - c[o + 1];
    if (px * px + py * py < 0.8 * u * u) { R.m = 0; return 0.74; }
    for (var f = 0; f < 2; f++) {
      var fx = c[o + 2 + f * 2], fy = c[o + 3 + f * 2];
      var t = (px * fx + py * fy) / (fx * fx + fy * fy || 1);
      if (t < 0 || t > 1) continue;
      var qx = px - fx * t, qy = py - fy * t;
      var rr = 0.5 * u * (1 - 0.4 * t);
      if (qx * qx + qy * qy < rr * rr) { R.m = 0; return 0.86; }
    }
    return 0;
  };

  Crab.prototype.strokes = function (add) {
    var u = this.u, c = this.cos, s = this.sin, x = this.x, y = this.y, mv = this.moving;
    function line(ax, ay, bx, by, lum, kind) {
      add(x + ax * c - ay * s, y + ax * s + ay * c, x + bx * c - by * s, y + bx * s + by * c, 1, lum, kind, 1);
    }
    for (var sd = -1; sd <= 1; sd += 2) {
      // шесть ног: бедро наружу, голень с шагом
      for (var k = 0; k < 3; k++) {
        var ph = this.walk + k * 2.1 + (sd > 0 ? 0 : Math.PI);
        var hx = LEG_X[k] * u, kx = hx + (k - 1) * -0.9 * u;
        var reach = (5.3 + 0.45 * Math.cos(ph) * mv * this.dir * sd) * u;
        var tx = kx + (k - 1) * -1.1 * u + Math.sin(ph) * 0.5 * u * mv;
        line(hx, sd * 2.2 * u, kx, sd * 3.9 * u, 0.66, 1);
        line(kx, sd * 3.9 * u, tx, sd * reach, 0.56, 1);
      }
      // рука клешни: плечо → локоть → кисть
      var o = sd > 0 ? 10 : 0;
      line(1.1 * u, sd * 2.1 * u, 2.5 * u, sd * 3.4 * u, 0.7, 0);
      line(2.5 * u, sd * 3.4 * u, this.claw[o], this.claw[o + 1], 0.74, 0);
    }
  };

  var SPECIES = GP.species.crab = {
    id: 'crab', env: ENV, drift: DRIFT, label: 'Crab', count: COUNT, palette: PALETTE, hueJitter: 0.4,
    create: function (env, rnd, x, y) { return new Crab(env, rnd, x, y); }
  };
})(window.GP);
