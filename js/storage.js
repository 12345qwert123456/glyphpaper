/* Настройки хранятся только локально: chrome.storage в расширении,
 * localStorage на обычной странице. */
(function (GP) {
  'use strict';

  var KEY = 'glyph-pond';
  var api = null;
  try {
    var root = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
    if (root && root.storage && root.storage.local && root.runtime && root.runtime.id) api = root.storage.local;
  } catch (e) { api = null; }

  var S = GP.Storage = { extension: !!api };

  S.load = function () {
    return new Promise(function (resolve) {
      if (api) {
        try {
          var done = function (items) { resolve((items && items[KEY]) || {}); };
          var p = api.get(KEY);                       // MV3: промис и в Firefox, и в Chromium
          if (p && typeof p.then === 'function') p.then(done, function () { resolve({}); });
          else api.get(KEY, done);
          return;
        } catch (e) { /* падаем в localStorage */ }
      }
      try { resolve(JSON.parse(localStorage.getItem(KEY) || '{}') || {}); }
      catch (e2) { resolve({}); }
    });
  };

  S.save = function (data) {
    if (api) {
      try {
        var o = {}; o[KEY] = data;
        var p = api.set(o);
        if (p && typeof p.catch === 'function') p.catch(function () {});
        return;
      } catch (e) { /* падаем в localStorage */ }
    }
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e2) { /* приватный режим */ }
  };
})(window.GP);
