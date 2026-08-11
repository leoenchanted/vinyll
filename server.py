#!/usr/bin/env python3
"""Static development server with a small same-origin lyrics gateway."""

from __future__ import annotations

import argparse
import json
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from backend.lyrics import lyrics_parameters, lyrics_payload


ROOT = Path(__file__).resolve().parent


class VinylHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _write_json(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/api/lyrics":
            return super().do_GET()

        track, artist, album, duration = lyrics_parameters(parsed.query)
        if not track or not artist:
            return self._write_json(400, {"error": "track and artist are required"})
        try:
            return self._write_json(200, lyrics_payload(track, artist, album, duration))
        except Exception as error:
            print(f"[lyrics] gateway: {error}")
            return self._write_json(502, {"error": "lyrics providers unavailable"})


class VinylServer(ThreadingHTTPServer):
    allow_reuse_address = True


def main():
    parser = argparse.ArgumentParser(description="Serve The Vinyl with lyrics support")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    server = VinylServer(("127.0.0.1", args.port), VinylHandler)
    print(f"The Vinyl running at http://127.0.0.1:{args.port}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
