"use strict";

const {
  api,
  allowMethods,
  clientKey,
  compactNeteaseCookie,
  prepareResponse,
  profileFromBody,
  requestBody,
  requireSameOrigin,
  responseBody,
  sendUpstreamError,
  setSession,
  takeRateLimit,
  UPSTREAM_TIMEOUT_MS,
} = require("../../../backend/netease/api");

module.exports = async function handler(request, response) {
  prepareResponse(response);
  if (!allowMethods(request, response, ["POST"])) return;
  if (!requireSameOrigin(request, response)) return;

  const key = String(requestBody(request).key || "").trim();
  if (!key || key.length > 256) {
    return response.status(400).json({ code: "INVALID_QR_KEY", error: "二维码 key 无效" });
  }
  if (!takeRateLimit(`qr-check:${clientKey(request)}:${key}`, 2_000)) {
    response.setHeader("Retry-After", "2");
    return response.status(429).json({ code: "QR_CHECK_RATE_LIMITED", error: "二维码检查过于频繁" });
  }

  try {
    const result = await api().login_qr_check({ key, noCookie: true, timeout: UPSTREAM_TIMEOUT_MS });
    const payload = responseBody(result);
    const code = Number(payload.code || 0);
    if (code !== 803) return response.status(200).json({ code, message: payload.message || "" });

    const session = compactNeteaseCookie(payload.cookie || result?.cookie?.join("; ") || "");
    if (!session.includes("MUSIC_U=") && !session.includes("MUSIC_A=")) {
      return response.status(502).json({ code: "NETEASE_COOKIE_MISSING", error: "登录成功，但网易云没有返回可用会话" });
    }

    setSession(request, response, session);
    let profile = null;
    try {
      profile = profileFromBody(responseBody(await api().login_status({ cookie: session, timeout: UPSTREAM_TIMEOUT_MS })));
    } catch (_error) {
      // The saved session remains valid even if the optional profile lookup is temporarily unavailable.
    }
    return response.status(200).json({ code: 803, authenticated: true, profile });
  } catch (error) {
    return sendUpstreamError(error, response, "网易云二维码状态检查失败");
  }
};
