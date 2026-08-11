"""QQ Music search and lyrics lookup."""

from __future__ import annotations

import urllib.parse

from ..common import base_title, fetch_json, normalize


def _score(song: dict, track: str, artist: str) -> int:
    score = 0
    song_name = str(song.get("name") or "")
    target_name = normalize(track)
    normalized_name = normalize(song_name)
    if normalized_name == target_name:
        score += 15
    elif base_title(song_name) == base_title(track):
        score += 12
    elif normalized_name in target_name or target_name in normalized_name:
        score += 5

    song_artist = str(song.get("singer") or "")
    target_artist = normalize(artist)
    normalized_artist = normalize(song_artist)
    if normalized_artist == target_artist:
        score += 10
    elif normalized_artist in target_artist or target_artist in normalized_artist:
        score += 6
    return score


def fetch(track: str, artist: str, _album: str, _duration: int) -> dict:
    headers = {"Referer": "https://y.qq.com/", "User-Agent": "Mozilla/5.0"}
    query = urllib.parse.urlencode({
        "key": track,
        "format": "json",
        "inCharset": "utf-8",
        "outCharset": "utf-8",
    })
    search = fetch_json(
        f"https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg?{query}",
        headers,
        timeout=6,
    )
    songs = (((search.get("data") or {}).get("song") or {}).get("itemlist") or [])
    if not songs:
        return {}
    best = max(songs, key=lambda song: _score(song, track, artist))
    if _score(best, track, artist) < 21:
        return {}

    song_mid = str(best.get("mid") or "").strip()
    if not song_mid:
        return {}
    lyric_query = urllib.parse.urlencode({"mid": song_mid, "trans": 1})
    payload = fetch_json(f"https://api.ygking.top/api/lyric?{lyric_query}", headers, timeout=8)
    data = payload.get("data") or {}
    return {
        "original": str(data.get("lyric") or ""),
        "translation": str(data.get("trans") or ""),
    }
