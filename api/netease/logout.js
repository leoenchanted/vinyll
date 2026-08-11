"use strict";

const {
  allowMethods,
  clearSession,
  prepareResponse,
  requireSameOrigin,
} = require("../../backend/netease/api");

module.exports = async function handler(request, response) {
  prepareResponse(response);
  if (!allowMethods(request, response, ["POST"])) return;
  if (!requireSameOrigin(request, response)) return;
  clearSession(request, response);
  return response.status(200).json({ ok: true });
};
