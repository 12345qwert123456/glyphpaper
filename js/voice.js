/* Голосовой ввод через Web Speech API и анимированный шар над приветствием.
 *
 * Распознавание речи есть не во всех браузерах (в Firefox его нет). Там, где
 * его нет, шар и кнопка микрофона просто не показываются.
 * В Chromium звук для распознавания уходит на сервер браузера — это решение
 * самого браузера, страница звук никуда не отправляет. */
(function (GP) {
  'use strict';

  // ------------------------------------------------------------ параметры
  var ORB_SIZE = 64;          // холст шара, CSS px (сам шар меньше — вокруг место под кольцо)
  var ORB_RADIUS = 22;
  var IDLE_FPS = 30;
  var BLOBS = 4;              // цветных пятен внутри шара
  var HUES = [0, 0.11, -0.13, 0.42];   // сдвиги оттенка пятен от цвета текущего вида
  // ----------------------------------------------------------------------

  var C = GP.color, U = GP.util;
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  var V = GP.Voice = {
    supported: !!SR,
    listening: false,
    lang: '',                 // пусто — язык браузера
    onText: null,             // function (text, isFinal)
    onState: null             // function (state, detail): listening | idle | error
  };

  var rec = null, stream = null, audio = null, analyser = null, buf = null;
  var speaking = false, level = 0;

  function state(s, detail) { if (V.onState) V.onState(s, detail); }

  function stopMeter() {
    try { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* уже остановлен */ }
    try { if (audio) audio.close(); } catch (e2) { /* уже закрыт */ }
    stream = audio = analyser = buf = null;
  }

  /** Громкость микрофона для анимации. Если доступа нет — шар пульсирует сам. */
  function startMeter() {
    var md = navigator.mediaDevices, AC = window.AudioContext || window.webkitAudioContext;
    if (!md || !md.getUserMedia || !AC) return;
    md.getUserMedia({ audio: true }).then(function (s) {
      if (!V.listening) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
      stream = s;
      audio = new AC();
      analyser = audio.createAnalyser();
      analyser.fftSize = 256;
      buf = new Uint8Array(analyser.fftSize);
      audio.createMediaStreamSource(s).connect(analyser);
    }).catch(function () { /* без измерителя громкости */ });
  }

  V.start = function () {
    if (!SR || V.listening) return;
    try {
      rec = new SR();
      rec.lang = V.lang || navigator.language || 'en-US';
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
    } catch (e) { state('error', 'unavailable'); return; }

    rec.onstart = function () { V.listening = true; speaking = false; state('listening'); startMeter(); };
    rec.onspeechstart = function () { speaking = true; };
    rec.onspeechend = function () { speaking = false; };
    rec.onresult = function (e) {
      var text = '', fin = false;
      for (var i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) fin = true;
      }
      if (V.onText) V.onText(text.trim(), fin);
    };
    rec.onerror = function (e) {
      // no-speech и aborted — обычное завершение, а не ошибка
      if (e.error !== 'no-speech' && e.error !== 'aborted') state('error', e.error);
    };
    rec.onend = function () {
      V.listening = false; speaking = false; rec = null;
      stopMeter();
      state('idle');
    };
    try { rec.start(); } catch (e2) { V.listening = false; rec = null; state('error', 'unavailable'); }
  };

  V.stop = function () {
    if (rec) { try { rec.stop(); } catch (e) { /* уже остановлено */ } }
  };

  V.toggle = function () { if (V.listening) V.stop(); else V.start(); };

  // ------------------------------------------------------------------ шар

  var Orb = GP.Orb = {};
  var cv = null, ctx = null, raf = 0, last = 0, t = 0, energy = 0, on = false, dpr = 1;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function measure() {
    if (analyser && buf) {
      analyser.getByteTimeDomainData(buf);
      var sum = 0;
      for (var i = 0; i < buf.length; i++) { var v = (buf[i] - 128) / 128; sum += v * v; }
      return Math.min(1, Math.sqrt(sum / buf.length) * 4.5);
    }
    // измерителя нет: живая пульсация, сильнее пока идёт речь
    return (speaking ? 0.55 : 0.22) + 0.25 * U.noise1(t * 5, 7);
  }

  function colors() {
    var id = GP.Scene.species() || GP.config.DEFAULT_SPECIES;
    var hsl = C.toHsl(GP.Palette.dot(id)), out = [];
    for (var i = 0; i < BLOBS; i++) {
      var c = C.fromHsl(hsl[0] + HUES[i], Math.max(0.62, hsl[1]), 0.58);
      out.push((c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0));
    }
    return out;
  }

  function draw() {
    var s = ORB_SIZE, cx = s / 2, cy = s / 2, R = ORB_RADIUS * (1 + 0.07 * energy);
    var cols = colors(), i;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, s, s);

    // кольцо-отклик вокруг шара, пока слушает
    if (energy > 0.02) {
      ctx.beginPath();
      ctx.arc(cx, cy, R + 3 + 5 * energy, 0, U.TAU);
      ctx.strokeStyle = 'rgba(' + cols[0] + ',' + (0.1 + 0.3 * energy) + ')';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, U.TAU);
    ctx.clip();
    ctx.fillStyle = '#0c0f18';
    ctx.fillRect(0, 0, s, s);

    // цветные пятна плавают внутри и складываются светом
    ctx.globalCompositeOperation = 'lighter';
    var act = 0.7 + 0.3 * energy;
    for (i = 0; i < BLOBS; i++) {
      var a1 = t * (0.5 + 0.17 * i) + i * 1.9, a2 = t * (0.37 + 0.11 * i) + i * 2.7;
      var reach = R * (0.4 + 0.2 * energy);
      var bx = cx + Math.cos(a1) * reach, by = cy + Math.sin(a2) * reach;
      var br = R * (0.66 + 0.16 * Math.sin(t * 0.9 + i * 1.3) + 0.2 * energy);
      var g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      g.addColorStop(0, 'rgba(' + cols[i] + ',' + (0.62 * act) + ')');
      g.addColorStop(0.55, 'rgba(' + cols[i] + ',' + (0.22 * act) + ')');
      g.addColorStop(1, 'rgba(' + cols[i] + ',0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }
    // светлое ядро вспыхивает на громких звуках
    var core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * (0.35 + 0.45 * energy));
    core.addColorStop(0, 'rgba(255,255,255,' + (0.05 + 0.2 * energy) + ')');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, s, s);

    // объём: блик сверху и тень по нижнему краю
    ctx.globalCompositeOperation = 'source-over';
    var hi = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.45, 0, cx - R * 0.3, cy - R * 0.45, R * 0.9);
    hi.addColorStop(0, 'rgba(255,255,255,0.22)');
    hi.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hi;
    ctx.fillRect(0, 0, s, s);
    var sh = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
    sh.addColorStop(0, 'rgba(5,7,12,0)');
    sh.addColorStop(1, 'rgba(5,7,12,0.55)');
    ctx.fillStyle = sh;
    ctx.fillRect(0, 0, s, s);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, U.TAU);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    var busy = V.listening || energy > 0.02;
    var gap = busy ? 0 : (reduce ? 1000 : 1000 / IDLE_FPS);
    if (last && ts - last < gap - 2) return;
    var dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
    last = ts;
    var target = V.listening ? 0.25 + 0.75 * measure() : 0;
    energy += (target - energy) * Math.min(1, dt * (target > energy ? 14 : 5));
    level = energy;
    t += dt * (reduce && !busy ? 0 : 0.7 + 2.6 * energy);
    draw();
  }

  Orb.init = function (canvas) {
    cv = canvas;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = cv.height = Math.round(ORB_SIZE * dpr);
    cv.style.width = cv.style.height = ORB_SIZE + 'px';
    ctx = cv.getContext('2d');
    t = Math.random() * 50;
  };

  Orb.show = function (visible) {
    if (visible === on || !cv) return;
    on = visible;
    cancelAnimationFrame(raf);
    last = 0;
    if (on) raf = requestAnimationFrame(frame);
  };

  Orb.energy = function () { return level; };
})(window.GP);
