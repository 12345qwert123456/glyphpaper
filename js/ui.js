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
    var nav = $('switcher');
    CFG.SPECIES_ORDER.forEach(function (id, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.species = id;
      b.title = GP.species[id].label + ' — ' + (i + 1);
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
    var bs = $('switcher').querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) {
      var on = bs[i].dataset.species === settings.species;
      bs[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on && bs[i].scrollIntoView && $('switcher').scrollWidth > $('switcher').clientWidth) {
        bs[i].scrollIntoView({ block: 'nearest', inline: 'center' });
      }
    }
  }

  UI.select = function (id) {
    if (!GP.species[id] || id === settings.species) return;
    settings.species = id;
    markSwitcher();
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
      if (e.key >= '1' && e.key <= '7') {
        UI.select(CFG.SPECIES_ORDER[+e.key - 1]);
        e.preventDefault();
        return;
      }
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
