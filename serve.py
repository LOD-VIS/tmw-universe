#!/usr/bin/env python3
"""Serve TMW Universe and proxy data.tmw.at through /tmw for local CORS."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent
UPSTREAM = "https://data.tmw.at"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/tmw/") or self.path == "/tmw":
            self.proxy()
            return
        super().do_GET()

    def proxy(self):
        suffix = self.path[4:]
        if not suffix.startswith("/"):
            suffix = f"/{suffix}"
        url = f"{UPSTREAM}{suffix}"
        request = urllib.request.Request(url, headers={"User-Agent": "TMW-Universe"})
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                body = response.read()
                self.send_response(response.status)
                self.send_header("Content-Type", response.headers.get("Content-Type", "application/octet-stream"))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.HTTPError as error:
            body = error.read()
            self.send_response(error.code)
            self.send_header("Content-Type", error.headers.get("Content-Type", "text/plain"))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
        except Exception as error:
            message = str(error).encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(message)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"TMW Universe http://127.0.0.1:{port}/")
    server.serve_forever()
