/* Snake — вид сверху: цепочка из 14 узлов, косой узор на чешуе, раздвоенный язык.
 * Ползёт волнами, замирает и пробует воздух. Физика цепочки общая с кои (chain.js):
 * змею можно взять за голову, середину или хвост. */
(function (GP) {
  'use strict';

  // ------------------------------------------------------------ параметры
  var COUNT = 4;
  var ENV = 'reeds';         // среда вида (см. js/ambient.js)
  var DRIFT = 0.1;           // насколько ветер сносит существо
  var PALETTE = {
    dot: '#5ea244',
    materials: [
      { role: 'secondary', toward: [100, 0.55], stops: ['#25421a', '#4e8a2c', '#8cc94e', '#d8f08c'] }, // чешуя
      { role: 'tertiary', stops: ['#120d06', '#2a1f0e', '#4e3a18'] },                                  // ромбы узора
      { role: 'error', stops: ['#6a1616', '#c8322e', '#ff6b5e'] },                                     // язык
      { role: 'on_surface_variant', stops: ['#1f4a48', '#4f9a8f', '#b4e6da'] }   // среда: камыши
    ]
  };
  var NODES = 28;
  var LENGTH_CELLS = [34, 52];          // длина, ячеек
  var DIAMOND = 5.4;                    // длина одного ромба узора, ячеек
  var HEAD = 0.13;                      // доля длины, занятая головой

  /** Полуширина тела (ячеек) в точке t = 0..1 вдоль змеи: голова с «челюстью», тонкая шея,
   *  плавное утолщение к середине и длинный сходящий на нет хвост. */
  function profile(t) {
    if (t < 0.05) return 0.55 + 0.4 * (t / 0.05);
    if (t < HEAD) return 0.95 - 0.5 * U.smooth((t - 0.05) / (HEAD - 0.05));
    var body = 0.45 + 0.5 * Math.pow(Math.sin(Math.PI * Math.min(1, (t - HEAD) / 0.95)), 0.6);
    var tail = t > 0.78 ? 1 - Math.pow((t - 0.78) / 0.22, 1.2) * 0.94 : 1;
    return body * tail;
  }
  var SPEED = [18, 42];                 // px/с
  var SWAY = 1.25;                      // рад — на сколько курс качается вправо-влево: даёт змеиные изгибы
  var SWAY_HZ = [0.6, 0.9];             // рад/с — частота покачивания курса
  var WAVE = 0.5;                       // сдвиг фазы мелкой волны между узлами
  var WAVE_AMP = 0.3;                   // амплитуда мелкой волны, ячеек
  var TONGUE_EVERY = [1.4, 4];          // сек между высовываниями языка
  // ----------------------------------------------------------------------

  var U = GP.util, R = GP.Raster, Cr = GP.Creature;

  function Snake(env, rnd, x, y) {
    var k = rnd();
    Cr.init(this, SPECIES, env, rnd, { depth: k, x: x, y: y });
    this.n = NODES;
    this.len = U.lerp(LENGTH_CELLS[0], LENGTH_CELLS[1], k);
    this.scale = this.len / 24;
    this.o1 = rnd() * 50;
    this.baseSpeed = rnd.range(SPEED[0], SPEED[1]);
    this.mult = 1; this.mode = 0; this.modeT = rnd.range(2, 8);
    this.sFreq = rnd.range(SWAY_HZ[0], SWAY_HZ[1]); this.sPhase = rnd() * U.TAU;
    this.osc = 0;                         // текущее качание курса
    this.wave = rnd() * U.TAU;
    this.tongueT = rnd.range(0.5, 3); this.tongue = 0;
    this.nx = new Float32Array(NODES); this.ny = new Float32Array(NODES);
    this.dx = new Float32Array(NODES); this.dy = new Float32Array(NODES);
    this.r = new Float32Array(NODES);
    this.ex = new Float32Array(NODES); this.ey = new Float32Array(NODES); this.il = new Float32Array(NODES);
    this.vx = new Float32Array(NODES); this.vy = new Float32Array(NODES);
    this.ox = new Float32Array(NODES); this.oy = new Float32Array(NODES);
    this.grabNode = 0;
    this.geom(env);
    // длинную змею ставим целиком в кадр
    this.x = U.clamp(this.x, this.radius * 0.6, Math.max(this.radius * 0.6, env.W - this.radius * 0.6));
    this.y = U.clamp(this.y, this.radius * 0.35, Math.max(this.radius * 0.35, env.H - this.radius * 0.35));
    // сразу в изгибах: тело раскладывается по следу, который оставила бы голова за прошлые секунды
    var px = this.x, py = this.y, v0 = this.baseSpeed * this.speedMul;
    this.base0 = this.heading;
    for (var i = 0; i < NODES; i++) {
      this.nx[i] = px; this.ny[i] = py;
      this.dx[i] = px; this.dy[i] = py;
      var h = this.base0 + SWAY * Math.sin((this.t - i * this.seg / Math.max(8, v0)) * this.sFreq + this.sPhase);
      px -= Math.cos(h) * this.seg; py -= Math.sin(h) * this.seg;
    }
    this.heading = this.base0 + SWAY * Math.sin(this.t * this.sFreq + this.sPhase);
    this.osc = SWAY * Math.sin(this.t * this.sFreq + this.sPhase);
  }

  Snake.prototype.geom = function (env) {
    var cell = env.cell;
    this.cell = cell;
    this.seg = this.len * cell / (NODES - 1);
    this.segCells = this.seg / cell;
    for (var i = 0; i < NODES; i++) this.r[i] = profile(i / (NODES - 1)) * this.scale * cell;
    this.radius = this.len * cell * 0.6;
  };

  Snake.prototype.onScare = function () { this.mode = 0; this.mult = 2.2; this.modeT = 1.4; this.tongue = 0.4; };

  GP.Chain.install(Snake.prototype);

  Snake.prototype.update = function (dt, env) {
    if (env.cell !== this.cell) this.geom(env);
    this.t += dt;
    var i, v, free = !this.held && !this.thrown;

    if (!free) {
      this.physics(dt, env);
      v = this.baseSpeed * this.speedMul * (this.held ? 2.6 : 1.5);
    } else {
      // ползёт змейкой: курс медленно блуждает и качается вправо-влево — тело, идущее по
      // следу головы, само складывается в S-образные изгибы
      var base = this.heading - this.osc + (U.noise1(this.t * 0.2, this.seed) - 0.5) * 0.9 * dt;
      this.osc = SWAY * Math.sin(this.t * this.sFreq + this.sPhase) * Math.min(1, this.mult * 1.2);
      this.heading = base + this.osc;
      // ползёт, потом замирает и пробует воздух
      this.modeT -= dt;
      if (this.modeT <= 0) {
        this.mode = 1 - this.mode;
        this.modeT = this.mode ? this.rnd.range(1, 2.6) : this.rnd.range(3, 9);
        if (this.mode) this.tongue = 0.3;
      }
      var target = this.mode ? 0.08 : 1;
      this.mult += (target - this.mult) * Math.min(1, dt * (this.mode ? 3 : 1.6));
      v = this.baseSpeed * this.speedMul * this.mult;
      Cr.move(this, dt, env, Math.cos(this.heading) * v, Math.sin(this.heading) * v);

      // голова ведёт, остальные узлы тянутся следом
      this.nx[0] = this.x; this.ny[0] = this.y;
      for (i = 1; i < NODES; i++) {
        var ddx = this.nx[i] - this.nx[i - 1], ddy = this.ny[i] - this.ny[i - 1];
        var d = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
        this.nx[i] = this.nx[i - 1] + ddx / d * this.seg;
        this.ny[i] = this.ny[i - 1] + ddy / d * this.seg;
      }
    }

    // волна ползёт от головы к хвосту
    this.wave += (2.4 + v * 0.1) * dt;
    var amp = this.cell * WAVE_AMP * (0.4 + 0.6 * Math.min(1, v / 12));
    if (!free) amp *= 0.55;
    for (i = 0; i < NODES; i++) {
      var p = i === 0 ? 1 : i;
      var tx = this.nx[p - 1] - this.nx[p], ty = this.ny[p - 1] - this.ny[p];
      var tl = Math.sqrt(tx * tx + ty * ty) || 1;
      var off = amp * Math.sin(this.wave - i * WAVE);
      this.dx[i] = this.nx[i] - ty / tl * off;
      this.dy[i] = this.ny[i] + tx / tl * off;
    }
    // нарисованное тело не длиннее хребта: волна гнёт, но не растягивает
    for (i = 1; i < NODES; i++) {
      var sx = this.dx[i] - this.dx[i - 1], sy = this.dy[i] - this.dy[i - 1];
      var sl = Math.sqrt(sx * sx + sy * sy), mx = this.seg * 1.12;
      if (sl > mx) { this.dx[i] = this.dx[i - 1] + sx / sl * mx; this.dy[i] = this.dy[i - 1] + sy / sl * mx; }
    }
    for (i = 0; i < NODES - 1; i++) {
      this.ex[i] = this.dx[i + 1] - this.dx[i]; this.ey[i] = this.dy[i + 1] - this.dy[i];
      this.il[i] = 1 / (this.ex[i] * this.ex[i] + this.ey[i] * this.ey[i] || 1);
    }
    this.buildOcc();
    this.hx = this.dx[NODES >> 1]; this.hy = this.dy[NODES >> 1];       // середина тела — для подсветки сетки

    // язык высовывается и дрожит
    this.tongueT -= dt * (1 + this.excite);
    if (this.tongueT <= 0) { this.tongueT = this.rnd.range(TONGUE_EVERY[0], TONGUE_EVERY[1]); this.tongue = 0.28; }
    if (this.tongue > 0) this.tongue -= dt;

    // пыль: травинки у головы, когда ползёт
    if (this.asm >= 1 && free && v > 8 && this.rnd() < dt * 3) {
      env.dust(this.dx[2] + this.rnd.range(-1, 1) * this.cell, this.dy[2] + this.rnd.range(-1, 1) * this.cell,
        0, 0, this.rnd.range(0.4, 0.9), this.rnd.pick(['.', ',', "'"]), 0, 0.5);
    }
  };

  /** Змею можно ухватить за любое место тела. */
  Snake.prototype.hit = function (x, y) {
    var best = 9;
    for (var i = 0; i < NODES; i++) {
      var dx = x - this.dx[i], dy = y - this.dy[i];
      var q = Math.sqrt(dx * dx + dy * dy) / (this.r[i] + this.cell * 1.5);
      if (q < best) best = q;
    }
    return best;
  };

  Snake.prototype.bounds = function (b) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (var i = 0; i < NODES; i++) {
      if (this.dx[i] < x0) x0 = this.dx[i]; if (this.dx[i] > x1) x1 = this.dx[i];
      if (this.dy[i] < y0) y0 = this.dy[i]; if (this.dy[i] > y1) y1 = this.dy[i];
    }
    var m = this.r[6] + this.cell * 3;
    b.x0 = x0 - m; b.y0 = y0 - m; b.x1 = x1 + m; b.y1 = y1 + m;
  };

  Snake.prototype.sample = function (x, y) {
    if (!this.occHit(x, y)) return 0;
    var best = 2, bi = -1, bt = 0, side = 1, brr = 1, i, px, py, t, qx, qy, rr, q;
    for (i = 0; i < NODES - 1; i++) {
      px = x - this.dx[i]; py = y - this.dy[i];
      t = (px * this.ex[i] + py * this.ey[i]) * this.il[i];
      if (t < 0) t = 0; else if (t > 1) t = 1;
      qx = px - this.ex[i] * t; qy = py - this.ey[i] * t;
      rr = this.r[i] + (this.r[i + 1] - this.r[i]) * t;
      q = (qx * qx + qy * qy) / (rr * rr);
      if (q < 1 && q < best) {
        best = q; bi = i; bt = t; brr = rr;
        side = this.ex[i] * py - this.ey[i] * px < 0 ? -1 : 1;
      }
    }
    if (bi < 0) return 0;
    var uu = (bi + bt) * this.segCells, lat = Math.sqrt(best), vv = side * lat * brr / this.cell;
    R.u = uu; R.v = vv + 32;
    // глаза: тёмные точки по бокам головы
    if (uu > 0.045 * this.len && uu < 0.075 * this.len && lat > 0.4 && lat < 0.9) { R.m = 1; return 0.06; }
    var core = 1 - best;
    if (uu < HEAD * this.len) { R.m = 0; return 0.74 + 0.2 * core - (lat > 0.85 ? 0.14 : 0); }      // голова светлее и без узора
    // тёмные ромбы по спине: вдоль тела чередуются ромб и светлый промежуток
    var f = uu / DIAMOND - Math.floor(uu / DIAMOND), tri = 1 - Math.abs(2 * f - 1);
    if (lat < tri * 0.95 && tri > 0.22) { R.m = 1; return 0.2 + 0.18 * core; }
    R.m = 0;
    return 0.62 + 0.3 * core - (lat > 0.88 ? 0.12 : 0);
  };

  Snake.prototype.strokes = function (add) {
    if (this.tongue <= 0) return;
    // раздвоенный язык: длинный штрих и две вилки
    var hx = this.dx[0], hy = this.dy[0], a = this.heading, c = this.cell * this.scale;
    var bx = hx + Math.cos(a) * (this.r[0] + c * 0.3), by = hy + Math.sin(a) * (this.r[0] + c * 0.3);
    var mx = bx + Math.cos(a) * c * 1.5, my = by + Math.sin(a) * c * 1.5;
    add(bx, by, mx, my, 2, 0.9, 1, 1);
    for (var s = -1; s <= 1; s += 2) {
      add(mx, my, mx + Math.cos(a + s * 0.55) * c * 1.1, my + Math.sin(a + s * 0.55) * c * 1.1, 2, 0.9, 1, 0.9);
    }
  };

  var SPECIES = GP.species.snake = {
    id: 'snake', env: ENV, drift: DRIFT, label: 'Snake', count: COUNT, palette: PALETTE,
    hueJitter: 0.5, flicker: 0.16, separation: 0.5,
    create: function (env, rnd, x, y) { return new Snake(env, rnd, x, y); }
  };
})(window.GP);
