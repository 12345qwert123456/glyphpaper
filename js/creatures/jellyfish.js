/* Jellyfish — вид сбоку: купол-полусфера и 4–6 щупалец-цепочек из ячеек. */
(function (GP) {
  'use strict';

  // ------------------------------------------------------------ параметры
  var COUNT = 10;
  var PALETTE = {
    dot: '#e56fcf',
    materials: [
      { role: 'tertiary', stops: ['#5c1d5a', '#c13fa0', '#e56fcf', '#ffc2f1'] }, // купол
      { role: 'tertiary', stops: ['#742877', '#c13fa0', '#f0a6e2'] }             // щупальца
    ]
  };
  var DOME_CELLS = 4.0;                 // радиус купола, ячеек (при размере 1)
  var TENTACLES = [4, 5];
  var TENT_NODES = 8;                   // звеньев в щупальце
  var TENT_SEG_CELLS = 1.15;            // длина звена
  var PULSE_PERIOD = [2.6, 4.0];        // сек
  var THRUST = 60;                      // px/с — рывок вверх при сжатии купола
  var DRAG = 1.9;                       // 1/с
  var SINK = 9;                         // px/с — дрейф вниз
  var DRIFT = 8;                        // px/с — боковой снос
  // ----------------------------------------------------------------------

  var U = GP.util, R = GP.Raster, Cr = GP.Creature;

  function Jelly(env, rnd, x, y) {
    Cr.init(this, SPECIES, env, rnd, { x: x, y: y });
    this.period = rnd.range(PULSE_PERIOD[0], PULSE_PERIOD[1]);
    this.p = rnd();
    this.v = 0;
    this.c = 0;
    this.tilt = rnd.range(-0.25, 0.25);
    this.sink = rnd.range(0.7, 1.4);
    this.nt = TENTACLES[0] + Math.floor(rnd() * (TENTACLES[1] - TENTACLES[0] + 1));
    this.tx = new Float32Array(this.nt * TENT_NODES);
    this.ty = new Float32Array(this.nt * TENT_NODES);
    this.tph = [];
    for (var k = 0; k < this.nt; k++) this.tph.push(rnd() * U.TAU);
    this.fresh = true;
    this.geom(env);
  }

  Jelly.prototype.geom = function (env) {
    this.cell = env.cell;
    this.R0 = DOME_CELLS * this.size * env.cell;
    this.seg = TENT_SEG_CELLS * env.cell * (0.7 + 0.3 * this.size);
    this.tentLen = this.seg * TENT_NODES;
    this.radius = this.R0 * 1.5;
  };

  Jelly.prototype.shift = function (sx, sy) {
    for (var i = 0; i < this.tx.length; i++) { this.tx[i] += sx; this.ty[i] += sy; }
  };

  Jelly.prototype.onScare = function () { this.p = 0.99; };

  Jelly.prototype.update = function (dt, env) {
    if (env.cell !== this.cell) this.geom(env);
    this.t += dt;

    // пульс: быстрое сжатие — рывок вверх, затем расслабление и дрейф вниз
    this.p += dt / this.period * (1 + 0.9 * this.excite);
    if (this.p >= 1) {
      this.p -= 1;
      this.v += THRUST * this.speedMul;
      if (this.asm >= 1) {
        for (var n = 0; n < 3; n++) {
          env.dust(this.x + this.rnd.range(-1, 1) * this.R0, this.y + this.rnd.range(0, 1.5) * this.cell,
            this.rnd.range(-8, 8), 14, this.rnd.range(0.6, 1.3), this.rnd.pick(['.', ':', "'"]), this.rnd() < 0.5 ? 0 : 1, 0.55);
        }
      }
    }
    this.c = this.p < 0.16 ? U.smooth(this.p / 0.16) : 1 - U.smooth((this.p - 0.16) / 0.5);
    this.v *= Math.exp(-DRAG * dt);

    var want = (U.noise1(this.t * 0.12, this.seed) - 0.5) * 0.9;
    this.tilt += (want - this.tilt) * Math.min(1, dt * 0.8);
    var ux = Math.sin(this.tilt), uy = -Math.cos(this.tilt);        // ось «вверх»
    this.rx = Math.cos(this.tilt); this.ry = Math.sin(this.tilt);   // ось «вправо»
    this.dnx = -ux; this.dny = -uy;                                 // ось «вниз»
    var drift = (U.noise1(this.t * 0.07, this.seed + 9) - 0.5) * 2 * DRIFT;

    Cr.move(this, dt, env, ux * this.v + drift, uy * this.v + SINK * this.sink * this.speedMul);

    this.domeRx = this.R0 * (1 - 0.2 * this.c);
    this.domeRy = this.R0 * 0.88 * (1 + 0.2 * this.c);

    // щупальца: каждое звено тянется за предыдущим и запаздывает по фазе
    for (var k = 0; k < this.nt; k++) {
      var off = this.nt === 1 ? 0 : (k / (this.nt - 1) * 2 - 1) * 0.62;
      var px = this.x + this.rx * off * this.domeRx + this.dnx * this.domeRy * 0.1;
      var py = this.y + this.ry * off * this.domeRx + this.dny * this.domeRy * 0.1;
      for (var j = 0; j < TENT_NODES; j++) {
        var i = k * TENT_NODES + j;
        var sway = Math.sin(this.t * 1.5 - j * 0.75 + this.tph[k]) * this.seg * 0.34;
        var gx = px + this.dnx * this.seg + this.rx * sway;
        var gy = py + this.dny * this.seg + this.ry * sway;
        if (this.fresh) { this.tx[i] = gx; this.ty[i] = gy; }
        else {
          var f = Math.min(1, dt * (9 - j * 0.8));
          this.tx[i] += (gx - this.tx[i]) * f; this.ty[i] += (gy - this.ty[i]) * f;
          var dx = this.tx[i] - px, dy = this.ty[i] - py;
          var d = Math.sqrt(dx * dx + dy * dy), mx = this.seg * 1.4;
          if (d > mx) { this.tx[i] = px + dx / d * mx; this.ty[i] = py + dy / d * mx; }
        }
        px = this.tx[i]; py = this.ty[i];
      }
    }
    this.fresh = false;
    this.hx = this.x + this.dnx * this.tentLen * 0.4; this.hy = this.y + this.dny * this.tentLen * 0.4;
  };

  Jelly.prototype.bounds = function (b) {
    var r = this.R0 * 1.15 + this.cell;
    var x0 = this.x - r, x1 = this.x + r, y0 = this.y - r, y1 = this.y + r;
    for (var i = 0; i < this.tx.length; i++) {
      if (this.tx[i] < x0) x0 = this.tx[i]; if (this.tx[i] > x1) x1 = this.tx[i];
      if (this.ty[i] < y0) y0 = this.ty[i]; if (this.ty[i] > y1) y1 = this.ty[i];
    }
    b.x0 = x0 - this.cell; b.y0 = y0 - this.cell; b.x1 = x1 + this.cell; b.y1 = y1 + this.cell;
  };

  Jelly.prototype.sample = function (x, y) {
    var dx = x - this.x, dy = y - this.y;
    var lx = dx * this.rx + dy * this.ry;        // поперёк купола
    var ly = dx * this.dnx + dy * this.dny;      // вниз по оси
    var rx = this.domeRx, ry = this.domeRy, skirt = ry * 0.24;
    if (ly > skirt || ly < -ry || lx > rx || lx < -rx) return 0;
    R.m = 0; R.u = lx / this.cell + 40; R.v = ly / this.cell + 40;
    if (ly > 0) {
      // юбка под куполом, чуть сужается
      if (Math.abs(lx) > rx * (1 - 0.12 * ly / skirt)) return 0;
      R.a = 0.85;
      return 0.7 - 0.3 * (ly / skirt);
    }
    var q = (lx * lx) / (rx * rx) + (ly * ly) / (ry * ry);
    if (q >= 1) return 0;
    // купол полупрозрачный в середине, светлее по краю и у нижней кромки
    R.a = 0.5 + 0.5 * q;
    return 0.28 + 0.58 * q * q + (ly > -ry * 0.2 ? 0.14 : 0);
  };

  Jelly.prototype.strokes = function (add) {
    for (var k = 0; k < this.nt; k++) {
      var off = this.nt === 1 ? 0 : (k / (this.nt - 1) * 2 - 1) * 0.62;
      var px = this.x + this.rx * off * this.domeRx, py = this.y + this.ry * off * this.domeRx;
      for (var j = 0; j < TENT_NODES; j++) {
        var i = k * TENT_NODES + j;
        add(px, py, this.tx[i], this.ty[i], 1, 0.7 - 0.06 * j, (k + j) % 3 === 0 ? 2 : 1, 0.62 - 0.055 * j);
        px = this.tx[i]; py = this.ty[i];
      }
    }
  };

  var SPECIES = GP.species.jellyfish = {
    id: 'jellyfish', label: 'Jellyfish', count: COUNT, palette: PALETTE,
    create: function (env, rnd, x, y) { return new Jelly(env, rnd, x, y); }
  };
})(window.GP);
