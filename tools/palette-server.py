#!/usr/bin/env python3
"""Glyph Pond — крошечный сервер палитры.

Отдаёт ОДИН файл (palette.json) по адресу http://127.0.0.1:PORT/palette.json
с заголовками CORS — и больше ничего. Нужен расширению новой вкладки: страница
в браузере не может читать файлы с диска.

    python3 tools/palette-server.py                  # порт 8765
    python3 tools/palette-server.py --port 9000 --file ~/.cache/glyph-pond/palette.json

Файл ищется по порядку:
  1. путь из --file
  2. $XDG_CACHE_HOME/glyph-pond/palette.json   (его пишет шаблон Noctalia)
  3. $XDG_CACHE_HOME/wal/colors.json           (pywal-совместимый файл Noctalia)
Страница понимает оба формата. Только стандартная библиотека Python 3.
"""
import argparse
import email.utils
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"          # только локальный интерфейс, не меняется
ROUTE = "/palette.json"
MAX_BYTES = 256 * 1024


def candidates(explicit):
    cache = os.environ.get("XDG_CACHE_HOME") or os.path.expanduser("~/.cache")
    paths = [explicit] if explicit else []
    paths += [os.path.join(cache, "glyph-pond", "palette.json"), os.path.join(cache, "wal", "colors.json")]
    return [os.path.abspath(os.path.expanduser(p)) for p in paths]


class Handler(BaseHTTPRequestHandler):
    server_version = "glyph-pond-palette/1.0"
    paths = []

    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "If-Modified-Since, If-None-Match, Cache-Control")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-cache")

    def plain(self, code):
        self.send_response(code)
        self.cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_OPTIONS(self):
        self.plain(204 if self.path.split("?")[0] == ROUTE else 404)

    def do_HEAD(self):
        self.serve(body=False)

    def do_GET(self):
        self.serve(body=True)

    def serve(self, body):
        if self.path.split("?")[0] != ROUTE:
            return self.plain(404)
        path = next((p for p in self.paths if os.path.isfile(p)), None)
        if not path:
            return self.plain(404)
        try:
            st = os.stat(path)
            mtime = int(st.st_mtime)
            since = self.headers.get("If-Modified-Since")
            if since:
                try:
                    if mtime <= int(email.utils.parsedate_to_datetime(since).timestamp()):
                        self.send_response(304)
                        self.cors()
                        self.send_header("Last-Modified", email.utils.formatdate(mtime, usegmt=True))
                        self.end_headers()
                        return
                except (TypeError, ValueError):
                    pass
            with open(path, "rb") as f:
                data = f.read(MAX_BYTES)
        except OSError:
            return self.plain(404)
        self.send_response(200)
        self.cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Last-Modified", email.utils.formatdate(mtime, usegmt=True))
        self.end_headers()
        if body:
            self.wfile.write(data)

    def log_message(self, fmt, *args):
        if self.server.verbose:
            sys.stderr.write("%s %s\n" % (self.log_date_time_string(), fmt % args))


def main():
    ap = argparse.ArgumentParser(description="Serve palette.json on 127.0.0.1 for Glyph Pond.")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--file", help="path to palette.json or a pywal colors.json")
    ap.add_argument("--verbose", action="store_true", help="log every request")
    a = ap.parse_args()
    Handler.paths = candidates(a.file)
    srv = ThreadingHTTPServer((HOST, a.port), Handler)
    srv.verbose = a.verbose
    print("glyph-pond palette server: http://%s:%d%s" % (HOST, a.port, ROUTE), file=sys.stderr)
    for p in Handler.paths:
        print("  %s %s" % ("+" if os.path.isfile(p) else "-", p), file=sys.stderr)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
