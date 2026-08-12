(function () {
  "use strict";

  const API_ROOT = "/api/netease";
  const COMPANION_URL = "http://127.0.0.1:17863";
  const COMPANION_RETRY_MS = 45_000;
  const LIBRARY_PAGE_SIZE = 50;
  const LIBRARY_MAX_ALBUMS = 500;
  const LIBRARY_CACHE_KEY = "vinyl.netease.library.v1";
  const LIBRARY_CACHE_TTL = 10 * 60_000;
  const capabilities = {
    library: true,
    albumDetails: true,
    playbackRead: true,
    playbackControl: false,
    lyricSeek: false,
  };

  let profile = null;
  let companionInfo = null;
  let companionAvailable = false;
  let nextCompanionProbeAt = 0;
  let qrRunId = 0;
  let retryResolver = null;
  const albumDetails = new Map();

  const loginDialog = document.querySelector("#netease-login");
  const loginQr = document.querySelector("#netease-login-qr");
  const loginStatus = document.querySelector("#netease-login-status");
  const loginRetry = document.querySelector("#netease-login-retry");

  function delay(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  async function webRequest(path, options = {}) {
    const response = await fetch(`${API_ROOT}${path}`, {
      ...options,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `网易云请求失败 (${response.status})`);
      error.code = payload.code || "NETEASE_API_ERROR";
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  async function companionRequest(path) {
    const response = await fetch(`${COMPANION_URL}${path}`, {
      targetAddressSpace: "loopback",
      headers: { Accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `网易云本地助手请求失败 (${response.status})`);
    return payload;
  }

  function setLoginState(message, state = "waiting") {
    loginStatus.dataset.state = state;
    loginStatus.querySelector("span").textContent = message;
  }

  function showLoginDialog() {
    loginDialog.hidden = false;
    document.body.classList.add("has-netease-login");
    loginQr.hidden = true;
    loginQr.removeAttribute("src");
    loginRetry.hidden = true;
    setLoginState("正在准备登录二维码…", "loading");
    window.setTimeout(() => loginDialog.querySelector(".netease-login__close")?.focus(), 0);
  }

  function hideLoginDialog() {
    loginDialog.hidden = true;
    document.body.classList.remove("has-netease-login");
    loginRetry.hidden = true;
  }

  function cancellationError() {
    const error = new Error("已取消网易云登录");
    error.code = "NETEASE_LOGIN_CANCELLED";
    return error;
  }

  function cancelLogin() {
    qrRunId += 1;
    retryResolver?.(false);
    retryResolver = null;
    hideLoginDialog();
  }

  function waitForRetry(runId) {
    loginRetry.hidden = false;
    return new Promise((resolve) => {
      retryResolver = (retry) => {
        retryResolver = null;
        loginRetry.hidden = true;
        resolve(Boolean(retry && runId === qrRunId));
      };
    });
  }

  async function beginQrAttempt(runId) {
    loginQr.hidden = true;
    loginRetry.hidden = true;
    setLoginState("正在准备登录二维码…", "loading");
    const start = await webRequest("/auth/start", { method: "POST", body: "{}" });
    if (runId !== qrRunId) throw cancellationError();
    if (!start.qrimg) throw new Error("网易云没有返回二维码图片");
    loginQr.src = start.qrimg;
    loginQr.hidden = false;
    setLoginState("请使用网易云音乐 App 扫码", "waiting");

    while (runId === qrRunId) {
      await delay(3_000);
      if (runId !== qrRunId) throw cancellationError();
      let status;
      try {
        status = await webRequest("/auth/check", {
          method: "POST",
          body: JSON.stringify({ key: start.key }),
        });
      } catch (error) {
        if (error.status === 429) continue;
        throw error;
      }
      if (status.code === 801) setLoginState("等待扫码…", "waiting");
      if (status.code === 802) setLoginState("已扫描，请在手机上确认", "confirming");
      if (status.code === 803) {
        profile = status.profile || { display_name: "网易云音乐" };
        setLoginState("收藏库连接成功", "success");
        await delay(520);
        hideLoginDialog();
        return true;
      }
      if (status.code === 800) {
        setLoginState("二维码已过期", "error");
        return false;
      }
    }
    throw cancellationError();
  }

  async function login() {
    const runId = ++qrRunId;
    window.sessionStorage.removeItem(LIBRARY_CACHE_KEY);
    showLoginDialog();
    while (runId === qrRunId) {
      try {
        if (await beginQrAttempt(runId)) return true;
      } catch (error) {
        if (error.code === "NETEASE_LOGIN_CANCELLED") throw error;
        setLoginState(error.message || "登录二维码暂时不可用", "error");
      }
      if (!await waitForRetry(runId)) throw cancellationError();
    }
    throw cancellationError();
  }

  async function getAccessToken() {
    const session = await webRequest("/session");
    profile = session.profile || null;
    return session.authenticated ? "netease-session" : null;
  }

  async function getLibrary() {
    const cached = (() => {
      try {
        const value = JSON.parse(window.sessionStorage.getItem(LIBRARY_CACHE_KEY) || "null");
        const owner = profile?.id || profile?.display_name || "netease";
        return value?.owner === owner && Date.now() - value.savedAt < LIBRARY_CACHE_TTL ? value : null;
      } catch (_error) {
        return null;
      }
    })();
    if (cached) return { profile, items: cached.items, total: cached.total };

    const items = [];
    let offset = 0;
    let total = 0;
    let more = true;
    while (more && items.length < LIBRARY_MAX_ALBUMS) {
      const page = await webRequest(`/library?limit=${LIBRARY_PAGE_SIZE}&offset=${offset}`);
      const nextItems = Array.isArray(page.items) ? page.items : [];
      items.push(...nextItems);
      total = Math.max(Number(page.total || 0), items.length);
      more = Boolean(page.more) && nextItems.length > 0;
      offset += nextItems.length;
      if (more) await delay(650);
    }
    try {
      window.sessionStorage.setItem(LIBRARY_CACHE_KEY, JSON.stringify({
        owner: profile?.id || profile?.display_name || "netease",
        savedAt: Date.now(),
        items,
        total,
      }));
    } catch (_error) {
      // A full collection can exceed private-mode storage; the live result still works.
    }
    return {
      profile: profile || { display_name: "网易云音乐" },
      items,
      total,
    };
  }

  async function getAlbum(id) {
    const key = String(id);
    if (!albumDetails.has(key)) albumDetails.set(key, webRequest(`/album?id=${encodeURIComponent(key)}`));
    try {
      return await albumDetails.get(key);
    } catch (error) {
      albumDetails.delete(key);
      throw error;
    }
  }

  async function probeCompanion(force = false) {
    if (!force && Date.now() < nextCompanionProbeAt) return false;
    try {
      companionInfo = await companionRequest("/health");
      companionAvailable = Boolean(companionInfo?.ready);
      nextCompanionProbeAt = companionAvailable ? 0 : Date.now() + COMPANION_RETRY_MS;
      return companionAvailable;
    } catch (_error) {
      companionInfo = null;
      companionAvailable = false;
      nextCompanionProbeAt = Date.now() + COMPANION_RETRY_MS;
      return false;
    }
  }

  async function getPlaybackState() {
    if (!companionAvailable && !await probeCompanion()) return null;
    try {
      const state = await companionRequest("/state");
      return state?.item ? {
        ...state,
        read_only: true,
        capabilities: { pause: false, next: false, previous: false, seek: false },
      } : null;
    } catch (_error) {
      companionAvailable = false;
      nextCompanionProbeAt = Date.now() + COMPANION_RETRY_MS;
      return null;
    }
  }

  async function logout() {
    cancelLogin();
    try {
      await webRequest("/logout", { method: "POST", body: "{}" });
    } finally {
      profile = null;
      companionInfo = null;
      companionAvailable = false;
      nextCompanionProbeAt = 0;
      albumDetails.clear();
      window.sessionStorage.removeItem(LIBRARY_CACHE_KEY);
    }
  }

  loginDialog.querySelectorAll("[data-netease-login-close]").forEach((button) => button.addEventListener("click", cancelLogin));
  loginRetry.addEventListener("click", () => retryResolver?.(true));
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || loginDialog.hidden) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cancelLogin();
  }, true);

  window.neteaseMusicAuth = {
    capabilities,
    login,
    logout,
    getAccessToken,
    getLibrary,
    getAlbum,
    getPlaybackState,
    probePlayback: () => probeCompanion(true),
    needsScopeUpgrade: () => false,
    handleCallback: async () => false,
    get profile() { return profile; },
    get companionInfo() { return companionInfo; },
  };
})();
