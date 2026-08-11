"""Concurrent lyrics aggregation, caching, and request parsing."""

from __future__ import annotations

import threading
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

from .common import normalize
from .providers.lrclib import fetch as fetch_lrclib
from .providers.netease import fetch as fetch_netease
from .providers.qq import fetch as fetch_qq


CACHE_TTL_SECONDS = 6 * 60 * 60
_CACHE: dict[str, tuple[float, dict]] = {}
_CACHE_LOCK = threading.Lock()
_UPSTREAMS = ThreadPoolExecutor(max_workers=6, thread_name_prefix="lyrics")


def _provider_result(name: str, future, timeout: int) -> dict:
    try:
        return future.result(timeout=timeout) or {}
    except Exception as error:  # One provider failing must not hide the others.
        print(f"[lyrics] {name}: {error}")
        return {}


def lyrics_payload(track: str, artist: str, album: str, duration: int) -> dict:
    key = "\u241f".join((normalize(track), normalize(artist), normalize(album), str(duration)))
    with _CACHE_LOCK:
        cached = _CACHE.get(key)
        if cached and time.time() - cached[0] < CACHE_TTL_SECONDS:
            return cached[1]

    lrclib_future = _UPSTREAMS.submit(fetch_lrclib, track, artist, album, duration)
    qq_future = _UPSTREAMS.submit(fetch_qq, track, artist, album, duration)
    netease_future = _UPSTREAMS.submit(fetch_netease, track, artist, album, duration)
    lrclib = _provider_result("LRCLIB", lrclib_future, 12)
    qq = _provider_result("QQ Music", qq_future, 14)
    netease = _provider_result("NetEase", netease_future, 12)

    synced = lrclib.get("syncedLyrics") or qq.get("original") or netease.get("original") or ""
    plain = lrclib.get("plainLyrics") or ""
    translation = qq.get("translation") or netease.get("translation") or ""
    if lrclib.get("syncedLyrics") or lrclib.get("plainLyrics"):
        source = "LRCLIB"
    elif qq.get("original"):
        source = "QQ 音乐"
    else:
        source = "网易云音乐" if synced else ""
    translation_source = "QQ 音乐" if qq.get("translation") else (
        "网易云音乐" if netease.get("translation") else ""
    )
    payload = {
        "syncedLyrics": synced,
        "plainLyrics": plain,
        "translationLyrics": translation,
        "instrumental": bool(lrclib.get("instrumental")),
        "source": source,
        "translationSource": translation_source,
    }
    with _CACHE_LOCK:
        _CACHE[key] = (time.time(), payload)
    return payload


def lyrics_parameters(query: str) -> tuple[str, str, str, int]:
    parameters = urllib.parse.parse_qs(query)
    track = (parameters.get("track") or [""])[0].strip()[:240]
    artist = (parameters.get("artist") or [""])[0].strip()[:240]
    album = (parameters.get("album") or [""])[0].strip()[:240]
    try:
        duration = max(0, min(7200, int((parameters.get("duration") or ["0"])[0])))
    except ValueError:
        duration = 0
    return track, artist, album, duration
