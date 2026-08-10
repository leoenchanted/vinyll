(function () {
  "use strict";

  const BRIDGE_URL = "http://127.0.0.1:17863";
  let bridgeInfo = null;

  async function request(path, options = {}) {
    let response;
    try {
      response = await fetch(`${BRIDGE_URL}${path}`, {
        ...options,
        headers: {
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.headers || {}),
        },
      });
    } catch (_error) {
      const error = new Error("没有检测到网易云本地桥接，请先完成安装并启动 bridge/server.js");
      error.code = "NETEASE_BRIDGE_UNAVAILABLE";
      throw error;
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `网易云本地桥接请求失败 (${response.status})`);
      error.code = payload.code || "NETEASE_BRIDGE_ERROR";
      throw error;
    }
    return payload;
  }

  async function probe() {
    bridgeInfo = await request("/health");
    if (!bridgeInfo.cliInstalled) {
      const error = new Error("已找到本地桥接，但还没有安装网易云官方 ncm-cli");
      error.code = "NETEASE_CLI_MISSING";
      throw error;
    }
    if (!bridgeInfo.ready) {
      const error = new Error(bridgeInfo.message || "ncm-cli 尚未配置或登录");
      error.code = "NETEASE_LOGIN_REQUIRED";
      throw error;
    }
    return bridgeInfo;
  }

  async function login() {
    await probe();
    return true;
  }

  async function getAccessToken() {
    try {
      await probe();
      return "local-bridge";
    } catch (_error) {
      return null;
    }
  }

  async function getLibrary() {
    const payload = await request("/library");
    return {
      profile: { display_name: payload.profile?.displayName || "网易云音乐" },
      items: Array.isArray(payload.items) ? payload.items : [],
      total: Number(payload.total || 0),
    };
  }

  async function getPlaybackState() {
    const state = await request("/state");
    return state?.item ? state : null;
  }

  function command(name, body = {}) {
    return request("/command", {
      method: "POST",
      body: JSON.stringify({ command: name, ...body }),
    });
  }

  const pausePlayback = () => command("pause");
  const resumePlayback = () => command("resume");
  const skipNext = () => command("next");
  const skipPrevious = () => command("prev");
  const seekPlayback = (positionMs) => command("seek", { positionMs: Math.max(0, Number(positionMs) || 0) });

  async function logout() {
    bridgeInfo = null;
  }

  window.neteaseMusicAuth = {
    login,
    logout,
    getAccessToken,
    getLibrary,
    getPlaybackState,
    pausePlayback,
    resumePlayback,
    skipNext,
    skipPrevious,
    seekPlayback,
    getAlbum: async () => { throw new Error("网易云本地桥接暂未返回专辑曲目"); },
    playAlbum: async () => { throw new Error("请先在网易云 CLI 中选择歌曲播放"); },
    needsScopeUpgrade: () => false,
    handleCallback: async () => false,
    get bridgeInfo() { return bridgeInfo; },
  };
})();
