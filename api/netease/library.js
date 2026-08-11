"use strict";

const {
  api,
  allowMethods,
  getSession,
  normalizeAlbum,
  prepareResponse,
  requireSuccessfulBody,
  sendUpstreamError,
  clientKey,
  takeRateLimit,
  UPSTREAM_TIMEOUT_MS,
} = require("../../backend/netease/api");

module.exports = async function handler(request, response) {
  prepareResponse(response);
  if (!allowMethods(request, response, ["GET"])) return;
  const session = getSession(request);
  if (!session) return response.status(401).json({ code: "NETEASE_LOGIN_REQUIRED", error: "请先扫码登录网易云音乐" });
  if (!takeRateLimit(`library:${clientKey(request)}`, 500)) {
    response.setHeader("Retry-After", "1");
    return response.status(429).json({ code: "LIBRARY_RATE_LIMITED", error: "收藏专辑读取过于频繁，请稍后再试" });
  }

  const limit = Math.max(1, Math.min(50, Number(request.query.limit || 50)));
  const offset = Math.max(0, Math.min(5_000, Number(request.query.offset || 0)));
  try {
    const payload = requireSuccessfulBody(await api().album_sublist({
      cookie: session,
      limit,
      offset,
      timeout: UPSTREAM_TIMEOUT_MS,
    }));
    const source = Array.isArray(payload.data) ? payload.data : [];
    const items = source.map((album) => ({ album: normalizeAlbum(album) }));
    const total = Number(payload.count || payload.total || offset + items.length);
    const more = Boolean(payload.hasMore ?? payload.more ?? (items.length === limit && offset + items.length < total));
    return response.status(200).json({ items, total, more, offset, limit });
  } catch (error) {
    return sendUpstreamError(error, response, "收藏专辑读取失败");
  }
};
