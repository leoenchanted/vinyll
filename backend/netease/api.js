"use strict";

const SESSION_COOKIE = "vinyll_netease_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const UPSTREAM_TIMEOUT_MS = 10_000;
const ALLOWED_NETEASE_COOKIES = new Set(["MUSIC_U", "MUSIC_A", "__csrf", "NMTID"]);
const rateLimits = new Map();

let enhancedApi = null;

function api() {
  if (!enhancedApi) enhancedApi = require("@neteasecloudmusicapienhanced/api");
  return enhancedApi;
}

function parseCookies(header = "") {
  return String(header)
    .split(/;\s*/)
    .reduce((cookies, part) => {
      const separator = part.indexOf("=");
      if (separator < 1) return cookies;
      const name = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      if (name) cookies[name] = value;
      return cookies;
    }, {});
}

function compactNeteaseCookie(raw = "") {
  const pairs = [];
  String(raw).split(/;\s*/).forEach((part) => {
    const separator = part.indexOf("=");
    if (separator < 1) return;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (ALLOWED_NETEASE_COOKIES.has(name) && value) pairs.push(`${name}=${value}`);
  });
  const unique = new Map(pairs.map((pair) => [pair.slice(0, pair.indexOf("=")), pair]));
  return [...unique.values()].join("; ");
}

function encodeSession(value) {
  return Buffer.from(String(value), "utf8").toString("base64url");
}

function decodeSession(value = "") {
  try {
    return Buffer.from(String(value), "base64url").toString("utf8");
  } catch (_error) {
    return "";
  }
}

function getSession(request) {
  const value = parseCookies(request.headers.cookie || "")[SESSION_COOKIE];
  return value ? compactNeteaseCookie(decodeSession(value)) : "";
}

function isSecureRequest(request) {
  const forwarded = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  return forwarded === "https" || Boolean(request.socket?.encrypted);
}

function sessionCookie(request, value, maxAge = SESSION_MAX_AGE) {
  const parts = [
    `${SESSION_COOKIE}=${value ? encodeSession(value) : ""}`,
    "Path=/",
    `Max-Age=${value ? maxAge : 0}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (isSecureRequest(request)) parts.push("Secure");
  return parts.join("; ");
}

function setSession(request, response, value) {
  response.setHeader("Set-Cookie", sessionCookie(request, compactNeteaseCookie(value)));
}

function clearSession(request, response) {
  response.setHeader("Set-Cookie", sessionCookie(request, "", 0));
}

function prepareResponse(response) {
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("X-Content-Type-Options", "nosniff");
}

function allowMethods(request, response, methods) {
  if (methods.includes(request.method)) return true;
  response.setHeader("Allow", methods.join(", "));
  response.status(405).json({ code: "METHOD_NOT_ALLOWED", error: "Method not allowed" });
  return false;
}

function sameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  const host = String(request.headers["x-forwarded-host"] || request.headers.host || "").split(",")[0].trim();
  try {
    return new URL(origin).host === host;
  } catch (_error) {
    return false;
  }
}

function requireSameOrigin(request, response) {
  if (sameOrigin(request)) return true;
  response.status(403).json({ code: "ORIGIN_NOT_ALLOWED", error: "当前来源不能访问网易云登录接口" });
  return false;
}

function requestBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body !== "string" || !request.body.trim()) return {};
  try {
    return JSON.parse(request.body);
  } catch (_error) {
    return {};
  }
}

function clientKey(request) {
  return String(request.headers["x-forwarded-for"] || request.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim();
}

function takeRateLimit(key, intervalMs) {
  const now = Date.now();
  const previous = rateLimits.get(key) || 0;
  if (now - previous < intervalMs) return false;
  rateLimits.set(key, now);
  if (rateLimits.size > 2_000) {
    const cutoff = now - 10 * 60_000;
    for (const [storedKey, timestamp] of rateLimits) {
      if (timestamp < cutoff) rateLimits.delete(storedKey);
    }
  }
  return true;
}

function profileFromBody(body = {}) {
  const profile = body.data?.profile || body.profile || null;
  const account = body.data?.account || body.account || null;
  if (!profile && !account) return null;
  return {
    id: profile?.userId || account?.id || null,
    display_name: profile?.nickname || account?.userName || "网易云音乐",
    avatar: profile?.avatarUrl || null,
  };
}

function isoDate(value) {
  const timestamp = Number(value || 0);
  if (!timestamp) return "";
  try {
    return new Date(timestamp).toISOString().slice(0, 10);
  } catch (_error) {
    return "";
  }
}

function coverUrl(value, size = 1000) {
  const url = String(value || "").trim();
  if (!url) return null;
  return `${url}${url.includes("?") ? "&" : "?"}param=${size}y${size}`;
}

function normalizeArtists(artists = []) {
  return (Array.isArray(artists) ? artists : [])
    .map((artist) => ({ id: artist?.id || null, name: artist?.name || "" }))
    .filter((artist) => artist.name);
}

function normalizeAlbum(album = {}) {
  const artists = normalizeArtists(album.artists || album.ar);
  const published = isoDate(album.publishTime || album.publish_time);
  const publisher = album.company || album.label || album.description?.company || null;
  return {
    id: album.id,
    name: album.name || "Untitled album",
    artists,
    images: coverUrl(album.picUrl || album.pic_url || album.blurPicUrl) ? [{ url: coverUrl(album.picUrl || album.pic_url || album.blurPicUrl) }] : [],
    release_date: published,
    external_urls: { netease: album.id ? `https://music.163.com/album?id=${album.id}` : null },
    uri: null,
    album_type: album.type || album.subType || "album",
    total_tracks: Number(album.size || album.trackCount || album.songs?.length || 0),
    label: publisher,
    copyrights: publisher ? [{ type: "C", text: `© ${published.slice(0, 4)} ${publisher}`.trim() }] : [],
  };
}

function normalizeTrack(track = {}, index = 0) {
  return {
    id: track.id,
    uri: null,
    name: track.name || `Track ${index + 1}`,
    artists: normalizeArtists(track.ar || track.artists),
    duration_ms: Number(track.dt || track.duration || 0),
    track_number: Number(track.no || track.trackNumber || index + 1),
  };
}

function normalizeAlbumDetail(body = {}) {
  const source = body.album || body.data?.album || {};
  const songs = body.songs || body.data?.songs || source.songs || [];
  const album = normalizeAlbum({ ...source, size: source.size || songs.length });
  return {
    ...album,
    tracks: { items: songs.map(normalizeTrack) },
  };
}

function responseBody(result) {
  return result?.body || result || {};
}

function requireSuccessfulBody(result, fallback = "网易云请求失败") {
  const body = responseBody(result);
  const code = Number(body?.code || result?.status || 200);
  if (code === 301 || code >= 400) {
    const error = new Error(body?.message || body?.msg || fallback);
    error.status = code;
    error.body = body;
    throw error;
  }
  return body;
}

function upstreamMessage(error, fallback) {
  return error?.body?.message
    || error?.body?.msg
    || error?.message
    || fallback;
}

function sendUpstreamError(error, response, fallback = "网易云服务暂时不可用") {
  const code = Number(error?.body?.code || error?.status || 0);
  if (code === 301) return response.status(401).json({ code: "NETEASE_LOGIN_REQUIRED", error: "网易云登录已失效，请重新扫码" });
  if (code === 460 || code === 503) return response.status(503).json({ code: "NETEASE_RISK_CONTROL", error: "网易云暂时限制了当前网络请求，请稍后再试" });
  return response.status(502).json({ code: "NETEASE_UPSTREAM_ERROR", error: upstreamMessage(error, fallback) });
}

module.exports = {
  api,
  allowMethods,
  clearSession,
  clientKey,
  compactNeteaseCookie,
  getSession,
  normalizeAlbum,
  normalizeAlbumDetail,
  normalizeTrack,
  prepareResponse,
  profileFromBody,
  requestBody,
  requireSameOrigin,
  responseBody,
  requireSuccessfulBody,
  sendUpstreamError,
  setSession,
  takeRateLimit,
  UPSTREAM_TIMEOUT_MS,
};
