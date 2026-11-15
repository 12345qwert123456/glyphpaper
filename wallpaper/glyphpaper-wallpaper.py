#!/usr/bin/env python3
"""glyphpaper — живые обои для Hyprland (и любого композитора с wlr-layer-shell).

Окно GTK3 + WebKit2GTK рисуется на слое BACKGROUND на каждом мониторе и показывает страницу
в режиме обоев (?wallpaper=1). Что делает хост:
  * читает палитру с диска (palette.json шаблона Noctalia или pywal colors.json), следит за
    файлом и подставляет её в страницу — сервер палитры для обоев не нужен;
  * ставит анимацию на паузу, когда на всех мониторах открыто полноэкранное окно (по IPC Hyprland);
  * ограничивает частоту кадров (по умолчанию 30 fps).

Зависимости (Arch / CachyOS):
    sudo pacman -S python-gobject gtk3 gtk-layer-shell webkit2gtk-4.1

Запуск:
    python3 wallpaper/glyphpaper-wallpaper.py --creature koi
Автозапуск — строкой в hyprland.conf:
    exec-once = python3 ~/src/glyphpaper/wallpaper/glyphpaper-wallpaper.py --creature koi
"""
import argparse
import ctypes.util
import json
import os
import signal
import socket
import subprocess
import sys
import threading
from pathlib import Path

# gtk-layer-shell должен быть загружен раньше libwayland-client; из Python это достигается
# только через LD_PRELOAD, поэтому при первом запуске программа перезапускает сама себя.
if (os.environ.get('WAYLAND_DISPLAY') and '--no-preload' not in sys.argv
        and 'gtk-layer-shell' not in os.environ.get('LD_PRELOAD', '')):
    _lib = ctypes.util.find_library('gtk-layer-shell')
    if _lib:
        os.environ['LD_PRELOAD'] = (_lib + ' ' + os.environ.get('LD_PRELOAD', '')).strip()
        os.execv(sys.executable, [sys.executable] + sys.argv)

import gi  # noqa: E402

gi.require_version('Gtk', '3.0')
gi.require_version('Gdk', '3.0')
gi.require_version('WebKit2', '4.1')
try:
    gi.require_version('GtkLayerShell', '0.1')
    from gi.repository import GtkLayerShell
except (ValueError, ImportError):
    GtkLayerShell = None
from gi.repository import Gdk, Gio, GLib, Gtk, WebKit2  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(os.environ.get('XDG_CACHE_HOME') or Path.home() / '.cache')
DATA = Path(os.environ.get('XDG_DATA_HOME') or Path.home() / '.local' / 'share')
# палитра ищется по порядку: свой шаблон Noctalia, затем pywal-совместимый файл
DEFAULT_PALETTES = [CACHE / 'glyphpaper' / 'palette.json', CACHE / 'glyph-pond' / 'palette.json',   # второй — прежнее имя
                    CACHE / 'wal' / 'colors.json']
# события Hyprland, после которых надо перепроверить, закрыт ли рабочий стол полноэкранным окном
HYPR_EVENTS = {'fullscreen', 'workspace', 'workspacev2', 'focusedmon', 'focusedmonv2', 'openwindow',
               'closewindow', 'movewindow', 'movewindowv2', 'monitoradded', 'monitorremoved', 'activewindowv2'}


def log(*a):
    print('[glyphpaper-wallpaper]', *a, file=sys.stderr, flush=True)


# ------------------------------------------------------------------ палитра

class PaletteWatcher:
    """Следит за файлом палитры и сообщает об изменениях (с дебаунсом)."""

    def __init__(self, paths, on_change):
        self.paths = [Path(p).expanduser() for p in paths]
        self.on_change = on_change
        self.text = None            # последний принятый текст файла
        self.value = None           # его разбор
        self._timer = 0
        self._monitors = []
        for d in {p.parent for p in self.paths}:
            try:
                d.mkdir(parents=True, exist_ok=True)
                m = Gio.File.new_for_path(str(d)).monitor_directory(Gio.FileMonitorFlags.NONE, None)
                m.connect('changed', self._event)     # Noctalia пишет через переименование: следим за каталогом
                self._monitors.append(m)
            except GLib.Error as e:
                log('не удалось следить за', d, e.message)
        GLib.timeout_add_seconds(5, self._poll)         # страховка, если событие потерялось
        self.refresh()

    def _event(self, _mon, file, other, _ev):
        names = {p.name for p in self.paths}
        if (file and file.get_basename() in names) or (other and other.get_basename() in names):
            GLib.source_remove(self._timer) if self._timer else None
            self._timer = GLib.timeout_add(200, self._debounced)

    def _debounced(self):
        self._timer = 0
        self.refresh()
        return False

    def _poll(self):
        self.refresh()
        return True

    def refresh(self):
        """Читает первый существующий файл из списка; ломаный JSON (файл пишут) игнорирует."""
        for p in self.paths:
            try:
                text = p.read_text(encoding='utf-8')
            except OSError:
                continue
            if text == self.text:
                return
            try:
                value = json.loads(text)
            except ValueError:
                return                                # недописанный файл — дождёмся следующего события
            self.text, self.value = text, value
            log('палитра:', p)
            self.on_change(value)
            return
        if self.value is not None:                    # файл исчез — возвращаемся к натуральным цветам
            self.text = self.value = None
            self.on_change(None)


# ------------------------------------------------------------------ окна

class Wallpaper:
    def __init__(self, args):
        self.args = args
        self.windows = {}                             # Gdk.Monitor -> (Gtk.Window, WebKit2.WebView)
        self.palette = None
        self.paused = False
        self.layer = bool(GtkLayerShell) and GtkLayerShell.is_supported() and not args.window
        if not args.window and not self.layer:
            log('wlr-layer-shell недоступен (не Wayland-композитор или нет gtk-layer-shell) — '
                'открываю обычное окно; для отладки используйте --window')
        data = DATA / 'glyphpaper' / 'wallpaper'
        data.mkdir(parents=True, exist_ok=True)
        manager = WebKit2.WebsiteDataManager(base_data_directory=str(data / 'data'),
                                             base_cache_directory=str(data / 'cache'))
        self.context = WebKit2.WebContext.new_with_website_data_manager(manager)

        display = Gdk.Display.get_default()
        display.connect('monitor-added', lambda _d, m: self.add_monitor(m))
        display.connect('monitor-removed', lambda _d, m: self.remove_monitor(m))
        if self.layer or args.monitors == 'all':
            for i in range(display.get_n_monitors()):
                self.add_monitor(display.get_monitor(i))
        else:
            self.add_monitor(display.get_monitor(int(args.monitors)))
        if not self.windows:                           # окно без монитора (Xvfb, обычное окно)
            self.add_monitor(None)

    # --- адрес страницы
    def url(self):
        a = self.args
        base = a.url or ROOT.joinpath('index.html').as_uri()
        q = [('wallpaper', '1'), ('fps', str(a.fps))]
        if a.creature:
            q.append(('creature', a.creature))
        for item in a.set or []:
            k, _, v = item.partition('=')
            q.append((k, v))
        return base + ('&' if '?' in base else '?') + '&'.join('%s=%s' % kv for kv in q)

    # --- окна
    def add_monitor(self, monitor):
        if monitor in self.windows:
            return
        win = Gtk.Window()
        win.set_title('glyphpaper wallpaper')
        win.set_decorated(False)
        win.set_skip_taskbar_hint(True)
        if self.layer and monitor is not None:
            GtkLayerShell.init_for_window(win)
            GtkLayerShell.set_layer(win, GtkLayerShell.Layer.BACKGROUND)
            for edge in (GtkLayerShell.Edge.LEFT, GtkLayerShell.Edge.RIGHT, GtkLayerShell.Edge.TOP, GtkLayerShell.Edge.BOTTOM):
                GtkLayerShell.set_anchor(win, edge, True)
            GtkLayerShell.set_exclusive_zone(win, -1)               # не двигаем остальные окна и панели
            GtkLayerShell.set_keyboard_mode(win, GtkLayerShell.KeyboardMode.NONE)
            GtkLayerShell.set_namespace(win, 'glyphpaper-wallpaper')
            GtkLayerShell.set_monitor(win, monitor)
        else:
            win.set_default_size(1280, 720)

        view = WebKit2.WebView.new_with_context(self.context)
        s = view.get_settings()
        s.set_hardware_acceleration_policy(WebKit2.HardwareAccelerationPolicy.ALWAYS)
        s.set_allow_file_access_from_file_urls(True)
        s.set_enable_write_console_messages_to_stdout(self.args.verbose)
        s.set_enable_developer_extras(self.args.verbose)
        s.set_media_playback_requires_user_gesture(True)
        view.set_background_color(Gdk.RGBA(0.043, 0.051, 0.075, 1))
        view.connect('context-menu', lambda *_: True)                # без контекстного меню
        view.connect('load-changed', self.on_load)
        view.connect('decide-policy', self.on_policy)
        win.add(view)
        win.show_all()
        view.load_uri(self.url())
        self.windows[monitor] = (win, view)

    def remove_monitor(self, monitor):
        entry = self.windows.pop(monitor, None)
        if entry:
            entry[0].destroy()

    def on_policy(self, _view, decision, kind):
        # обои не должны уходить на другие адреса
        if kind == WebKit2.PolicyDecisionType.NAVIGATION_ACTION:
            uri = decision.get_navigation_action().get_request().get_uri()
            if not uri.startswith(('file://', 'about:')) and not (self.args.url and uri.startswith(self.args.url.split('?')[0])):
                decision.ignore()
                return True
        return False

    def on_load(self, _view, event):
        if event == WebKit2.LoadEvent.FINISHED:
            self.push_all()

    # --- связь со страницей
    def js(self, view, script, callback=None):
        try:
            if hasattr(view, 'evaluate_javascript'):
                view.evaluate_javascript(script, -1, None, None, None, callback, None)
            else:
                view.run_javascript(script, None, callback, None)
        except Exception as e:                      # noqa: BLE001 — страница может быть ещё не готова
            log('js:', e)

    def push_all(self):
        for _win, view in self.windows.values():
            self.push(view)

    def push(self, view):
        pal = json.dumps(self.palette)
        self.js(view, 'window.GlyphPaper && (GlyphPaper.setPalette(%s), GlyphPaper.pause(%s));' %
                (pal, 'true' if self.paused else 'false'))

    def set_palette(self, value):
        self.palette = value
        self.push_all()

    def set_paused(self, paused):
        if paused == self.paused:
            return False
        self.paused = paused
        log('пауза' if paused else 'продолжаем')
        self.push_all()
        return False


# ------------------------------------------------------------------ Hyprland

def hypr_covered():
    """True, если на каждом мониторе активное рабочее место закрыто полноэкранным окном."""
    try:
        mons = json.loads(subprocess.run(['hyprctl', '-j', 'monitors'], capture_output=True, text=True, timeout=2).stdout)
        wss = json.loads(subprocess.run(['hyprctl', '-j', 'workspaces'], capture_output=True, text=True, timeout=2).stdout)
    except (OSError, ValueError, subprocess.SubprocessError):
        return False
    full = {w.get('id'): bool(w.get('hasfullscreen')) for w in wss}
    return bool(mons) and all(full.get((m.get('activeWorkspace') or {}).get('id'), False) for m in mons)


def watch_hyprland(app):
    """Фоновый поток: слушает события Hyprland и обновляет паузу."""
    sig, run = os.environ.get('HYPRLAND_INSTANCE_SIGNATURE'), os.environ.get('XDG_RUNTIME_DIR')
    if not sig or not run:
        log('Hyprland не обнаружен — автопауза выключена')
        return
    path = '%s/hypr/%s/.socket2.sock' % (run, sig)

    def loop():
        while True:
            try:
                s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                s.connect(path)
                GLib.idle_add(app.set_paused, hypr_covered())
                with s.makefile('r', encoding='utf-8', errors='replace') as f:
                    for line in f:
                        if line.split('>>', 1)[0] in HYPR_EVENTS:
                            GLib.idle_add(app.set_paused, hypr_covered())
            except OSError as e:
                log('IPC Hyprland:', e)
            threading.Event().wait(3)                # соединение пропало — повторяем

    threading.Thread(target=loop, daemon=True).start()


# ------------------------------------------------------------------ проверка

def snapshot(view, path, then):
    def done(v, res, *_):
        try:
            surf = v.get_snapshot_finish(res)
            surf.write_to_png(path)
            log('снимок:', path)
        except Exception as e:                       # noqa: BLE001
            log('снимок не получился:', e)
        then()
    view.get_snapshot(WebKit2.SnapshotRegion.VISIBLE, WebKit2.SnapshotOptions.NONE, None, done)


def probe(app, args):
    """Для проверки без Wayland: через N секунд печатает состояние страницы и выходит."""
    _win, view = next(iter(app.windows.values()))

    def run():
        def got(v, res, *_):
            try:
                val = v.evaluate_javascript_finish(res)
                print(val.to_string(), flush=True)
            except Exception as e:                   # noqa: BLE001
                print('probe error:', e, flush=True)
            finish()

        def finish():
            Gtk.main_quit()

        script = ('JSON.stringify({species: GP.Scene.species(), palette: GP.Palette.active, '
                  'paused: !!document.hidden, fps: Math.round(GlyphPaper.stats().fps), '
                  'frames: GlyphPaper.stats().frames, bg: getComputedStyle(document.documentElement).getPropertyValue("--scene-bg").trim(), wallpaper: document.body.classList.contains("wallpaper"), '
                  'ui: !!document.getElementById("center") && getComputedStyle(document.getElementById("center")).display})')
        if args.screenshot:
            snapshot(view, args.screenshot, lambda: app.js(view, script, got))
        else:
            app.js(view, script, got)
        return False

    GLib.timeout_add_seconds(args.probe, run)


def main():
    ap = argparse.ArgumentParser(description='Живые обои glyphpaper для Hyprland.')
    ap.add_argument('--creature', default='koi', help='вид: butterfly, jellyfish, dragonfly, koi, frog, crane, crab, turtle, ladybug, starfish, spider, snake')
    ap.add_argument('--url', help='адрес страницы (по умолчанию index.html рядом с репозиторием; можно адрес GitHub Pages)')
    ap.add_argument('--fps', type=int, default=30, help='ограничение кадров (по умолчанию 30)')
    ap.add_argument('--set', action='append', metavar='KEY=VALUE', help='параметр страницы: speed=0.6, count=1.4, cell=10, color=natural ...')
    ap.add_argument('--palette', action='append', metavar='FILE', help='файл палитры (можно несколько); по умолчанию ~/.cache/glyphpaper/palette.json и ~/.cache/wal/colors.json')
    ap.add_argument('--no-palette', action='store_true', help='не читать палитру системы')
    ap.add_argument('--no-pause', action='store_true', help='не ставить на паузу под полноэкранными окнами')
    ap.add_argument('--monitors', default='all', help='all или номер монитора (только вне layer-shell)')
    ap.add_argument('--window', action='store_true', help='обычное окно вместо слоя обоев (отладка)')
    ap.add_argument('--no-preload', action='store_true', help='не перезапускаться с LD_PRELOAD (отладка)')
    ap.add_argument('-v', '--verbose', action='store_true', help='печатать сообщения консоли страницы')
    ap.add_argument('--probe', type=int, metavar='SEC', help='через SEC секунд напечатать состояние страницы и выйти (проверка)')
    ap.add_argument('--screenshot', metavar='PNG', help='с --probe: сохранить снимок окна')
    args = ap.parse_args()
    if not args.url and not ROOT.joinpath('index.html').exists():
        sys.exit('не найден index.html рядом со скриптом — укажите --url')

    app = Wallpaper(args)
    if not args.no_palette:
        PaletteWatcher(args.palette or DEFAULT_PALETTES, app.set_palette)
    if not args.no_pause:
        watch_hyprland(app)
    if args.probe:
        probe(app, args)
    for sig in (signal.SIGINT, signal.SIGTERM):
        GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, sig, Gtk.main_quit)
    Gtk.main()


if __name__ == '__main__':
    main()
