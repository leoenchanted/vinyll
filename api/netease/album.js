"use strict";

const {
  api,
  allowMethods,
  getSession,
  normalizeAlbumDetail,
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
  if (!takeRateLimit(`album:${clientKey(request)}`, 350)) {
    response.setHeader("Retry-After", "1");
    return response.status(429).json({ code: "ALBUM_RATE_LIMITED", error: "专辑详情读取过于频繁，请稍后再试" });
  }

  const id = String(request.query.id || "").trim();
  if (!/^\d{1,20}$/.test(id)) return response.status(400).json({ code: "INVALID_ALBUM_ID", error: "专辑 ID 无效" });
  try {
    const payload = requireSuccessfulBody(await api().album({ id, cookie: session, timeout: UPSTREAM_TIMEOUT_MS }));
    return response.status(200).json(normalizeAlbumDetail(payload));
  } catch (error) {
    return sendUpstreamError(error, response, "专辑详情读取失败");
  }
};
