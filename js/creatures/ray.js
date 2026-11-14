/* Ray — вид сверху: широкие крылья-плавники ромбом, длинный тонкий хвост, головные «рога».
 * Парит над мелководьем; по крыльям от тела к концам бежит волна. */
(function (GP) {
  'use strict';

  // ------------------------------------------------------------ параметры
  var COUNT = 6;
  var ENV = 'shore';         // среда вида (см. js/ambient.js)
  var DRIFT = 0.25;          // насколько течение сносит существо
  var PALETTE = {
    dot: '#6a86a8',
    materials: [
      { role: 'secondary', stops: ['#1c2430', '#3a4a60', '#6a86a8', '#b4cce0'] },       // спина
      { role: 'on_surface', stops: ['#8a93a0', '#cfd6e0', '#f0f3f7'] },                 // светлые пятна
      { role: 'on_surface_variant', stops: ['#5a4630', '#a88a5a', '#e6d3a8'] }          // среда: берег
    ]
  };
  var UNIT = 1.05;
  var SIZE = [0.7, 1.3];
  var SPEED = [18, 36];      // px/с
  var FLAP_HZ = [0.45, 0.7]; // взмахов в секунду
  var SPAN = 5.0;            // полуразмах, единиц тела
  var TURN = 0.3;            // рад/с — размах блуждания
  // ----------------------------------------------------------------------

  var U = GP.util, R = GP.Raster, Cr = GP.Creature;

  function Ray(env, rnd, x, y) {
    var k = rnd();
    Cr.init(this, SPECIES, env, rnd, { depth: k, x: x, y: y });
    this.size = U.lerp(SIZE[0], SIZE[1], k);
    this.baseSpeed = rnd.range(SPEED[0], SPEED[1]);
    this.hz = rnd.range(FLAP_HZ[0], FLAP_HZ[1]);
    this.phase = rnd() * U.TAU;
    this.flap = 0;
    this.geom(env);
    this.cos = Math.cos(this.heading); this.sin = Math.sin(this.heading);
  }

  Ray.prototype.geom = function (env) {
    this.cell = env.cell;
    this.u = UNIT * this.size * env.cell;
    this.radius = this.u * 7;
  };

  Ray.prototype.update = function (dt, env) {
    if (env.cell !== this.cell) this.geom(env);
    this.t += dt;
    var free = !this.held && !this.thrown;
    if (free) this.heading += (U.noise1(this.t * 0.15, this.seed) - 0.5) * 2 * TURN * dt;
    this.phase += dt * U.TAU * this.hz * (free ? 1 : 2.4) * (1 + 0.5 * this.excite);
    this.flap = Math.sin(this.phase);
    // каждый взмах подталкивает вперёд
    var v = this.baseSpeed * this.speedMul * (0.7 + 0.45 * Math.max(0, Math.sin(this.phase + 0.8)));
    this.cos = Math.cos(this.heading); this.sin = Math.sin(this.heading);
    Cr.move(this, dt, env, this.cos * v, this.sin * v);
    this.cos = Math.cos(this.heading); this.sin = Math.sin(this.heading);
  };

  Ray.prototype.bounds = function (b) {
    var r = this.radius;
    b.x0 = this.x - r; b.y0 = this.y - r; b.x1 = this.x + r; b.y1 = this.y + r;
  };

  Ray.prototype.sample = function (x, y) {
    var dx = x - this.x, dy = y - this.y;
    var lx = dx * this.cos + dy * this.sin, ly = -dx * this.sin + dy * this.cos;
    var u = this.u, span = SPAN * u * (1 - 0.1 * this.flap), ay = Math.abs(ly) / span;
    R.u = lx / this.cell + 40; R.v = ly / this.cell + 40;

    // хвост: тонкая линия с волной
    var tt = (-lx - 1.9 * u) / (4.6 * u);
    if (tt > 0 && tt < 1) {
      var cy = Math.sin(this.phase * 0.7 - tt * 3.2) * 0.55 * u * tt;
      if (Math.abs(ly - cy) < (0.2 - 0.15 * tt) * u) { R.m = 0; return 0.45; }
    }
    if (ay <= 1) {
      // бегущая по крылу волна сдвигает края
      var wave = Math.sin(this.phase - ay * 2.3) * 0.6 * u * ay;
      var xf = 2.0 * u - 2.4 * u * Math.pow(ay, 1.3) + wave;
      var xb = -1.5 * u - 0.3 * u * ay + wave;
      if (lx >= xb && lx <= xf) {
        // светлые пятна у головы
        var sx = lx - 0.35 * u, sy = Math.abs(ly) - 0.6 * u;
        if (sx * sx + sy * sy < 0.09 * u * u) { R.m = 1; return 0.7; }
        R.m = 0;
        var lum = 0.4 + 0.32 * (1 - ay) + (lx > xf - 0.4 * u ? 0.12 : 0) + (Math.abs(ly) < 0.28 * u ? 0.1 : 0);
        return lum - (lx < xb + 0.3 * u ? 0.1 : 0);                         // задний край темнее
      }
    }
    // головные плавники-«рога»
    var hy = Math.abs(ly) - 0.55 * u;
    if (lx > 1.7 * u && lx < 2.8 * u && Math.abs(hy) < 0.2 * u) { R.m = 0; return 0.55; }
    return 0;
  };

  var SPECIES = GP.species.ray = {
    id: 'ray', env: ENV, drift: DRIFT, label: 'Ray', count: COUNT, palette: PALETTE,
    hueJitter: 0.4, flicker: 0.14, separation: 0.7,
    create: function (env, rnd, x, y) { return new Ray(env, rnd, x, y); }
  };
})(window.GP);
