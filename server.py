#!/usr/bin/env python3
"""Static development server with a small same-origin lyrics gateway."""

from __future__ import annotations

import argparse
import json
import re
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
CLIENT_NAME = "TheVinyl/1.0 (local web project)"
CACHE_TTL_SECONDS = 6 * 60 * 60
_CACHE: dict[str, tuple[float, dict]] = {}
_CACHE_LOCK = threading.Lock()
_UPSTREAMS = ThreadPoolExecutor(max_workers=6, thread_name_prefix="lyrics")


def _normalize(value: str) -> str:
    value = unicodedata.normalize("NFKC", value or "").casefold()
    value = re.sub(r"[\s\W_]+", "", value, flags=re.UNICODE)
    return value


def _base_title(value: str) -> str:
    value = re.sub(r"[\(\[（【].*?[\)\]）】]", "", value or "")
    return _normalize(value)


def _fetch_json(url: str, headers: dict[str, str] | None = None, timeout: int = 9):
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": CLIENT_NAME, **(headers or {})},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def _lrclib_score(item: dict, track: str, artist: str, album: str, duration: int) -> int:
    score = 0
    item_track = _normalize(item.get("trackName", ""))
    target_track = _normalize(track)
    if item_track == target_track:
        score += 12
    elif _base_title(item.get("trackName", "")) == _base_title(track):
        score += 9
    elif item_track in target_track or target_track in item_track:
        score += 5
    item_artist = _normalize(item.get("artistName", ""))
    target_artist = _normalize(artist)
    if item_artist == target_artist:
        score += 8
    elif item_artist in target_artist or target_artist in item_artist:
        score += 5
    if album and _normalize(item.get("albumName", "")) == _normalize(album):
        score += 4
    difference = abs(int(item.get("duration") or 0) - duration)
    if duration and difference <= 2:
        score += 6
    elif duration and difference <= 7:
        score += 2
    return score


def _fetch_lrclib(track: str, artist: str, album: str, duration: int) -> dict:
    headers = {"Lrclib-Client": CLIENT_NAME}
    if album and duration:
        signature = urllib.parse.urlencode({
            "track_name": track,
            "artist_name": artist,
            "album_name": album,
            "duration": duration,
        })
        try:
            return _fetch_json(f"https://lrclib.net/api/get?{signature}", headers)
        except urllib.error.HTTPError as error:
            if error.code != 404:
                raise

    query = urllib.parse.urlencode({"track_name": track, "artist_name": artist, "album_name": album})
    results = _fetch_json(f"https://lrclib.net/api/search?{query}", headers)
    if not isinstance(results, list) or not results:
        return {}
    best = max(results, key=lambda item: _lrclib_score(item, track, artist, album, duration))
    if _lrclib_score(best, track, artist, album, duration) < 12:
        return {}
    return best


def _netease_score(song: dict, track: str, artist: str, album: str, duration: int) -> int:
    score = 0
    song_name = str(song.get("name") or "")
    if _normalize(song_name) == _normalize(track):
        score += 14
    elif _base_title(song_name) == _base_title(track):
        score += 11
    elif _normalize(song_name) in _normalize(track) or _normalize(track) in _normalize(song_name):
        score += 5

    song_artists = " ".join(str(item.get("name") or "") for item in song.get("artists", []))
    if _normalize(song_artists) == _normalize(artist):
        score += 9
    elif _normalize(song_artists) in _normalize(artist) or _normalize(artist) in _normalize(song_artists):
        score += 6

    song_album = str((song.get("album") or {}).get("name") or "")
    if album and _normalize(song_album) == _normalize(album):
        score += 4

    song_duration = round(int(song.get("duration") or 0) / 1000)
    difference = abs(song_duration - duration)
    if duration and difference <= 2:
        score += 7
    elif duration and difference <= 7:
        score += 3
    return score


def _fetch_netease(track: str, artist: str, album: str, duration: int) -> dict:
    headers = {"Referer": "https://music.163.com/", "User-Agent": "Mozilla/5.0"}
    query = urllib.parse.urlencode({
        "s": f"{track} {artist}",
        "type": 1,
        "limit": 8,
        "offset": 0,
    })
    search = _fetch_json(f"https://music.163.com/api/search/get/web?{query}", headers)
    songs = (search.get("result") or {}).get("songs") or []
    if not songs:
        return {}
    best = max(songs, key=lambda song: _netease_score(song, track, artist, album, duration))
    if _netease_score(best, track, artist, album, duration) < 17:
        return {}
    lyric_query = urllib.parse.urlencode({
        "id": best.get("id"),
        "lv": -1,
        "kv": -1,
        "tv": -1,
    })
    payload = _fetch_json(f"https://music.163.com/api/song/lyric?{lyric_query}", headers)
    return {
        "original": ((payload.get("lrc") or {}).get("lyric") or ""),
        "translation": ((payload.get("tlyric") or {}).get("lyric") or ""),
    }


def _qq_score(song: dict, track: str, artist: str) -> int:
    score = 0
    song_name = str(song.get("name") or "")
    target_name = _normalize(track)
    normalized_name = _normalize(song_name)
    if normalized_name == target_name:
        score += 15
    elif _base_title(song_name) == _base_title(track):
        score += 12
    elif normalized_name in target_name or target_name in normalized_name:
        score += 5

    song_artist = str(song.get("singer") or "")
    target_artist = _normalize(artist)
    normalized_artist = _normalize(song_artist)
    if normalized_artist == target_artist:
        score += 10
    elif normalized_artist in target_artist or target_artist in normalized_artist:
        score += 6
    return score


def _fetch_qq(track: str, artist: str, _album: str, _duration: int) -> dict:
    headers = {"Referer": "https://y.qq.com/", "User-Agent": "Mozilla/5.0"}
    query = urllib.parse.urlencode({
        "key": track,
        "format": "json",
        "inCharset": "utf-8",
        "outCharset": "utf-8",
    })
    search = _fetch_json(f"https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg?{query}", headers, timeout=6)
    songs = (((search.get("data") or {}).get("song") or {}).get("itemlist") or [])
    if not songs:
        return {}
    best = max(songs, key=lambda song: _qq_score(song, track, artist))
    if _qq_score(best, track, artist) < 21:
        return {}

    song_mid = str(best.get("mid") or "").strip()
    if not song_mid:
        return {}
    lyric_query = urllib.parse.urlencode({"mid": song_mid, "trans": 1})
    payload = _fetch_json(f"https://api.ygking.top/api/lyric?{lyric_query}", headers, timeout=8)
    data = payload.get("data") or {}
    return {
        "original": str(data.get("lyric") or ""),
        "translation": str(data.get("trans") or ""),
    }


def _lyrics_payload(track: str, artist: str, album: str, duration: int) -> dict:
    key = "\u241f".join((_normalize(track), _normalize(artist), _normalize(album), str(duration)))
    with _CACHE_LOCK:
        cached = _CACHE.get(key)
        if cached and time.time() - cached[0] < CACHE_TTL_SECONDS:
            return cached[1]

    lrclib_future = _UPSTREAMS.submit(_fetch_lrclib, track, artist, album, duration)
    qq_future = _UPSTREAMS.submit(_fetch_qq, track, artist, album, duration)
    netease_future = _UPSTREAMS.submit(_fetch_netease, track, artist, album, duration)
    try:
        lrclib = lrclib_future.result(timeout=12) or {}
    except Exception as error:  # One provider failing must not hide the other.
        print(f"[lyrics] LRCLIB: {error}")
        lrclib = {}
    try:
        qq = qq_future.result(timeout=14) or {}
    except Exception as error:
        print(f"[lyrics] QQ Music: {error}")
        qq = {}
    try:
        netease = netease_future.result(timeout=12) or {}
    except Exception as error:
        print(f"[lyrics] NetEase: {error}")
        netease = {}

    synced = lrclib.get("syncedLyrics") or qq.get("original") or netease.get("original") or ""
    plain = lrclib.get("plainLyrics") or ""
    translation = qq.get("translation") or netease.get("translation") or ""
    payload = {
        "syncedLyrics": synced,
        "plainLyrics": plain,
        "translationLyrics": translation,
        "instrumental": bool(lrclib.get("instrumental")),
        "source": "LRCLIB" if (lrclib.get("syncedLyrics") or lrclib.get("plainLyrics")) else ("QQ 音乐" if qq.get("original") else ("网易云音乐" if synced else "")),
        "translationSource": "QQ 音乐" if qq.get("translation") else ("网易云音乐" if netease.get("translation") else ""),
    }
    with _CACHE_LOCK:
        _CACHE[key] = (time.time(), payload)
    return payload


def _lyrics_parameters(query: str) -> tuple[str, str, str, int]:
    parameters = urllib.parse.parse_qs(query)
    track = (parameters.get("track") or [""])[0].strip()[:240]
    artist = (parameters.get("artist") or [""])[0].strip()[:240]
    album = (parameters.get("album") or [""])[0].strip()[:240]
    try:
        duration = max(0, min(7200, int((parameters.get("duration") or ["0"])[0])))
    except ValueError:
        duration = 0
    return track, artist, album, duration


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

        track, artist, album, duration = _lyrics_parameters(parsed.query)
        if not track or not artist:
            return self._write_json(400, {"error": "track and artist are required"})
        try:
            return self._write_json(200, _lyrics_payload(track, artist, album, duration))
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
