/* Цепочка из узлов — общая физика тел-«верёвок» (кои, змея).
 *
 * Существо подключает её так: задаёт this.n (число узлов), массивы nx, ny
 * (хребет), dx, dy (нарисованное тело), r (полуширина), vx, vy, ox, oy,
 * длину звена this.seg и вызывает GP.Chain.install(Proto).
 *
 * Даёт: хват за ближайший узел (onGrab), бросок со скоростью руки и закруткой
 * (onRelease), жёсткие звенья без растяжения (physics, link), форму для
 * столкновений (circles) и удар в конкретный узел (kick). */
(function (GP) {
  'use strict';

  var U = GP.util, Cr = GP.Creature, CFG = GP.config;

  GP.Chain = {
    install: function (P) {
      P.shift = function (sx, sy) {
        for (var i = 0; i < this.n; i++) { this.nx[i] += sx; this.ny[i] += sy; }
      };

      P.onRelease = function (hvx, hvy) {
        // узел, за который держали, уходит со скоростью руки и тянет за собой тело
        var sp = Math.sqrt(hvx * hvx + hvy * hvy), g = this.grabNode;
        if (sp > CFG.THROW_MAX) { hvx *= CFG.THROW_MAX / sp; hvy *= CFG.THROW_MAX / sp; }
        // всё тело уходит со скоростью руки, плюс вращение вокруг точки хвата — рыбу закручивает
        var w = U.clamp(this.omega || 0, -CFG.SPIN_MAX, CFG.SPIN_MAX);
        for (var k = 0; k < this.n; k++) {
          var rx = this.nx[k] - this.nx[g], ry = this.ny[k] - this.ny[g];
          this.vx[k] = hvx - w * ry; this.vy[k] = hvy + w * rx;
        }
        // запас скорости броска: по нему возвращается управление (своё плавание в него не входит)
        var sum = 0;
        for (var i = 0; i < this.n; i++) sum += Math.sqrt(this.vx[i] * this.vx[i] + this.vy[i] * this.vy[i]);
        this.throwV = sum / this.n;
        this.grabbed = null;
        this.thrown = true;
      };

      /** Ставит узел i ровно на длину звена от узла j. */
      P.link = function (i, j) {
        var dx = this.nx[i] - this.nx[j], dy = this.ny[i] - this.ny[j];
        var d = Math.sqrt(dx * dx + dy * dy) || 1;
        this.nx[i] = this.nx[j] + dx / d * this.seg; this.ny[i] = this.ny[j] + dy / d * this.seg;
      };

      /** Форма для столкновений: окружности вдоль тела. */
      P.circles = function (out) {
        for (var i = 0; i < this.n; i += 2) out.push(this.dx[i], this.dy[i], this.r[i] + this.cell * 0.4, i);
      };

      P.velocityAt = function (node) {
        if (this.held || this.thrown) return [this.vx[node], this.vy[node]];
        return [this.velX || 0, this.velY || 0];
      };

      /** Удар: узел, в который попали, получает импульс сильнее остальных — рыбу разворачивает. */
      P.kick = function (ix, iy, node) {
        var i;
        if (!this.held && !this.thrown) {
          // начинаем с текущего движения, чтобы рыба не замирала на месте
          for (i = 0; i < this.n; i++) { this.vx[i] = this.velX || 0; this.vy[i] = this.velY || 0; }
          this.thrown = true; this.throwV = 0;
        }
        for (i = 0; i < this.n; i++) {
          var w = 0.55 + 0.9 * Math.max(0, 1 - Math.abs(i - node) / 3);
          this.vx[i] += ix * w; this.vy[i] += iy * w;
        }
        this.throwV = Math.max(this.throwV || 0, Math.sqrt(ix * ix + iy * iy));
      };

      P.nudge = function (dx, dy) {
        this.x += dx; this.y += dy;
        for (var i = 0; i < this.n; i++) { this.nx[i] += dx; this.ny[i] += dy; this.dx[i] += dx; this.dy[i] += dy; }
      };

      /** Цепочка с инерцией: узлы летят сами, звенья держат длину, тело упруго
       *  распрямляется. В руке рыба бьётся и тянет головой вперёд. */
      P.physics = function (dt, env) {
        if (dt <= 0) return;
        var n = this.n, i, it, g = this.held ? this.grabNode : -1;
        var damp = Math.exp(-(this.held ? CFG.HOLD_DRAG : (GP.Ambient.water ? CFG.THROW_DAMP_WATER : CFG.THROW_DAMP_AIR)) * dt);
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


      /** Хват за ближайший узел; extra(x, y) может вернуть узел для особых частей тела. */
      P.onGrab = function (x, y) {
        var best = 1e12, g = 0, i;
        for (i = 0; i < this.n; i++) {
          var dx = x - this.dx[i], dy = y - this.dy[i], d = dx * dx + dy * dy;
          if (d < best) { best = d; g = i; }
        }
        if (this.grabExtra) { var e = this.grabExtra(x, y, best); if (e != null) g = e; }
        this.grabNode = g;
        this.grabbed = { node: g };
        this.omega = 0; this.axisPrev = null;
        for (i = 0; i < this.n; i++) { this.vx[i] = this.vy[i] = 0; }
      };
    }
  };
})(window.GP);
