"use strict";

const {
  api,
  allowMethods,
  clientKey,
  prepareResponse,
  requireSameOrigin,
  responseBody,
  sendUpstreamError,
  takeRateLimit,
  UPSTREAM_TIMEOUT_MS,
} = require("../../../backend/netease/api");

module.exports = async function handler(request, response) {
  prepareResponse(response);
  if (!allowMethods(request, response, ["POST"])) return;
  if (!requireSameOrigin(request, response)) return;

  const limiterKey = `qr-start:${clientKey(request)}`;
  if (!takeRateLimit(limiterKey, 15_000)) {
    response.setHeader("Retry-After", "15");
    return response.status(429).json({ code: "QR_START_RATE_LIMITED", error: "请稍等片刻再生成新的二维码" });
  }

  try {
    const keyPayload = responseBody(await api().login_qr_key({ timeout: UPSTREAM_TIMEOUT_MS }));
    const key = keyPayload.data?.unikey;
    if (!key) throw new Error("网易云没有返回二维码 key");
    const qrPayload = responseBody(await api().login_qr_create({ key, qrimg: true, platform: "web", timeout: UPSTREAM_TIMEOUT_MS }));
    return response.status(200).json({
      key,
      qrimg: qrPayload.data?.qrimg || "",
      qrurl: qrPayload.data?.qrurl || "",
      expiresIn: 300,
    });
  } catch (error) {
    return sendUpstreamError(error, response, "网易云登录二维码生成失败");
  }
};
