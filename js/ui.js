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

  function greeting() {
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

  // -------------------------------------------------------------- настройки

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
    $('out-count').textContent = Scene.count();
    $('out-cell').textContent = settings.cell + ' px';
    $('out-density').textContent = Math.round(settings.density * 100) + '%';
  }

  function bindSettings() {
    $('set-name').value = settings.name;
    $('set-count').value = Math.round(settings.countScale * 100);
    $('set-cell').value = settings.cell;
    $('set-density').value = Math.round(settings.density * 100);
    $('set-palette').value = settings.paletteUrl;
    $('set-search').value = settings.searchUrl;
    $('set-paused').checked = settings.paused;
    $('set-ambient').checked = settings.ambient;
    $('set-hint').checked = settings.hint;
    $('set-saver').checked = settings.saver;
    $('row-search').hidden = Storage.extension;   // в расширении поиск идёт через браузер
    $('hint').hidden = !settings.hint;
    markColor();
    syncOutputs();

    $('settings-btn').addEventListener('click', function () { openSettings($('settings').hidden); });

    $('set-name').addEventListener('input', function () {
      settings.name = this.value; greeting(); save();
    });
    $('set-count').addEventListener('input', function () {
      settings.countScale = this.value / 100;
      Scene.set({ countScale: settings.countScale });
      syncOutputs(); save();
    });
    $('set-cell').addEventListener('input', function () {
      settings.cell = +this.value;
      Scene.set({ cell: settings.cell });
      syncOutputs(); save();
    });
    $('set-density').addEventListener('input', function () {
      settings.density = this.value / 100;
      Scene.set({ density: settings.density });
      syncOutputs(); save();
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
    $('set-ambient').addEventListener('change', function () {
      settings.ambient = this.checked; Scene.set({ ambient: settings.ambient }); save();
    });
    $('set-paused').addEventListener('change', function () {
      settings.paused = this.checked; Scene.set({ paused: settings.paused }); save();
    });
    $('set-hint').addEventListener('change', function () {
      settings.hint = this.checked; $('hint').hidden = !settings.hint; save();
    });
    $('set-saver').addEventListener('change', function () {
      settings.saver = this.checked; Scene.set({ saver: settings.saver }); save();
    });
  }

  // ----------------------------------------------------- указатель и клавиши

  function zone() {
    var r = $('center').getBoundingClientRect();
    if (!r.width) { Scene.setZone(null); return; }
    Scene.setZone({ x: r.left + r.width / 2, y: r.top + r.height / 2, rx: r.width / 2 + 70, ry: r.height / 2 + 55 });
  }

  function bindInput() {
    var canvas = $('scene');
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      Scene.pointer(e.clientX, e.clientY, true);
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', function () { Scene.pointer(0, 0, false); });

    // клик по фону: существа разлетаются
    canvas.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      if (!$('settings').hidden) { openSettings(false); return; }
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
      Scene.scatter(e.clientX, e.clientY);
    });
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

  UI.init = function (s) {
    settings = s;
    buildSwitcher();
    markSwitcher();
    greeting();
    setInterval(greeting, 30000);
    bindSettings();
    bindInput();
    zone();
    Pal.onChange = function () { Scene.paletteChanged(); markColor(); };
  };
})(window.GP);
