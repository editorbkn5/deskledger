"""Loopback-only HTTP entry point with a same-origin write token."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib.resources import files
import json
import os
from pathlib import Path
import secrets
import sys
import webbrowser

from .store import Problem, Store, record

ASSETS = {
    "/": ("index.html", "text/html"),
    "/style.css": ("style.css", "text/css"),
    "/app.js": ("app.js", "text/javascript"),
    "/i18n.js": ("i18n.js", "text/javascript"),
}
MAX_BODY = 32 * 1024 * 1024


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def send_content(self, body, mime, status=200):
        self.send_response(status)
        self.send_header("Content-Type", mime + "; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy",
                         "default-src 'self'; script-src 'self'; style-src 'self'; "
                         "img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; "
                         "base-uri 'none'; form-action 'none'")
        self.end_headers()
        self.wfile.write(body)

    def payload(self, value, status=200):
        self.send_content(json.dumps(value, ensure_ascii=False, allow_nan=False).encode(), "application/json", status)

    def valid_host(self):
        return self.headers.get("Host") == self.server.authority

    def valid_token(self):
        token = self.headers.get("X-DeskLedger-Token", "")
        return token.isascii() and secrets.compare_digest(token, self.server.token)

    def do_GET(self):
        if not self.valid_host():
            self.payload({"error": "forbidden"}, 403)
            return
        if self.path == "/api/state":
            if not self.valid_token():
                self.payload({"error": "forbidden"}, 403)
                return
            self.payload({"state": self.server.store.get()})
        elif self.path in ASSETS:
            asset, mime = ASSETS[self.path]
            self.send_content(files("deskledger").joinpath("static", asset).read_bytes(), mime)
        else:
            self.payload({"error": "notFound"}, 404)

    def do_POST(self):
        operations = {"/api/" + key: key for key in ("settings", "customer", "sale", "restore")}
        try:
            if (not self.valid_host() or not self.valid_token()
                    or self.headers.get("Origin") != "http://" + self.server.authority):
                raise Problem("forbidden", 403)
            if self.path not in operations:
                raise Problem("notFound", 404)
            if self.headers.get_content_type() != "application/json":
                raise Problem("invalid")
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= MAX_BODY:
                raise Problem("fileSize", 413)
            data = record(json.loads(self.rfile.read(size)))
            self.payload(self.server.store.update(operations[self.path], data))
        except Problem as error:
            self.payload({"error": error.code}, error.status)
        except (ValueError, RecursionError):
            self.payload({"error": "invalid"}, 400)
        except Exception as error:
            print(f"DeskLedger could not complete a write ({type(error).__name__}).", file=sys.stderr)
            self.payload({"error": "storage"}, 500)


def create_server(path, port=0):
    store = Store(path)
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.authority = f"127.0.0.1:{server.server_port}"
    server.token = secrets.token_hex(32)
    server.store = store
    return server


def data_path():
    home = Path.home()
    if os.name == "nt":
        root = Path(os.environ.get("LOCALAPPDATA") or home / "AppData" / "Local")
    else:
        root = Path(os.environ.get("XDG_DATA_HOME") or home / ".local" / "share")
    return root / "DeskLedger" / "deskledger.db"


def main():
    parser = argparse.ArgumentParser(description="Run DeskLedger locally.")
    parser.add_argument("--data", type=Path, default=data_path())
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    args.data.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with create_server(args.data, args.port) as server:
        url = f"http://{server.authority}/#{server.token}"
        print(f"DeskLedger: {url}", flush=True)
        if not args.no_browser:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
