/* Интерфейс поверх сцены: переключатель видов, приветствие, поле ввода,
 * меню настроек, клавиатура. */
(function (GP) {
  'use strict';

  var CFG = GP.config, Scene = GP.Scene, Pal = GP.Palette, Storage = GP.Storage;

  var $ = function (id) { return document.getElementById(id); };
  var settings = null;
  var UI = GP.UI = {};

  function save() { Storage.save(settings); }

  // ----------------------------------------------------------- переключатель

  function buildSwitcher() {
    var nav = $('species-list');
    CFG.SPECIES_ORDER.forEach(function (id, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.species = id;
      b.title = GP.species[id].label + (i < 10 ? ' — ' + ((i + 1) % 10) : '');
      var dot = document.createElement('i');
      dot.className = 'dot';
      dot.style.background = 'var(--dot-' + id + ')';
      b.appendChild(dot);
      b.appendChild(document.createTextNode(GP.species[id].label));
      b.addEventListener('click', function () { UI.select(id); });
      nav.appendChild(b);
    });
  }

  function markSwitcher() {
    var list = $('species-list'), bs = list.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) {
      var on = bs[i].dataset.species === settings.species;
      bs[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on && !settings.pickerHidden && list.scrollWidth > list.clientWidth) {
        list.scrollLeft = bs[i].offsetLeft - (list.clientWidth - bs[i].offsetWidth) / 2;
      }
    }
    $('picker-dot').style.background = 'var(--dot-' + settings.species + ')';
  }

  /** Панель видов сворачивается в маленькую кнопку с точкой текущего вида. */
  function applyPicker() {
    var hidden = !!settings.pickerHidden;
    $('switcher').classList.toggle('collapsed', hidden);
    var t = $('picker-toggle');
    t.setAttribute('aria-expanded', hidden ? 'false' : 'true');
    var label = hidden ? 'Show creature picker' : 'Hide creature picker';
    t.title = label; t.setAttribute('aria-label', label);
    $('set-picker').checked = !hidden;
  }

  function setPicker(hidden) {
    settings.pickerHidden = hidden;
    applyPicker();
    markSwitcher();
    save();
  }

  /** Соседний вид по кругу: dir = 1 — следующий, −1 — предыдущий. */
  UI.step = function (dir) {
    var o = CFG.SPECIES_ORDER, i = o.indexOf(settings.species);
    UI.select(o[(i + dir + o.length) % o.length]);
  };

  UI.select = function (id) {
    if (!GP.species[id] || id === settings.species) return;
    settings.species = id;
    markSwitcher();
    if ($('wheel')) markTint();
    Scene.setSpecies(id);
    $('out-count').textContent = Scene.count();
    save();
  };

  // ------------------------------------------------------------- приветствие

  var status = '', statusT = 0;

  function greeting() {
    if (status) { $('greeting').textContent = status; return; }
    var h = new Date().getHours();
    var name = (settings.name || '').trim();
    var text;
    if (h >= 5 && h < 12) text = 'Good morning';
    else if (h >= 12 && h < 18) text = 'Good afternoon';
    else if (h >= 18 && h < 23) text = 'Good evening';
    else text = 'Still up';
    var night = text === 'Still up';
    $('greeting').textContent = text + (name ? ', ' + name : '') + (night ? '?' : '');
  }

  /** Временно показывает строку вместо приветствия (ms = 0 — пока не снимут). */
  function say(text, ms) {
    clearTimeout(statusT);
    status = text || '';
    greeting();
    if (status && ms) statusT = setTimeout(function () { status = ''; greeting(); }, ms);
  }

  // ------------------------------------------------------------------ поиск

  function looksLikeUrl(s) {
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^[^\s]+\.[a-z]{2,}(\/[^\s]*)?$/i.test(s);
  }

  function byTemplate(text) {
    var tpl = settings.searchUrl || CFG.SEARCH_URL;
    var q = encodeURIComponent(text);
    location.href = tpl.indexOf('%s') >= 0 ? tpl.replace('%s', q) : tpl + q;
  }

  function search(text) {
    text = text.trim();
    if (!text) return;
    if (looksLikeUrl(text)) {
      location.href = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : 'https://' + text;
      return;
    }
    // в расширении — поисковая система браузера по умолчанию
    try {
      var b = typeof browser !== 'undefined' ? browser : null;
      var c = typeof chrome !== 'undefined' ? chrome : null;
      var api = (b && b.search) || (c && c.search);
      if (api && typeof api.query === 'function') {
        var p = api.query({ text: text, disposition: 'CURRENT_TAB' });
        if (p && typeof p.catch === 'function') p.catch(function () { byTemplate(text); });
        return;
      }
      if (api && typeof api.search === 'function') {           // старые Firefox
        var p2 = api.search({ query: text });
        if (p2 && typeof p2.catch === 'function') p2.catch(function () { byTemplate(text); });
        return;
      }
    } catch (e) { /* API недоступен — обычный переход */ }
    byTemplate(text);
  }

  // ---------------------------------------------------------- голосовой ввод

  var VOICE_ERRORS = {
    'not-allowed': 'Microphone access is blocked',
    'service-not-allowed': 'Microphone access is blocked',
    'audio-capture': 'No microphone found',
    'network': 'Voice service is unavailable',
    'unavailable': 'Voice input is unavailable'
  };
  var heard = '';

  function voiceUi() {
    var V = GP.Voice, on = V.supported && settings.voice;
    $('orb').hidden = !on;
    $('mic').hidden = !on;
    GP.Orb.show(on);
    $('set-voice').disabled = !V.supported;
    $('voice-note').textContent = V.supported ? '' : 'not supported in this browser';
    $('row-voice-auto').hidden = !on;
    $('row-voice-lang').hidden = !on;
    V.lang = (settings.voiceLang || '').trim();
    if (!on && V.listening) V.stop();
    zone();
  }

  function bindVoice() {
    var V = GP.Voice;
    GP.Orb.init($('orb-canvas'));
    $('orb').addEventListener('click', function () { V.toggle(); });
    $('mic').addEventListener('click', function () { V.toggle(); });
    V.onText = function (text, fin) {
      $('q').value = text;
      if (fin) heard = text;
    };
    V.onState = function (state, detail) {
      $('mic').setAttribute('aria-pressed', state === 'listening' ? 'true' : 'false');
      if (state === 'listening') { heard = ''; say('Listening…', 0); return; }
      if (state === 'error') { say(VOICE_ERRORS[detail] || 'Voice input failed', 3000); return; }
      // idle: распознавание закончилось
      if (status === 'Listening…') say('', 0);
      if (heard) {
        if (settings.voiceAuto) search(heard); else $('q').focus();
        heard = '';
      }
    };
    voiceUi();
  }

  // ------------------------------------------------ принудительный цвет

  // Круг цветов: угол — оттенок, расстояние от центра — насыщенность; яркость — отдельным ползунком.
  var wheel = { h: 0, s: 0, v: 1, on: false };
  var saveT = 0;

  function hsvToRgb(h, s, v) {
    var f = function (n) { var k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return [f(5) * 255, f(3) * 255, f(1) * 255];
  }
  function hex2(n) { n = Math.round(Math.max(0, Math.min(255, n))); return (n < 16 ? '0' : '') + n.toString(16); }
  function rgbToHex(c) { return '#' + hex2(c[0]) + hex2(c[1]) + hex2(c[2]); }
  function hexToHsv(hex) {
    var n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d) {
      if (mx === r) h = ((g - b) / d + 6) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h: h, s: mx ? d / mx : 0, v: mx };
  }
  function wheelHex() { return rgbToHex(hsvToRgb(wheel.h, wheel.s, wheel.v)); }

  /** Цвет вида сейчас: свой, затем общий; '' — натуральный. */
  function tintOf(id) {
    return settings.tints && id in settings.tints ? settings.tints[id] : settings.tintAll || '';
  }

  function applyTints() { Pal.setOverrides(Pal.tintsFrom(settings)); }

  function drawWheel() {
    var cv = $('wheel'), S = cv.width, ctx = cv.getContext('2d'), R = S / 2 - 3, i, j;
    var img = ctx.createImageData(S, S), d = img.data;
    for (j = 0; j < S; j++) {
      for (i = 0; i < S; i++) {
        var dx = i + 0.5 - S / 2, dy = j + 0.5 - S / 2, r = Math.sqrt(dx * dx + dy * dy), o = (j * S + i) * 4;
        if (r > R + 1) continue;
        var h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
        var c = hsvToRgb(h, Math.min(1, r / R), wheel.v);
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2];
        d[o + 3] = Math.max(0, Math.min(255, (R + 1 - r) * 255));      // мягкий край круга
      }
    }
    ctx.putImageData(img, 0, 0);
    if (wheel.on) {
      // маркер выбранного цвета
      var a = wheel.h * Math.PI / 180, mx = S / 2 + Math.cos(a) * wheel.s * R, my = S / 2 + Math.sin(a) * wheel.s * R;
      ctx.beginPath(); ctx.arc(mx, my, 7, 0, Math.PI * 2);
      ctx.fillStyle = wheelHex(); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.beginPath(); ctx.arc(mx, my, 8.6, 0, Math.PI * 2);
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.stroke();
    }
    // дорожка ползунка яркости: от чёрного к текущему оттенку
    var top = hsvToRgb(wheel.h, wheel.s, 1);
    $('wheel-val').style.setProperty('--to', rgbToHex(top));
  }

  function markTint() {
    var cur = tintOf(settings.species);
    if (cur) {
      var hsv = hexToHsv(cur);
      wheel.h = hsv.h; wheel.s = hsv.s; wheel.v = hsv.v; wheel.on = true;
    } else {
      wheel.on = false;
    }
    $('wheel-val').value = Math.round(wheel.v * 100);
    $('wheel-hex').value = cur || '';
    $('out-tint').textContent = cur || 'natural';
    $('set-tintAll').checked = !!settings.tintAll;
    drawWheel();
  }

  /** hex пустой — вернуть натуральный цвет. live — идёт перетаскивание: сохранение откладывается. */
  function pickTint(hex, live) {
    if ($('set-tintAll').checked) { settings.tintAll = hex; settings.tints = {}; }
    else settings.tints[settings.species] = hex;             // '' — этот вид натуральным, даже если задан общий
    applyTints();
    $('out-tint').textContent = hex || 'natural';
    $('wheel-hex').value = hex;
    drawWheel();
    if (live) { clearTimeout(saveT); saveT = setTimeout(save, 300); } else save();
  }

  function buildTints() {
    var cv = $('wheel');
    function fromPointer(e) {
      var r = cv.getBoundingClientRect(), S = r.width, x = e.clientX - r.left - S / 2, y = e.clientY - r.top - S / 2;
      var R = S / 2 - 3 * S / cv.width, dist = Math.sqrt(x * x + y * y);
      wheel.h = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
      wheel.s = Math.min(1, dist / R);
      wheel.on = true;
      pickTint(wheelHex(), true);
    }
    var dragging = false;
    cv.addEventListener('pointerdown', function (e) {
      dragging = true;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* указатель уже отпущен */ }
      fromPointer(e);
      e.preventDefault();
    });
    cv.addEventListener('pointermove', function (e) { if (dragging) fromPointer(e); });
    function end() { if (dragging) { dragging = false; clearTimeout(saveT); save(); } }
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);

    $('wheel-val').addEventListener('input', function () {
      wheel.v = this.value / 100;
      if (!wheel.on) { wheel.on = true; wheel.h = wheel.h || 0; }   // сдвинули яркость — выбор начался
      pickTint(wheelHex(), true);
    });
    $('wheel-hex').addEventListener('change', function () {
      var v = this.value.trim();
      if (v && v[0] !== '#') v = '#' + v;
      if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
      if (!v) { pickTint(''); markTint(); return; }
      if (!/^#[0-9a-f]{6}$/i.test(v)) { this.value = tintOf(settings.species); return; }
      var hsv = hexToHsv(v);
      wheel.h = hsv.h; wheel.s = hsv.s; wheel.v = hsv.v; wheel.on = true;
      $('wheel-val').value = Math.round(wheel.v * 100);
      pickTint(v.toLowerCase());
    });
    $('wheel-reset').addEventListener('click', function () { pickTint(''); markTint(); });
    $('set-tintAll').addEventListener('change', function () {
      if (this.checked) {
        // общий цвет берём у текущего вида; если у него натуральный — ничего не красим
        settings.tintAll = tintOf(settings.species) || '';
        settings.tints = {};
      } else {
        settings.tintAll = '';
      }
      applyTints(); markTint(); save();
    });
    markTint();
  }

  // -------------------------------------------------------------- настройки

  // ползунки: id элемента, ключ настройки (он же параметр сцены), множитель и подпись
  var SLIDERS = [
    { id: 'count', key: 'countScale', k: 100, text: function () { return Scene.count(); } },
    { id: 'speed', key: 'speed', k: 100 },
    { id: 'size', key: 'size', k: 100 },
    { id: 'react', key: 'react', k: 100, off: true },
    { id: 'cell', key: 'cell', k: 1, text: function (v) { return v + ' px'; } },
    { id: 'density', key: 'density', k: 100 },
    { id: 'grid', key: 'grid', k: 100, off: true },
    { id: 'dust', key: 'dust', k: 100, off: true },
    { id: 'ground', key: 'ground', k: 100, off: true },
    { id: 'effects', key: 'effects', k: 100, off: true }
  ];

  function openSettings(open) {
    $('settings').hidden = !open;
    $('settings-btn').setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function markColor() {
    var bs = $('set-color').querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) {
      bs[i].setAttribute('aria-checked', bs[i].dataset.mode === settings.colorMode ? 'true' : 'false');
    }
    $('row-palette').hidden = settings.colorMode === 'natural';
    $('out-color').textContent = settings.colorMode === 'natural' ? '' :
      (Pal.active === 'adaptive' ? 'system palette' : 'no palette — natural');
  }

  function syncOutputs() {
    SLIDERS.forEach(function (sl) {
      var v = Math.round(settings[sl.key] * sl.k);
      $('out-' + sl.id).textContent = sl.text ? sl.text(v) : (sl.off && v === 0 ? 'off' : v + '%');
    });
  }

  function bindSettings() {
    $('set-name').value = settings.name;
    $('set-palette').value = settings.paletteUrl;
    $('set-search').value = settings.searchUrl;
    $('set-voiceLang').value = settings.voiceLang;
    $('row-search').hidden = Storage.extension;   // в расширении поиск идёт через браузер
    $('hint').hidden = !settings.hint;
    markColor();

    $('settings-btn').addEventListener('click', function () { openSettings($('settings').hidden); });

    SLIDERS.forEach(function (sl) {
      var el = $('set-' + sl.id);
      el.value = Math.round(settings[sl.key] * sl.k);
      el.addEventListener('input', function () {
        settings[sl.key] = +this.value / sl.k;
        var o = {}; o[sl.key] = settings[sl.key];
        Scene.set(o);
        syncOutputs(); save();
      });
    });
    syncOutputs();

    // переключатели: ключ настройки и что сделать при смене
    [
      ['paused', function (v) { Scene.set({ paused: v }); }],
      ['hint', function (v) { $('hint').hidden = !v; }],
      ['saver', function (v) { Scene.set({ saver: v }); }],
      ['voice', voiceUi],
      ['voiceAuto', null]
    ].forEach(function (t) {
      var el = $('set-' + t[0]);
      el.checked = !!settings[t[0]];
      el.addEventListener('change', function () {
        settings[t[0]] = this.checked;
        if (t[1]) t[1](this.checked);
        save();
      });
    });

    buildTints();
    $('picker-toggle').addEventListener('click', function () { setPicker(!settings.pickerHidden); });
    $('set-picker').addEventListener('change', function () { setPicker(!this.checked); });
    applyPicker();

    $('set-name').addEventListener('input', function () {
      settings.name = this.value; greeting(); save();
    });
    $('set-color').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      settings.colorMode = b.dataset.mode;
      Pal.setMode(settings.colorMode);
      if (settings.colorMode !== 'natural') Pal.startPolling(settings.paletteUrl); else Pal.stopPolling();
      markColor(); save();
    });
    $('set-palette').addEventListener('change', function () {
      settings.paletteUrl = this.value.trim() || CFG.PALETTE_URL;
      this.value = settings.paletteUrl;
      if (settings.colorMode !== 'natural') Pal.startPolling(settings.paletteUrl);
      save();
    });
    $('set-search').addEventListener('change', function () {
      settings.searchUrl = this.value.trim() || CFG.SEARCH_URL;
      this.value = settings.searchUrl;
      save();
    });
    $('set-voiceLang').addEventListener('change', function () {
      settings.voiceLang = this.value.trim();
      voiceUi(); save();
    });
    // сброс: всё к значениям по умолчанию, кроме имени и выбранного вида
    $('set-reset').addEventListener('click', function () {
      var keep = { name: settings.name, species: settings.species };
      Storage.save(Object.assign({}, GP.DEFAULTS, keep));
      location.reload();
    });
  }

  // ----------------------------------------------------- указатель и клавиши

  function zone() {
    var r = $('center').getBoundingClientRect();
    if (!r.width) { Scene.setZone(null); return; }
    Scene.setZone({ x: r.left + r.width / 2, y: r.top + r.height / 2, rx: r.width / 2 + 70, ry: r.height / 2 + 55 });
  }

  function bindInput() {
    var canvas = $('scene'), dragging = false;
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      Scene.pointer(e.clientX, e.clientY, true);
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', function () { Scene.pointer(0, 0, false); });

    // зажать существо — взять «в руку» и перетащить; по пустому месту — круг на воде
    canvas.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      if (!$('settings').hidden) { openSettings(false); return; }
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
      if (Scene.grab(e.clientX, e.clientY)) {
        dragging = true;
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* указатель уже отпущен */ }
        canvas.style.cursor = 'grabbing';
        e.preventDefault();
      } else {
        Scene.tap(e.clientX, e.clientY);
      }
    });
    canvas.addEventListener('pointermove', function (e) {
      if (dragging) { Scene.drag(e.clientX, e.clientY); return; }
      if (e.pointerType === 'mouse') canvas.style.cursor = Scene.pick(e.clientX, e.clientY) ? 'grab' : '';
    });
    function drop() {
      if (!dragging) return;
      dragging = false;
      Scene.release();
      canvas.style.cursor = '';
    }
    canvas.addEventListener('pointerup', drop);
    canvas.addEventListener('pointercancel', drop);
    canvas.addEventListener('lostpointercapture', drop);
    window.addEventListener('blur', drop);

    document.addEventListener('pointerdown', function (e) {
      if (!$('settings').hidden && !e.target.closest('#settings, #settings-btn')) openSettings(false);
    });

    $('search').addEventListener('submit', function (e) {
      e.preventDefault();
      search($('q').value);
    });

    document.addEventListener('keydown', function (e) {
      var t = e.target;
      var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (e.key === 'Escape') {
        if (!$('settings').hidden) openSettings(false);
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      // 1–9 и 0 выбирают первые десять видов; [ и ] листают все по кругу
      if (e.key >= '0' && e.key <= '9') {
        var idx = e.key === '0' ? 9 : +e.key - 1;
        if (CFG.SPECIES_ORDER[idx]) UI.select(CFG.SPECIES_ORDER[idx]);
        e.preventDefault();
        return;
      }
      if (e.key === '[' || e.key === ']') { UI.step(e.key === ']' ? 1 : -1); e.preventDefault(); return; }
      if (e.key === '/') { $('q').focus(); e.preventDefault(); return; }
      // любой печатный символ уходит в поле ввода
      if (e.key.length === 1 && e.key !== ' ') $('q').focus();
    });

    window.addEventListener('resize', function () { setTimeout(zone, 0); });
  }

  UI.sync = function () { if (settings) syncOutputs(); };

  UI.init = function (s) {
    settings = s;
    buildSwitcher();
    markSwitcher();
    greeting();
    setInterval(greeting, 30000);
    bindSettings();
    bindInput();
    bindVoice();
    zone();
    Pal.onChange = function () { Scene.paletteChanged(); markColor(); };
  };
})(window.GP);
