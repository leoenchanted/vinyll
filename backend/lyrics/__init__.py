"""Lyrics lookup service shared by local development and Vercel."""

from .service import lyrics_parameters, lyrics_payload

__all__ = ["lyrics_parameters", "lyrics_payload"]
