#!/usr/bin/env node
"use strict";

const http = require("node:http");
const { spawn } = require("node:child_process");

const HOST = "127.0.0.1";
const PORT = Number(process.env.VINYLL_BRIDGE_PORT || 17863);
const EXTRA_ORIGINS = String(process.env.VINYLL_BRIDGE_ORIGINS || "")
  .split(",")
  .map((value) => value.trim().replace(/\/$/, ""))
  .filter(Boolean);
const FIXED_ORIGINS = new Set(["https://vinyll.leoenchanted.top", ...EXTRA_ORIGINS]);
const CONTROL_COMMANDS = new Set(["pause", "resume", "next", "prev"]);

function originAllowed(origin) {
  if (!origin) return true;
  const normalized = origin.replace(/\/$/, "");
  return FIXED_ORIGINS.has(normalized)
    || /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(normalized);
}

function cors(response, origin) {
  if (origin && originAllowed(origin)) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Private-Network", "true");
}

function json(response, status, payload, origin) {
  cors(response, origin);
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function cleanTerminal(value) {
  return String(value || "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r/g, "")
    .trim();
}

function runCli(args, timeoutMs = 7000) {
  return new Promise((resolve) => {
    const child = spawn("ncm-cli", args, {
      shell: false,
      windowsHide: true,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };
    child.stdout.on("data", (chunk) => { if (stdout.length < 256000) stdout += chunk; });
    child.stderr.on("data", (chunk) => { if (stderr.length < 64000) stderr += chunk; });
    child.on("error", (error) => finish({ code: -1, error, stdout: "", stderr: error.message }));
    child.on("close", (code) => finish({ code, stdout: cleanTerminal(stdout), stderr: cleanTerminal(stderr) }));
    timer = setTimeout(() => {
      child.kill();
      finish({ code: -2, stdout: cleanTerminal(stdout), stderr: "ncm-cli command timed out" });
    }, timeoutMs);
  });
}

function firstMatch(text, expressions) {
  for (const expression of expressions) {
    const match = text.match(expression);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return "";
}

function durationToMs(value) {
  const pieces = String(value || "").split(":").map(Number);
  if (!pieces.length || pieces.some((part) => !Number.isFinite(part))) return 0;
  return pieces.reduce((seconds, part) => seconds * 60 + part, 0) * 1000;
}

function parseState(output) {
  const text = cleanTerminal(output);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") return parsed;
  } catch (_error) {
    // The official CLI currently prints a human-readable state; parse its stable labels below.
  }

  const track = firstMatch(text, [/(?:歌曲|歌名|标题|Song|Title)\s*[:：]\s*([^\n]+)/i]);
  if (!track) return null;
  const artist = firstMatch(text, [/(?:歌手|艺人|Artist)\s*[:：]\s*([^\n]+)/i]) || "网易云音乐";
  const album = firstMatch(text, [/(?:专辑|Album)\s*[:：]\s*([^\n]+)/i]) || "网易云音乐";
  const progress = text.match(/(\d{1,2}:\d{2}(?::\d{2})?)\s*[/／]\s*(\d{1,2}:\d{2}(?::\d{2})?)/);
  const paused = /(?:暂停|paused|pause)/i.test(text) && !/(?:播放中|playing)/i.test(text);
  return {
    is_playing: !paused,
    progress_ms: durationToMs(progress?.[1]),
    device: { id: "netease-cli", name: "网易云 ncm-cli" },
    item: {
      name: track,
      duration_ms: durationToMs(progress?.[2]),
      artists: [{ name: artist }],
      album: { name: album, artists: [{ name: artist }], images: [], album_type: "album" },
    },
    raw: text,
  };
}

async function health() {
  const version = await runCli(["--version"], 4000);
  if (version.error?.code === "ENOENT" || version.code === -1) {
    return { ok: true, cliInstalled: false, ready: false, platform: process.platform, message: "ncm-cli 未安装" };
  }
  const state = await runCli(["state"], 6000);
  return {
    ok: true,
    cliInstalled: version.code === 0,
    ready: state.code === 0,
    platform: process.platform,
    version: version.stdout || version.stderr,
    message: state.code === 0 ? "网易云本地桥接已就绪" : (state.stderr || state.stdout || "请先运行 ncm-cli configure 与 ncm-cli login"),
  };
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 8192) request.destroy();
    });
    request.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (error) { reject(error); }
    });
    request.on("error", reject);
  });
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin || "";
  if (!originAllowed(origin)) return json(response, 403, { error: "Origin not allowed" }, "");
  if (request.method === "OPTIONS") {
    cors(response, origin);
    response.writeHead(204);
    return response.end();
  }

  try {
    const url = new URL(request.url, `http://${HOST}:${PORT}`);
    if (request.method === "GET" && url.pathname === "/health") {
      return json(response, 200, await health(), origin);
    }
    if (request.method === "GET" && url.pathname === "/state") {
      const result = await runCli(["state"]);
      if (result.code !== 0) return json(response, 409, { error: result.stderr || result.stdout || "无法读取播放状态" }, origin);
      return json(response, 200, parseState(result.stdout) || { item: null, raw: result.stdout }, origin);
    }
    if (request.method === "GET" && url.pathname === "/library") {
      return json(response, 200, { profile: { displayName: "网易云音乐" }, items: [], total: 0 }, origin);
    }
    if (request.method === "POST" && url.pathname === "/command") {
      const body = await readBody(request);
      if (!CONTROL_COMMANDS.has(body.command)) {
        return json(response, 400, { error: "Unsupported playback command" }, origin);
      }
      const result = await runCli([body.command]);
      if (result.code !== 0) return json(response, 409, { error: result.stderr || result.stdout || "播放命令失败" }, origin);
      return json(response, 200, { ok: true, output: result.stdout }, origin);
    }
    return json(response, 404, { error: "Not found" }, origin);
  } catch (error) {
    return json(response, 500, { error: error.message || "Bridge error" }, origin);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Vinyll NetEase bridge running at http://${HOST}:${PORT}`);
  console.log("Keep this terminal open while using the website.");
});
