/* Starfish — вид сверху: диск и пять конических лучей с рядом светлых бугорков.
 * Ползёт очень медленно, лучи плавно изгибаются, в руке — извиваются. */
(function (GP) {
  'use strict';

  // ------------------------------------------------------------ параметры
  var COUNT = 7;
  var ENV = 'shore';         // среда вида (см. js/ambient.js)
  var DRIFT = 0.3;           // насколько течение сносит существо
  var PALETTE = {
    dot: '#ee6e44',
    materials: [
      { role: 'error', rotate: 12, stops: ['#6a1c14', '#c4402a', '#ee6e44', '#ffb08a'] },     // тело
      { role: 'on_surface', stops: ['#8a7a68', '#e6d2b8', '#fff2e0'] },                       // бугорки
      { role: 'on_surface_variant', stops: ['#5a4630', '#a88a5a', '#e6d3a8'] }                // среда: берег
    ]
  };
  var ARMS = 5;
  var UNIT = 1.8;
  var SIZE = [0.7, 1.3];
  var ARM_LEN = 4.0;         // длина луча, единиц тела
  var DISC = 1.0;            // радиус диска
  var SPEED = [3, 9];        // px/с — морские звёзды очень неторопливы
  // ----------------------------------------------------------------------

  var U = GP.util, R = GP.Raster, Cr = GP.Creature;

  function Starfish(env, rnd, x, y) {
    var k = rnd();
    Cr.init(this, SPECIES, env, rnd, { depth: k, x: x, y: y });
    this.size = U.lerp(SIZE[0], SIZE[1], k);
    this.baseSpeed = rnd.range(SPEED[0], SPEED[1]);
    this.curl = new Float32Array(ARMS);
    this.ph = rnd() * U.TAU;
    this.drift = rnd.range(-1, 1);
    this.geom(env);
  }

  Starfish.prototype.geom = function (env) {
    this.cell = env.cell;
    this.u = UNIT * this.size * env.cell;
    this.radius = this.u * (ARM_LEN + 0.6);
  };

  Starfish.prototype.update = function (dt, env) {
    if (env.cell !== this.cell) this.geom(env);
    this.t += dt;
    var free = !this.held && !this.thrown;
    if (free) this.heading += (U.noise1(this.t * 0.15, this.seed) - 0.5) * 0.35 * dt;
    // лучи изгибаются по очереди; в руке и в полёте извиваются сильнее
    var amp = free ? 0.4 : 1.1;
    for (var k = 0; k < ARMS; k++) {
      this.curl[k] = (Math.sin(this.t * 0.45 + k * 1.3 + this.ph) * 0.8 + 0.3 * Math.sin(this.t * 0.9 + k * 2.1)) * amp;
    }
    var v = this.baseSpeed * this.speedMul * (0.35 + 0.65 * U.noise1(this.t * 0.25, this.seed + 3));
    var a = this.heading * 0 + this.drift * 0.6 + this.t * 0.02;     // ползёт в своём направлении, не в направлении луча
    Cr.move(this, dt, env, Math.cos(a + this.seed) * v, Math.sin(a + this.seed) * v);
    this.cos = Math.cos(this.heading); this.sin = Math.sin(this.heading);
  };

  Starfish.prototype.bounds = function (b) {
    var r = this.radius;
    b.x0 = this.x - r; b.y0 = this.y - r; b.x1 = this.x + r; b.y1 = this.y + r;
  };

  Starfish.prototype.sample = function (x, y) {
    var dx = x - this.x, dy = y - this.y;
    var lx = dx * this.cos + dy * this.sin, ly = -dx * this.sin + dy * this.cos;
    var u = this.u, d = Math.sqrt(lx * lx + ly * ly), L = ARM_LEN * u;
    if (d > L + 0.1 * u) return 0;
    R.u = lx / this.cell + 40; R.v = ly / this.cell + 40;
    if (d < DISC * u) {
      // диск с пятнышком в центре
      R.m = d < 0.2 * u ? 1 : 0;
      return d < 0.2 * u ? 0.8 : 0.62 + 0.2 * (1 - d / (DISC * u));
    }
    var step = U.TAU / ARMS, ang = Math.atan2(ly, lx), k = Math.round(ang / step);
    var kk = ((k % ARMS) + ARMS) % ARMS, f = d / L;
    var da = ang - k * step - this.curl[kk] * f * f;           // луч изгибается к концу
    var lat = d * Math.sin(da), along = d * Math.cos(da);
    if (along < 0) return 0;
    var w = (0.72 * Math.pow(Math.max(0, 1 - f), 0.7) + 0.1) * u;   // сужается к кончику
    if (Math.abs(lat) >= w) return 0;
    // ряд бугорков вдоль луча
    if (Math.abs(lat) < 0.2 * u && f > 0.18 && (along / (0.68 * u)) % 1 < 0.42) { R.m = 1; return 0.88; }
    R.m = 0;
    return 0.46 + 0.32 * (1 - Math.abs(lat) / w) + 0.1 * (1 - f);
  };

  var SPECIES = GP.species.starfish = {
    id: 'starfish', env: ENV, drift: DRIFT, label: 'Starfish', count: COUNT, palette: PALETTE,
    hueJitter: 0.8, flicker: 0.16, separation: 0.8,
    create: function (env, rnd, x, y) { return new Starfish(env, rnd, x, y); }
  };
})(window.GP);
