"use strict";

const {
  api,
  allowMethods,
  clearSession,
  getSession,
  prepareResponse,
  profileFromBody,
  requireSuccessfulBody,
  sendUpstreamError,
  UPSTREAM_TIMEOUT_MS,
} = require("../../backend/netease/api");

module.exports = async function handler(request, response) {
  prepareResponse(response);
  if (!allowMethods(request, response, ["GET"])) return;
  const session = getSession(request);
  if (!session) return response.status(200).json({ authenticated: false, profile: null });

  try {
    const payload = requireSuccessfulBody(await api().login_status({ cookie: session, timeout: UPSTREAM_TIMEOUT_MS }));
    const profile = profileFromBody(payload);
    if (!profile) {
      clearSession(request, response);
      return response.status(200).json({ authenticated: false, profile: null });
    }
    return response.status(200).json({ authenticated: true, profile });
  } catch (error) {
    const code = Number(error?.body?.code || error?.status || 0);
    if (code === 301) {
      clearSession(request, response);
      return response.status(200).json({ authenticated: false, profile: null });
    }
    return sendUpstreamError(error, response, "网易云登录状态检查失败");
  }
};
