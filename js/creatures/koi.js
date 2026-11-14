/* Koi — вид сверху: цепочка из 10 узлов позвоночника, профиль ширины тела,
 * хвостовой плавник веером, грудные плавники. Узор строится шумом. */
(function (GP) {
  'use strict';

  // ------------------------------------------------------------ параметры
  var COUNT = 12;
  var ENV = 'pond';        // среда вида (см. js/ambient.js)
  var DRIFT = 0.15;         // насколько ветер или течение сносит существо
  var PALETTE = {
    dot: '#f5c542',
    dotMaterial: 3,
    materials: [
      { role: 'on_surface', stops: ['#5f646d', '#a9aeb6', '#e6e3dc', '#f3f0e9'] },      // 0 белый и серый
      { role: 'primary', stops: ['#7a1712', '#c4241b', '#e8392b', '#ff6a55'] },         // 1 красный (кохаку)
      { role: 'primary', rotate: 30, stops: ['#8f3d0e', '#e06a18', '#ff8a2a', '#ffb866'] }, // 2 оранжевый
      { role: 'primary', rotate: 60, stops: ['#8a6410', '#d9a51e', '#f5c542', '#ffe58a'] }, // 3 золото
      { role: 'secondary', stops: ['#1e2128', '#3a3e48', '#5b616d'] },                  // 4 тёмные пятна и глаза
      { role: 'tertiary', stops: ['#8c3a22', '#e0633a', '#ff9a6b'] },                    // 5 редкие рыжие пятна
      { role: 'secondary', stops: ['#1d4258', '#3f86a6', '#a6d8ea'] }   // среда: пруд
    ]
  };
  var NODES = 10;                       // узлов позвоночника
  var LENGTH_CELLS = [10, 16];          // длина с хвостом, ячеек
  var TAIL_CELLS = 3.4;                 // хвостовой плавник (для рыбы длиной 13)
  var FIN_CELLS = 2.1;                  // грудные плавники
  // полуширина тела по длине (для рыбы длиной 13): 2 ячейки у головы, 4–5 в середине, 2 у хвоста
  var PROFILE = [0.85, 1.25, 1.75, 2.15, 2.3, 2.2, 1.95, 1.6, 1.25, 0.95];
  var SPEED = [15, 40];                 // px/с
  var VARIANTS = ['kohaku', 'kohaku', 'orange', 'gold', 'gray'];
  var SCHOOL_RADIUS = 220;              // px — лёгкая стайность
  var WAVE = 0.72;                      // сдвиг фазы волны между узлами
  // ----------------------------------------------------------------------

  var U = GP.util, R = GP.Raster, Cr = GP.Creature, CFG = GP.config;
  var cursor = (Math.random() * VARIANTS.length) | 0;

  function Koi(env, rnd, x, y) {
    var k = rnd();
    Cr.init(this, SPECIES, env, rnd, { depth: k, x: x, y: y });
    this.len = U.lerp(LENGTH_CELLS[0], LENGTH_CELLS[1], k);
    this.scale = this.len / 13;
    // расцветки идут по кругу, чтобы в стае были все варианты
    this.variant = VARIANTS[(cursor++) % VARIANTS.length];
    this.spotMat = rnd() < 0.5 ? 4 : 5;
    this.o1 = rnd() * 90; this.o2 = rnd() * 90;
    this.thr = rnd.range(0.46, 0.58);
    // кои вытянуты преимущественно по диагоналям
    this.heading = Math.PI / 4 + Math.floor(rnd() * 4) * Math.PI / 2 + rnd.range(-0.35, 0.35);
    this.baseSpeed = rnd.range(SPEED[0], SPEED[1]);
    this.mult = 1; this.mode = 0; this.modeT = rnd.range(3, 10);
    this.sFreq = rnd.range(0.25, 0.5); this.sPhase = rnd() * U.TAU;
    this.wave = rnd() * U.TAU;
    this.bubT = rnd(); this.trailT = rnd();

    this.nx = new Float32Array(NODES); this.ny = new Float32Array(NODES);   // позвоночник
    this.dx = new Float32Array(NODES); this.dy = new Float32Array(NODES);   // с волной
    this.r = new Float32Array(NODES);
    this.ex = new Float32Array(NODES); this.ey = new Float32Array(NODES); this.il = new Float32Array(NODES);
    this.vx = new Float32Array(NODES); this.vy = new Float32Array(NODES);   // скорости узлов (в руке и в броске)
    this.ox = new Float32Array(NODES); this.oy = new Float32Array(NODES);
    this.grabNode = 0;
    this.fin = [0, 0, 0, 0, 0, 0, 0, 0];
    this.geom(env);
    for (var i = 0; i < NODES; i++) {
      this.nx[i] = this.x - Math.cos(this.heading) * this.seg * i;
      this.ny[i] = this.y - Math.sin(this.heading) * this.seg * i;
    }
  }

  Koi.prototype.geom = function (env) {
    var cell = env.cell;
    this.cell = cell;
    this.seg = (this.len - TAIL_CELLS * this.scale) * cell / (NODES - 1);
    this.segCells = this.seg / cell;
    for (var i = 0; i < NODES; i++) this.r[i] = PROFILE[i] * this.scale * cell;
    this.tailLen = TAIL_CELLS * this.scale * cell;
    this.finLen = FIN_CELLS * this.scale * cell;
    this.finR = 0.6 * this.scale * cell;
    this.radius = this.len * cell * 0.62;
  };

  Koi.prototype.shift = function (sx, sy) {
    for (var i = 0; i < NODES; i++) { this.nx[i] += sx; this.ny[i] += sy; }
  };

  Koi.prototype.onScare = function () {
    this.mode = 2; this.mult = 1.7; this.modeT = 1.2;
    GP.Ambient.ripple(this.x, this.y, 5);            // всплеск на воде
  };

  /** Рыбу берут за ближайший узел: за голову, середину или хвост. */
  Koi.prototype.onGrab = function (x, y) {
    var best = 1e12, g = 0, i;
    for (i = 0; i < NODES; i++) {
      var dx = x - this.dx[i], dy = y - this.dy[i], d = dx * dx + dy * dy;
      if (d < best) { best = d; g = i; }
    }
    // хвостовой плавник — тоже хвост
    var tx = x - (this.dx[NODES - 1] + this.tcos * this.tailLen * 0.6), ty = y - (this.dy[NODES - 1] + this.tsin * this.tailLen * 0.6);
    if (tx * tx + ty * ty < best) g = NODES - 1;
    this.grabNode = g;
    this.grabbed = { node: g };
    this.omega = 0; this.axisPrev = null;
    for (i = 0; i < NODES; i++) { this.vx[i] = this.vy[i] = 0; }
  };

  Koi.prototype.onRelease = function (hvx, hvy) {
    // узел, за который держали, уходит со скоростью руки и тянет за собой тело
    var sp = Math.sqrt(hvx * hvx + hvy * hvy), g = this.grabNode;
    if (sp > CFG.THROW_MAX) { hvx *= CFG.THROW_MAX / sp; hvy *= CFG.THROW_MAX / sp; }
    // всё тело уходит со скоростью руки, плюс вращение вокруг точки хвата — рыбу закручивает
    var w = U.clamp(this.omega || 0, -CFG.SPIN_MAX, CFG.SPIN_MAX);
    for (var k = 0; k < NODES; k++) {
      var rx = this.nx[k] - this.nx[g], ry = this.ny[k] - this.ny[g];
      this.vx[k] = hvx - w * ry; this.vy[k] = hvy + w * rx;
    }
    // запас скорости броска: по нему возвращается управление (своё плавание в него не входит)
    var sum = 0;
    for (var i = 0; i < NODES; i++) sum += Math.sqrt(this.vx[i] * this.vx[i] + this.vy[i] * this.vy[i]);
    this.throwV = sum / NODES;
    this.grabbed = null;
    this.thrown = true;
  };

  /** Ставит узел i ровно на длину звена от узла j. */
  Koi.prototype.link = function (i, j) {
    var dx = this.nx[i] - this.nx[j], dy = this.ny[i] - this.ny[j];
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    this.nx[i] = this.nx[j] + dx / d * this.seg; this.ny[i] = this.ny[j] + dy / d * this.seg;
  };

  /** Форма для столкновений: окружности вдоль тела. */
  Koi.prototype.circles = function (out) {
    for (var i = 0; i < NODES; i += 2) out.push(this.dx[i], this.dy[i], this.r[i] + this.cell * 0.4, i);
  };

  Koi.prototype.velocityAt = function (node) {
    if (this.held || this.thrown) return [this.vx[node], this.vy[node]];
    return [this.velX || 0, this.velY || 0];
  };

  /** Удар: узел, в который попали, получает импульс сильнее остальных — рыбу разворачивает. */
  Koi.prototype.kick = function (ix, iy, node) {
    var i;
    if (!this.held && !this.thrown) {
      // начинаем с текущего движения, чтобы рыба не замирала на месте
      for (i = 0; i < NODES; i++) { this.vx[i] = this.velX || 0; this.vy[i] = this.velY || 0; }
      this.thrown = true; this.throwV = 0;
    }
    for (i = 0; i < NODES; i++) {
      var w = 0.55 + 0.9 * Math.max(0, 1 - Math.abs(i - node) / 3);
      this.vx[i] += ix * w; this.vy[i] += iy * w;
    }
    this.throwV = Math.max(this.throwV || 0, Math.sqrt(ix * ix + iy * iy));
  };

  Koi.prototype.nudge = function (dx, dy) {
    this.x += dx; this.y += dy;
    for (var i = 0; i < NODES; i++) { this.nx[i] += dx; this.ny[i] += dy; this.dx[i] += dx; this.dy[i] += dy; }
  };

  /** Цепочка с инерцией: узлы летят сами, звенья держат длину, тело упруго
   *  распрямляется. В руке рыба бьётся и тянет головой вперёд. */
  Koi.prototype.physics = function (dt, env) {
    if (dt <= 0) return;
    var n = NODES, i, it, g = this.held ? this.grabNode : -1;
    var damp = Math.exp(-(this.held ? CFG.HOLD_DRAG : CFG.THROW_DAMP_WATER) * dt);
    var sum = 0;
    for (i = 0; i < n; i++) {
      this.ox[i] = this.nx[i]; this.oy[i] = this.ny[i];
      this.vx[i] *= damp; this.vy[i] *= damp;
      sum += Math.sqrt(this.vx[i] * this.vx[i] + this.vy[i] * this.vy[i]);
      this.nx[i] += this.vx[i] * dt; this.ny[i] += this.vy[i] * dt;
    }
    var speed = this.held ? sum / n : (this.throwV *= damp);
    // собственное усилие: в руке вырывается, в полёте возвращает управление по мере остановки
    var ctrl = this.held ? 1 : 1 - U.clamp(speed / 260, 0, 1);
    var hx = this.nx[0] - this.nx[1], hy = this.ny[0] - this.ny[1], hl = Math.sqrt(hx * hx + hy * hy) || 1;
    var swim = this.baseSpeed * this.speedMul * (this.held ? 2.4 : 1) * ctrl * dt;
    var wig = Math.sin(this.wave * 1.3) * 0.9;
    if (g !== 0) {
      this.nx[0] += (hx / hl - hy / hl * wig) * swim;
      this.ny[0] += (hy / hl + hx / hl * wig) * swim;
    }
    if (g >= 0 && g !== n - 1) {            // хвост бьёт в противофазе
      this.nx[n - 1] += hy / hl * wig * swim * 0.8;
      this.ny[n - 1] -= hx / hl * wig * swim * 0.8;
    }
    for (it = 0; it < 4; it++) {
      if (g >= 0) { this.nx[g] = this.held.x; this.ny[g] = this.held.y; }
      for (i = 1; i < n; i++) {
        var dx = this.nx[i] - this.nx[i - 1], dy = this.ny[i] - this.ny[i - 1];
        var d = Math.sqrt(dx * dx + dy * dy) || 1, diff = (d - this.seg) / d;
        var wa = i - 1 === g ? 0 : 0.5, wb = i === g ? 0 : 0.5, ws = wa + wb;
        this.nx[i - 1] += dx * diff * wa / ws; this.ny[i - 1] += dy * diff * wa / ws;
        this.nx[i] -= dx * diff * wb / ws; this.ny[i] -= dy * diff * wb / ws;
      }
      // упругость хребта: тело не складывается гармошкой
      for (i = 1; i < n - 1; i++) {
        if (i === g) continue;
        this.nx[i] += ((this.nx[i - 1] + this.nx[i + 1]) / 2 - this.nx[i]) * 0.1;
        this.ny[i] += ((this.ny[i - 1] + this.ny[i + 1]) / 2 - this.ny[i]) * 0.1;
      }
    }
    // жёсткий проход от точки опоры к концам: звенья ровно своей длины, тело не тянется резиной
    var a0 = g >= 0 ? g : n >> 1;
    for (i = a0 + 1; i < n; i++) this.link(i, i - 1);
    for (i = a0 - 1; i >= 0; i--) this.link(i, i + 1);
    for (i = 0; i < n; i++) {
      this.vx[i] = U.clamp((this.nx[i] - this.ox[i]) / dt, -2600, 2600);
      this.vy[i] = U.clamp((this.ny[i] - this.oy[i]) / dt, -2600, 2600);
    }
    this.x = this.nx[0]; this.y = this.ny[0];
    this.heading = Math.atan2(this.ny[0] - this.ny[1], this.nx[0] - this.nx[1]);
    // угловая скорость всего тела (от хвоста к голове) — для броска с закруткой
    var axis = Math.atan2(this.ny[0] - this.ny[n - 1], this.nx[0] - this.nx[n - 1]);
    if (this.axisPrev != null) this.omega += (U.angDiff(this.axisPrev, axis) / dt - (this.omega || 0)) * Math.min(1, dt * 20);
    this.axisPrev = axis;
    this.pushX = this.pushY = 0;
    this.excite = Math.max(this.excite * Math.exp(-1.1 * dt), this.held ? 0.85 : 1 - ctrl);
    if (!this.held) {
      if (speed < 22) this.thrown = false;      // успокоилась — плывёт дальше сама
      Cr.wrap(this, env);
    }
  };

  Koi.prototype.update = function (dt, env) {
    if (env.cell !== this.cell) this.geom(env);
    this.t += dt;
    var i;

    var v;
    if (this.held || this.thrown) {
      // в руке и после броска тело — физическая цепочка, а не «голова ведёт»
      this.physics(dt, env);
      v = this.baseSpeed * this.speedMul * (this.held ? 2.6 : 1.5);
    } else {
      // плавные повороты по S-кривым + шум
      var w = 0.5 * Math.sin(this.t * this.sFreq + this.sPhase) + (U.noise1(this.t * 0.25, this.seed) - 0.5) * 0.9;
      var diag = Math.PI / 4 + Math.round((this.heading - Math.PI / 4) / (Math.PI / 2)) * Math.PI / 2;
      w += U.angDiff(this.heading, diag) * 0.12;

      // лёгкая стайность: выравнивание и слабое притяжение к соседям
      var list = env.list, ax = 0, ay = 0, cx = 0, cy = 0, cnt = 0;
      for (i = 0; i < list.length; i++) {
        var o = list[i];
        if (o === this || o.species !== SPECIES) continue;
        var ox = o.x - this.x, oy = o.y - this.y;
        if (ox * ox + oy * oy < SCHOOL_RADIUS * SCHOOL_RADIUS) {
          ax += Math.cos(o.heading); ay += Math.sin(o.heading); cx += ox; cy += oy; cnt++;
        }
      }
      if (cnt) {
        w += U.angDiff(this.heading, Math.atan2(ay, ax)) * 0.28;
        cx /= cnt; cy /= cnt;
        if (cx * cx + cy * cy > 90 * 90) w += U.angDiff(this.heading, Math.atan2(cy, cx)) * 0.07;
      }
      this.heading += U.clamp(w, -1.2, 1.2) * dt;

      // иногда замедление и рывок
      this.modeT -= dt;
      if (this.mode === 0 && this.modeT <= 0) { this.mode = 1; this.modeT = this.rnd.range(0.8, 1.7); }
      else if (this.mode === 1 && this.modeT <= 0) {
        this.mode = 2; this.mult = 2.3; this.modeT = 1.5;
        GP.Ambient.ripple(this.x, this.y, 4);
      }
      else if (this.mode === 2 && this.modeT <= 0) { this.mode = 0; this.modeT = this.rnd.range(5, 14); }
      var target = this.mode === 1 ? 0.45 : 1;
      this.mult += (target - this.mult) * Math.min(1, dt * (this.mode === 2 ? 1.5 : 2.5));

      v = this.baseSpeed * this.speedMul * this.mult;
      Cr.move(this, dt, env, Math.cos(this.heading) * v, Math.sin(this.heading) * v);

      // голова ведёт, остальные узлы следуют с запаздыванием
      this.nx[0] = this.x; this.ny[0] = this.y;
      for (i = 1; i < NODES; i++) {
        var ddx = this.nx[i] - this.nx[i - 1], ddy = this.ny[i] - this.ny[i - 1];
        var d = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
        this.nx[i] = this.nx[i - 1] + ddx / d * this.seg;
        this.ny[i] = this.ny[i - 1] + ddy / d * this.seg;
      }
    }

    // волна по телу, амплитуда растёт к хвосту
    this.wave += (2.6 + v * 0.11) * dt;
    var amp = this.cell * this.scale * (0.5 + 0.55 * Math.min(1.6, v / 30));
    if (this.held || this.thrown) amp *= 0.55;              // изогнутое тело не «гуляет» волной
    for (i = 0; i < NODES; i++) {
      var p = i === 0 ? 1 : i;
      var tx = this.nx[p - 1] - this.nx[p], ty = this.ny[p - 1] - this.ny[p];
      var tl = Math.sqrt(tx * tx + ty * ty) || 1;
      var off = amp * Math.pow(i / (NODES - 1), 1.6) * Math.sin(this.wave - i * WAVE);
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

    // хвостовой плавник: веер за последним узлом, качается вместе с волной
    var L = NODES - 2;
    var ta = Math.atan2(this.ey[L], this.ex[L]) + 0.5 * Math.sin(this.wave - NODES * WAVE);
    this.tcos = Math.cos(ta); this.tsin = Math.sin(ta);

    // грудные плавники у третьего узла, колеблются с запаздыванием по фазе
    var ba = Math.atan2(-this.ey[2], -this.ex[2]);   // направление «вперёд»
    for (var s = 0; s < 2; s++) {
      var sg = s ? 1 : -1;
      var fa = ba + sg * (2.15 + 0.3 * Math.sin(this.wave - 1.4 - s * 0.9));
      var bxp = this.dx[3] + Math.cos(ba + sg * Math.PI / 2) * this.r[3] * 0.75;
      var byp = this.dy[3] + Math.sin(ba + sg * Math.PI / 2) * this.r[3] * 0.75;
      this.fin[s * 4] = bxp; this.fin[s * 4 + 1] = byp;
      this.fin[s * 4 + 2] = Math.cos(fa) * this.finLen; this.fin[s * 4 + 3] = Math.sin(fa) * this.finLen;
    }

    if (this.asm < 1) return;
    // 2–4 точки-«пузырька» рядом с головой
    this.bubT -= dt * 2.4;
    if (this.bubT <= 0) {
      this.bubT += 1;
      var a = this.heading + this.rnd.range(-1.3, 1.3), dist = this.cell * this.rnd.range(1.6, 3.4) * this.scale;
      env.dust(this.x + Math.cos(a) * dist, this.y + Math.sin(a) * dist,
        Math.cos(a) * 5, Math.sin(a) * 5, this.rnd.range(0.9, 1.7),
        this.rnd.pick(['.', '.', ':', 'o', "'"]), 1, 0.3 + 0.45 * this.depth);
    }
    // короткий затухающий след за хвостом
    this.trailT -= dt * (1.4 + v * 0.05);
    if (this.trailT <= 0) {
      this.trailT += 1;
      var tx2 = this.dx[NODES - 1] + this.tcos * this.tailLen, ty2 = this.dy[NODES - 1] + this.tsin * this.tailLen;
      env.dust(tx2 + this.rnd.range(-1, 1) * this.cell, ty2 + this.rnd.range(-1, 1) * this.cell,
        0, 0, this.rnd.range(0.5, 0.9), this.rnd.pick(['.', ',', '.']), 0, 0.3 + 0.3 * this.depth);
    }
  };

  /** Рыбу можно ухватить за любое место тела. */
  Koi.prototype.hit = function (x, y) {
    var best = 9;
    for (var i = 0; i < NODES; i++) {
      var dx = x - this.dx[i], dy = y - this.dy[i];
      var q = Math.sqrt(dx * dx + dy * dy) / (this.r[i] + this.cell * 1.5);
      if (q < best) best = q;
    }
    return best;
  };

  Koi.prototype.bounds = function (b) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (var i = 0; i < NODES; i++) {
      if (this.dx[i] < x0) x0 = this.dx[i]; if (this.dx[i] > x1) x1 = this.dx[i];
      if (this.dy[i] < y0) y0 = this.dy[i]; if (this.dy[i] > y1) y1 = this.dy[i];
    }
    var m = Math.max(this.r[4] + this.finLen, this.tailLen) + this.cell;
    b.x0 = x0 - m; b.y0 = y0 - m; b.x1 = x1 + m; b.y1 = y1 + m;
  };

  Koi.prototype.sample = function (x, y) {
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

    if (bi >= 0) {
      var uu = (bi + bt) * this.segCells;                 // вдоль тела, в ячейках
      var lat = Math.sqrt(best);                          // 0 — хребет, 1 — бок
      var vv = side * lat * brr / this.cell;
      R.u = uu; R.v = vv + 32;
      var core = 1 - best;
      if (this.len > 11.5 && uu > 0.5 && uu < 1.5 && lat > 0.5 && lat < 0.95) {
        R.m = 4; return 0.3;                              // глаза
      }
      var n = U.noise2(uu * 0.34 + this.o1, vv * 0.5 + this.o2, this.seed);
      switch (this.variant) {
        case 'kohaku':
          // красные пятна плотнее на спине
          if (n > this.thr + 0.12 * lat) { R.m = 1; return 0.5 + 0.38 * core + 0.3 * (n - 0.6); }
          R.m = 0; return 0.6 + 0.34 * core;
        case 'orange':
          R.m = 2; return 0.44 + 0.38 * core + 0.3 * (n - 0.5);
        case 'gold':
          R.m = 3; return U.clamp(0.36 + 0.3 * core + 0.75 * (n - 0.4), 0.2, 1);
        default:
          if (n > 0.71) { R.m = this.spotMat; return 0.55 + 0.3 * core; }
          R.m = 0; return 0.36 + 0.3 * core + 0.16 * n;
      }
    }

    var fm = this.variant === 'orange' ? 2 : this.variant === 'gold' ? 3 : 0;

    // хвостовой плавник
    px = x - this.dx[NODES - 1]; py = y - this.dy[NODES - 1];
    var al = px * this.tcos + py * this.tsin;
    if (al > -this.cell * 0.3 && al < this.tailLen) {
      var la = Math.abs(-px * this.tsin + py * this.tcos);
      var k = al / this.tailLen;
      var hw = this.r[NODES - 1] * 0.8 + al * 0.62;
      // вырез в середине веера
      if (la < hw && k < 0.7 + 0.3 * (la / (hw || 1))) {
        R.m = fm; R.a = 0.72; R.u = al / this.cell + 70; R.v = la / this.cell;
        return 0.5 - 0.22 * k;
      }
    }

    // грудные плавники
    for (i = 0; i < 2; i++) {
      var o = i * 4;
      px = x - this.fin[o]; py = y - this.fin[o + 1];
      var fx = this.fin[o + 2], fy = this.fin[o + 3];
      t = (px * fx + py * fy) / (fx * fx + fy * fy || 1);
      if (t < 0) t = 0; else if (t > 1) t = 1;
      qx = px - fx * t; qy = py - fy * t;
      rr = this.finR * (1 - 0.35 * t);
      if (qx * qx + qy * qy < rr * rr) {
        R.m = fm; R.a = 0.66; R.u = t * 3 + 90; R.v = i * 5;
        return 0.44 - 0.12 * t;
      }
    }
    return 0;
  };

  var SPECIES = GP.species.koi = {
    id: 'koi', env: ENV, drift: DRIFT, label: 'Koi', count: COUNT, palette: PALETTE,
    hueJitter: 0.5, flicker: 0.18,
    create: function (env, rnd, x, y) { return new Koi(env, rnd, x, y); }
  };
})(window.GP);
