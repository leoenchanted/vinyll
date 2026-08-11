"""LRCLIB search and match scoring."""

from __future__ import annotations

import urllib.error
import urllib.parse

from ..common import CLIENT_NAME, base_title, fetch_json, normalize


def _score(item: dict, track: str, artist: str, album: str, duration: int) -> int:
    score = 0
    item_track = normalize(item.get("trackName", ""))
    target_track = normalize(track)
    if item_track == target_track:
        score += 12
    elif base_title(item.get("trackName", "")) == base_title(track):
        score += 9
    elif item_track in target_track or target_track in item_track:
        score += 5

    item_artist = normalize(item.get("artistName", ""))
    target_artist = normalize(artist)
    if item_artist == target_artist:
        score += 8
    elif item_artist in target_artist or target_artist in item_artist:
        score += 5
    if album and normalize(item.get("albumName", "")) == normalize(album):
        score += 4

    difference = abs(int(item.get("duration") or 0) - duration)
    if duration and difference <= 2:
        score += 6
    elif duration and difference <= 7:
        score += 2
    return score


def fetch(track: str, artist: str, album: str, duration: int) -> dict:
    headers = {"Lrclib-Client": CLIENT_NAME}
    if album and duration:
        signature = urllib.parse.urlencode({
            "track_name": track,
            "artist_name": artist,
            "album_name": album,
            "duration": duration,
        })
        try:
            return fetch_json(f"https://lrclib.net/api/get?{signature}", headers)
        except urllib.error.HTTPError as error:
            if error.code != 404:
                raise

    query = urllib.parse.urlencode({
        "track_name": track,
        "artist_name": artist,
        "album_name": album,
    })
    results = fetch_json(f"https://lrclib.net/api/search?{query}", headers)
    if not isinstance(results, list) or not results:
        return {}
    best = max(results, key=lambda item: _score(item, track, artist, album, duration))
    return best if _score(best, track, artist, album, duration) >= 12 else {}
