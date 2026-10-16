"""Serves the repository for the web version (make web-serve).

Like `python3 -m http.server`, bound to 127.0.0.1 (Web MIDI and AudioWorklet
need a secure context, which localhost is), with `Cache-Control: no-store` so
that a page reloaded after `make web` never mixes old and new modules.

    python3 scripts/web_serve.py [PORT]
"""

import functools
import http.server
import os
import sys


class NoStoreHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".wasm": "application/wasm",
        ".json": "application/json",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    handler = functools.partial(NoStoreHandler, directory=root)
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
        print(f"coopiano web: http://localhost:{port}/web/ (Ctrl-C to stop)", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
