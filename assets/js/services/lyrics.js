(() => {
  "use strict";

  const cache = new Map();
  const METADATA_LINE = /^(?:\[?(?:ar|al|ti|by|offset|re|ve):|作词|作曲|编曲|制作人)\s*/i;

  function fractionToMilliseconds(value = "") {
    if (!value) return 0;
    if (value.length === 1) return Number(value) * 100;
    if (value.length === 2) return Number(value) * 10;
    return Number(value.slice(0, 3));
  }

  function parseLrc(value = "") {
    const output = [];
    let offset = 0;
    const offsetMatch = String(value).match(/\[offset:([+-]?\d+)\]/i);
    if (offsetMatch) offset = Number(offsetMatch[1]) || 0;

    String(value).split(/\r?\n/).forEach((rawLine) => {
      const stamps = [...rawLine.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
      if (!stamps.length) return;
      const text = rawLine.replace(/\[[^\]]+\]/g, "").trim();
      if (!text || METADATA_LINE.test(text)) return;
      stamps.forEach((stamp) => {
        const timeMs = Number(stamp[1]) * 60_000 + Number(stamp[2]) * 1000 + fractionToMilliseconds(stamp[3]) + offset;
        output.push({ timeMs: Math.max(0, timeMs), text });
      });
    });

    return output
      .sort((a, b) => a.timeMs - b.timeMs)
      .filter((line, index, lines) => index === 0 || line.timeMs !== lines[index - 1].timeMs || line.text !== lines[index - 1].text);
  }

  function estimatePlainLyrics(value = "", durationMs = 0) {
    const texts = String(value).split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !METADATA_LINE.test(line));
    if (!texts.length) return [];
    const duration = Math.max(60_000, durationMs || 0);
    const start = Math.min(12_000, duration * .07);
    const available = Math.max(1, duration * .9 - start);
    return texts.map((text, index) => ({
      timeMs: Math.round(start + available * (index / Math.max(1, texts.length - 1))),
      text,
    }));
  }

  function attachTranslations(lines, translationLrc = "") {
    const translations = parseLrc(translationLrc);
    if (!translations.length) return lines;
    let cursor = 0;
    return lines.map((line) => {
      while (cursor + 1 < translations.length
        && Math.abs(translations[cursor + 1].timeMs - line.timeMs) <= Math.abs(translations[cursor].timeMs - line.timeMs)) {
        cursor += 1;
      }
      const candidate = translations[cursor];
      return {
        ...line,
        translation: candidate && Math.abs(candidate.timeMs - line.timeMs) <= 1600 ? candidate.text : "",
      };
    });
  }

  async function fetchJson(url, options = {}, timeoutMs = 12_000) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) throw new Error(`Lyrics request failed (${response.status})`);
      return response.json();
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function fetchLrclibDirect(metadata) {
    const parameters = new URLSearchParams({
      track_name: metadata.track,
      artist_name: metadata.artist,
      album_name: metadata.album || metadata.track,
      duration: String(Math.max(1, Math.round((metadata.durationMs || 0) / 1000))),
    });
    const payload = await fetchJson(`https://lrclib.net/api/get?${parameters}`, {
      headers: { "Lrclib-Client": "TheVinyl/1.0 (local web project)" },
    });
    return {
      syncedLyrics: payload.syncedLyrics || "",
      plainLyrics: payload.plainLyrics || "",
      translationLyrics: "",
      instrumental: Boolean(payload.instrumental),
      source: "LRCLIB",
      translationSource: "",
    };
  }

  async function requestLyrics(metadata) {
    const parameters = new URLSearchParams({
      track: metadata.track,
      artist: metadata.artist,
      album: metadata.album || "",
      duration: String(Math.max(0, Math.round((metadata.durationMs || 0) / 1000))),
    });
    try {
      return await fetchJson(`/api/lyrics?${parameters}`);
    } catch (proxyError) {
      try {
        return await fetchLrclibDirect(metadata);
      } catch (directError) {
        console.debug("Lyrics providers unavailable", proxyError, directError);
        throw new Error("暂时无法连接歌词服务");
      }
    }
  }

  async function getLyrics(metadata) {
    const key = [metadata.track, metadata.artist, metadata.album, metadata.durationMs]
      .map((value) => String(value || "").trim().toLocaleLowerCase())
      .join("\u241f");
    if (!metadata.track || !metadata.artist) throw new Error("缺少当前歌曲信息");
    if (!cache.has(key)) cache.set(key, requestLyrics(metadata).catch((error) => { cache.delete(key); throw error; }));
    const payload = await cache.get(key);
    const synced = parseLrc(payload.syncedLyrics || "");
    const baseLines = synced.length
      ? synced
      : estimatePlainLyrics(payload.plainLyrics || "", metadata.durationMs);
    return {
      lines: attachTranslations(baseLines, payload.translationLyrics || ""),
      instrumental: Boolean(payload.instrumental),
      synced: Boolean(synced.length),
      source: payload.source || "Lyrics",
      translationSource: payload.translationSource || "",
    };
  }

  window.lyricsService = { getLyrics, parseLrc };
})();
