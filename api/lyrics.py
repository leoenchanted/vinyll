"""Vercel Function for the same-origin lyrics endpoint."""

from __future__ import annotations

import json
import urllib.parse
from http.server import BaseHTTPRequestHandler

from backend.lyrics import lyrics_parameters, lyrics_payload


class handler(BaseHTTPRequestHandler):
    def _write_json(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        track, artist, album, duration = lyrics_parameters(parsed.query)
        if not track or not artist:
            return self._write_json(400, {"error": "track and artist are required"})

        try:
            payload = lyrics_payload(track, artist, album, duration)
        except Exception as error:
            print(f"[lyrics] Vercel gateway: {error}")
            return self._write_json(502, {"error": "lyrics providers unavailable"})
        return self._write_json(200, payload)
