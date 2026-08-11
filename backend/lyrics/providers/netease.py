"""NetEase Cloud Music search and lyrics lookup."""

from __future__ import annotations

import urllib.parse

from ..common import base_title, fetch_json, normalize


def _score(song: dict, track: str, artist: str, album: str, duration: int) -> int:
    score = 0
    song_name = str(song.get("name") or "")
    if normalize(song_name) == normalize(track):
        score += 14
    elif base_title(song_name) == base_title(track):
        score += 11
    elif normalize(song_name) in normalize(track) or normalize(track) in normalize(song_name):
        score += 5

    song_artists = " ".join(str(item.get("name") or "") for item in song.get("artists", []))
    if normalize(song_artists) == normalize(artist):
        score += 9
    elif normalize(song_artists) in normalize(artist) or normalize(artist) in normalize(song_artists):
        score += 6

    song_album = str((song.get("album") or {}).get("name") or "")
    if album and normalize(song_album) == normalize(album):
        score += 4

    song_duration = round(int(song.get("duration") or 0) / 1000)
    difference = abs(song_duration - duration)
    if duration and difference <= 2:
        score += 7
    elif duration and difference <= 7:
        score += 3
    return score


def fetch(track: str, artist: str, album: str, duration: int) -> dict:
    headers = {"Referer": "https://music.163.com/", "User-Agent": "Mozilla/5.0"}
    query = urllib.parse.urlencode({
        "s": f"{track} {artist}",
        "type": 1,
        "limit": 8,
        "offset": 0,
    })
    search = fetch_json(f"https://music.163.com/api/search/get/web?{query}", headers)
    songs = (search.get("result") or {}).get("songs") or []
    if not songs:
        return {}
    best = max(songs, key=lambda song: _score(song, track, artist, album, duration))
    if _score(best, track, artist, album, duration) < 17:
        return {}

    lyric_query = urllib.parse.urlencode({
        "id": best.get("id"),
        "lv": -1,
        "kv": -1,
        "tv": -1,
    })
    payload = fetch_json(f"https://music.163.com/api/song/lyric?{lyric_query}", headers)
    return {
        "original": ((payload.get("lrc") or {}).get("lyric") or ""),
        "translation": ((payload.get("tlyric") or {}).get("lyric") or ""),
    }
