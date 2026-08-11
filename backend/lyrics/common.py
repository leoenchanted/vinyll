"""Shared text matching and HTTP utilities for lyrics providers."""

from __future__ import annotations

import json
import re
import unicodedata
import urllib.request


CLIENT_NAME = "TheVinyl/1.0 (local web project)"


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKC", value or "").casefold()
    return re.sub(r"[\s\W_]+", "", value, flags=re.UNICODE)


def base_title(value: str) -> str:
    value = re.sub(r"[\(\[（【].*?[\)\]）】]", "", value or "")
    return normalize(value)


def fetch_json(url: str, headers: dict[str, str] | None = None, timeout: int = 9):
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": CLIENT_NAME, **(headers or {})},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)
