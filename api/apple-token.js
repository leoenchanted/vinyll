const { createPrivateKey, sign } = require("node:crypto");

function base64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function requestOrigin(request) {
  const explicit = request.headers.origin;
  if (explicit) return explicit.replace(/\/$/, "");
  const protocol = request.headers["x-forwarded-proto"] || "https";
  const host = request.headers["x-forwarded-host"] || request.headers.host;
  return host ? `${protocol}://${host}` : "";
}

module.exports = function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const teamId = process.env.APPLE_MUSIC_TEAM_ID;
  const keyId = process.env.APPLE_MUSIC_KEY_ID;
  const encodedKey = process.env.APPLE_MUSIC_PRIVATE_KEY;
  if (!teamId || !keyId || !encodedKey) {
    return response.status(501).json({
      code: "APPLE_NOT_CONFIGURED",
      error: "Apple Music 尚未配置：请在 Vercel 添加 Team ID、Key ID 和 Media Services 私钥",
    });
  }

  const origin = requestOrigin(request);
  const allowedOrigins = String(process.env.APPLE_MUSIC_ORIGINS || "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
  if (!origin || !allowedOrigins.includes(origin)) {
    return response.status(403).json({
      code: "APPLE_ORIGIN_NOT_ALLOWED",
      error: "当前网站域名不在 APPLE_MUSIC_ORIGINS 白名单中",
    });
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
    const payload = base64Url(JSON.stringify({
      iss: teamId,
      iat: now,
      exp: now + 12 * 60 * 60,
      origin: [origin],
    }));
    const input = `${header}.${payload}`;
    const privateKey = encodedKey.replace(/\\n/g, "\n").trim();
    const signature = sign("sha256", Buffer.from(input), {
      key: createPrivateKey(privateKey),
      dsaEncoding: "ieee-p1363",
    });
    response.setHeader("Cache-Control", "private, max-age=39600");
    return response.status(200).json({ developerToken: `${input}.${base64Url(signature)}` });
  } catch (error) {
    console.error("[apple-token]", error);
    return response.status(500).json({
      code: "APPLE_TOKEN_FAILED",
      error: "Apple Music 开发者令牌生成失败，请检查 .p8 私钥格式",
    });
  }
};
