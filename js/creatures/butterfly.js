/* Butterfly — вид сверху: четыре лопасти крыльев, тёмное тело, усики. */
(function (GP) {
  'use strict';

  // ------------------------------------------------------------ параметры
  var COUNT = 16;                       // стартовое число на 1080p
  var PALETTE = {
    dot: '#2f6fd6',
    materials: [
      { role: 'primary', stops: ['#132a66', '#1b3f8f', '#2f6fd6', '#8fd0ff'] }, // крылья
      { role: 'primary', stops: ['#0f2152', '#1b3f8f', '#2757b8'] }             // тело
    ]
  };
  var SPAN_CELLS = [3.2, 12];           // размах крыльев, ячеек
  var FLAP_HZ = [4, 6];                 // частота взмахов
  var FLAP_MIN = 0.25;                  // минимальная ширина крыльев при взмахе
  var SPEED = [20, 60];                 // px/с
  var TURN_RATE = 1.5;                  // рад/с, размах блуждания
  var FLY_FOR = [5, 14];                // сек полёта между зависаниями
  var HOVER_FOR = [1.0, 2.6];           // сек зависания
  var HOVER_FLAP = 1.4;                 // при зависании машет чаще
  var DUST_RATE = 2.6;                  // частиц в секунду на особь
  // ----------------------------------------------------------------------

  var U = GP.util, R = GP.Raster, Cr = GP.Creature, DEG = Math.PI / 180;

  function Butterfly(env, rnd, x, y) {
    var k = Math.pow(rnd(), 1.25);
    Cr.init(this, SPECIES, env, rnd, { depth: k, x: x, y: y });
    this.span = U.lerp(SPAN_CELLS[0], SPAN_CELLS[1], k);
    this.hz = rnd.range(FLAP_HZ[0], FLAP_HZ[1]);
    this.phase = rnd() * U.TAU;
    this.flap = 1;
    this.baseSpeed = rnd.range(SPEED[0], SPEED[1]);
    this.speed = this.baseSpeed;
    this.hover = false;
    this.stateT = rnd.range(1, FLY_FOR[1]);
    this.dustT = rnd();

    // форма крыльев своя у каждой особи; нормируется к полуразмаху = 1
    var fa = rnd.range(40, 62) * DEG, fMaj = rnd.range(0.5, 0.6), fMin = rnd.range(0.26, 0.36);
    var ha = rnd.range(112, 140) * DEG, hMaj = rnd.range(0.34, 0.46), hMin = rnd.range(0.22, 0.32);
    var fcx = 0.06 + Math.cos(fa) * fMaj * 0.86, fcy = Math.sin(fa) * fMaj * 0.86;
    var hcx = -0.06 + Math.cos(ha) * hMaj * 0.8, hcy = Math.sin(ha) * hMaj * 0.8;
    var ext = Math.max(
      fcy + Math.sqrt(Math.pow(fMaj * Math.sin(fa), 2) + Math.pow(fMin * Math.cos(fa), 2)),
      hcy + Math.sqrt(Math.pow(hMaj * Math.sin(ha), 2) + Math.pow(hMin * Math.cos(ha), 2)));
    var n = 1 / ext;
    this.f = { cx: fcx * n, cy: fcy * n, a: fMaj * n, b: fMin * n, cos: Math.cos(fa), sin: Math.sin(fa), reach: fMaj * 1.86 * n };
    this.h = { cx: hcx * n, cy: hcy * n, a: hMaj * n, b: hMin * n, cos: Math.cos(ha), sin: Math.sin(ha), reach: hMaj * 1.8 * n };
    this.rootF = 0.06 * n; this.rootH = -0.06 * n;
    // жилки: одна-две у переднего крыла, одна у заднего
    var v1 = fa - rnd.range(0.12, 0.3), v2 = fa + rnd.range(0.12, 0.28);
    this.veins = [Math.cos(v1), Math.sin(v1), Math.cos(v2), Math.sin(v2)];
    this.veinCount = rnd() < 0.55 ? 2 : 1;
    this.veinH = [Math.cos(ha), Math.sin(ha)];
    this.geom(env);
  }

  Butterfly.prototype.geom = function (env) {
    var cell = env.cell;
    this.cell = cell;
    this.hw = this.span * cell / 2;
    this.bodyHW = Math.max(0.5 * cell, this.hw * 0.07);
    var half = Math.max(1.1 * cell, this.hw * 0.36);
    this.bodyF = half; this.bodyB = -half * 0.9;
    this.veinW = 0.42 * cell / this.hw;
    this.radius = this.hw * 1.25 + cell;
  };

  Butterfly.prototype.update = function (dt, env) {
    if (env.cell !== this.cell) this.geom(env);
    this.t += dt;
    this.stateT -= dt;
    if (this.stateT <= 0) {
      this.hover = !this.hover;
      this.stateT = this.hover ? this.rnd.range(HOVER_FOR[0], HOVER_FOR[1]) : this.rnd.range(FLY_FOR[0], FLY_FOR[1]);
    }
    var target = this.hover ? 3 : this.baseSpeed;
    this.speed += (target - this.speed) * Math.min(1, dt * 2.2);

    // плавное блуждание
    var w = (U.noise1(this.t * 0.4, this.seed) - 0.5) * 2 * TURN_RATE +
      (U.noise1(this.t * 1.7, this.seed + 5) - 0.5) * 0.9;
    this.heading += w * dt;

    var hz = this.hz * (this.hover ? HOVER_FLAP : 1) * (1 + 0.7 * this.excite);
    this.phase += Math.PI * hz * dt;
    this.flap = Math.max(FLAP_MIN, Math.abs(Math.cos(this.phase)));

    var v = this.speed * this.speedMul;
    this.cos = Math.cos(this.heading); this.sin = Math.sin(this.heading);
    Cr.move(this, dt, env, this.cos * v, this.sin * v);

    // пыль: точки и короткие штрихи у крыльев
    this.dustT -= dt * DUST_RATE * (0.5 + this.depth);
    if (this.dustT <= 0 && this.asm >= 1) {
      this.dustT += 1;
      var side = this.rnd.sign();
      var lx = -this.hw * this.rnd.range(0.2, 0.9), ly = side * this.hw * this.rnd.range(0.5, 1.1) * this.flap;
      env.dust(this.x + lx * this.cos - ly * this.sin, this.y + lx * this.sin + ly * this.cos,
        -this.cos * 6, -this.sin * 6, this.rnd.range(0.5, 1.5),
        this.rnd() < 0.6 ? '/' : this.rnd.pick(['.', ',', "'"]),
        this.rnd() < 0.5 ? 0 : 1, 0.35 + 0.5 * this.depth);
    }
  };

  Butterfly.prototype.onScare = function () { this.hover = false; this.stateT = this.rnd.range(3, 8); };

  Butterfly.prototype.bounds = function (b) {
    var r = this.radius;
    b.x0 = this.x - r; b.y0 = this.y - r; b.x1 = this.x + r; b.y1 = this.y + r;
  };

  function wing(self, w, bx, by, rootX, base, gain, veins, veinCount) {
    var px = bx - w.cx, py = by - w.cy;
    var rx = px * w.cos + py * w.sin, ry = -px * w.sin + py * w.cos;
    if ((rx * rx) / (w.a * w.a) + (ry * ry) / (w.b * w.b) >= 1) return 0;
    var ox = bx - rootX;
    var d = Math.sqrt(ox * ox + by * by) / w.reach;
    var lum = base + gain * (d > 1 ? 1 : d);          // к краю ярче, у основания темнее
    if (self.hw > self.cell * 2.6) {
      for (var k = 0; k < veinCount; k++) {
        var vx = veins[k * 2], vy = veins[k * 2 + 1];
        if (ox * vx + by * vy > 0 && Math.abs(ox * vy - by * vx) < self.veinW) { lum += 0.2; break; }
      }
    }
    return lum;
  }

  Butterfly.prototype.sample = function (x, y) {
    var dx = x - this.x, dy = y - this.y;
    var lx = dx * this.cos + dy * this.sin;
    var ly = -dx * this.sin + dy * this.cos;
    var ay = Math.abs(ly);
    if (ay < this.bodyHW && lx > this.bodyB && lx < this.bodyF) {
      R.m = 1; R.u = lx / this.cell + 64; R.v = 0;
      return 0.5;
    }
    var bx = lx / this.hw, by = ay / (this.hw * this.flap);
    if (by > 1.05 || bx > 1.3 || bx < -1.3) return 0;
    var l = wing(this, this.f, bx, by, this.rootF, 0.26, 0.72, this.veins, this.veinCount);
    if (l === 0) l = wing(this, this.h, bx, by, this.rootH, 0.24, 0.64, this.veinH, 1);
    if (l === 0) return 0;
    R.m = 0; R.u = lx / this.cell; R.v = by * this.hw / this.cell;
    return l;
  };

  Butterfly.prototype.strokes = function (add) {
    if (this.hw < this.cell * 2.4) return;
    // усики: одна-две точки перед головой
    var hx = this.bodyF, len = Math.max(this.cell * 1.2, this.hw * 0.3);
    for (var s = -1; s <= 1; s += 2) {
      var ex = hx + len, ey = s * len * 0.55;
      add(this.x + hx * this.cos, this.y + hx * this.sin,
        this.x + ex * this.cos - ey * this.sin, this.y + ex * this.sin + ey * this.cos, 0, 0.45, 2, 0.8);
    }
  };

  var SPECIES = GP.species.butterfly = {
    id: 'butterfly', label: 'Butterfly', count: COUNT, palette: PALETTE, hueJitter: 0.7,
    create: function (env, rnd, x, y) { return new Butterfly(env, rnd, x, y); }
  };
})(window.GP);
