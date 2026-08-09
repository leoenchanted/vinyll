(() => {
  "use strict";

  const CLIENT_ID = "300a376fd99d424d891764fcc888c319";
  const SCOPES = [
    "user-library-read",
    "user-read-private",
    "user-read-playback-state",
    "user-read-currently-playing",
    "user-modify-playback-state",
  ];
  const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
  const API_ROOT = "https://api.spotify.com/v1";
  const STORAGE_PREFIX = "vinyl.spotify.";

  function isLoopbackHost(hostname) {
    return hostname === "127.0.0.1" || hostname === "[::1]";
  }

  function getRedirectUri() {
    const redirectUri = new URL(window.location.href);
    redirectUri.search = "";
    redirectUri.hash = "";

    const isSecureWebOrigin = redirectUri.protocol === "https:";
    const isLocalLoopback = redirectUri.protocol === "http:" && isLoopbackHost(redirectUri.hostname);
    if (!isSecureWebOrigin && !isLocalLoopback) {
      if (redirectUri.protocol === "file:") {
        throw new Error("Spotify 登录需要通过本地服务器或 HTTPS 打开，不能直接双击 HTML 文件");
      }
      throw new Error("Spotify 要求使用 HTTPS；本地开发仅支持 127.0.0.1 或 [::1] 回环地址");
    }

    return redirectUri.toString();
  }

  function moveLocalhostToLoopback() {
    if (window.location.protocol !== "http:" || window.location.hostname !== "localhost") return false;
    const canonicalUrl = new URL(window.location.href);
    canonicalUrl.hostname = "127.0.0.1";
    canonicalUrl.searchParams.set("spotify_login", "1");
    window.location.replace(canonicalUrl);
    return true;
  }

  const storage = {
    get(key) {
      return window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    },
    set(key, value) {
      window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, String(value));
    },
    remove(key) {
      window.localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
    },
  };

  function randomString(length = 64) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    const values = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
  }

  async function sha256(value) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  }

  function base64UrlEncode(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  }

  function saveTokenResponse(token) {
    storage.set("access_token", token.access_token);
    storage.set("expires_at", Date.now() + token.expires_in * 1000);
    if (token.refresh_token) storage.set("refresh_token", token.refresh_token);
    if (token.scope) storage.set("granted_scopes", token.scope);
  }

  async function requestToken(parameters) {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: CLIENT_ID, ...parameters }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error_description || payload.error || `Spotify token request failed (${response.status})`);
    }
    saveTokenResponse(payload);
    return payload.access_token;
  }

  async function login() {
    if (moveLocalhostToLoopback()) return;

    const redirectUri = getRedirectUri();

    const verifier = randomString(64);
    const state = randomString(32);
    const challenge = base64UrlEncode(await sha256(verifier));
    storage.set("code_verifier", verifier);
    storage.set("oauth_state", state);
    storage.set("redirect_uri", redirectUri);

    const authorizeUrl = new URL("https://accounts.spotify.com/authorize");
    authorizeUrl.search = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: redirectUri,
      code_challenge_method: "S256",
      code_challenge: challenge,
      state,
      scope: SCOPES.join(" "),
      show_dialog: "true",
    }).toString();
    window.location.assign(authorizeUrl);
  }

  async function handleCallback() {
    const parameters = new URLSearchParams(window.location.search);
    const error = parameters.get("error");
    const code = parameters.get("code");
    if (!error && !code) return false;

    const redirectUri = storage.get("redirect_uri") || getRedirectUri();
    if (error) {
      window.history.replaceState({}, "", redirectUri);
      throw new Error(error === "access_denied" ? "Spotify 登录已取消" : `Spotify 登录失败：${error}`);
    }
    const returnedState = parameters.get("state");
    const expectedState = storage.get("oauth_state");
    const verifier = storage.get("code_verifier");
    if (!returnedState || returnedState !== expectedState || !verifier) {
      throw new Error("Spotify 登录状态校验失败，请重新登录");
    }

    await requestToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    });
    storage.remove("code_verifier");
    storage.remove("oauth_state");
    storage.remove("redirect_uri");
    window.history.replaceState({}, "", redirectUri);
    return true;
  }

  async function getAccessToken() {
    const accessToken = storage.get("access_token");
    const expiresAt = Number(storage.get("expires_at") || 0);
    if (accessToken && expiresAt > Date.now() + 60_000) return accessToken;

    const refreshToken = storage.get("refresh_token");
    if (!refreshToken) return null;
    return requestToken({ grant_type: "refresh_token", refresh_token: refreshToken });
  }

  async function api(path, options = {}) {
    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error("Spotify session is not connected");
    const response = await fetch(`${API_ROOT}${path}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (response.status === 401) {
      storage.remove("access_token");
      storage.remove("expires_at");
    }
    if (response.status === 204) return null;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error?.message || `Spotify API request failed (${response.status})`);
    }
    return payload;
  }

  async function getLibrary() {
    const [profile, savedAlbums] = await Promise.all([
      api("/me"),
      api("/me/albums?limit=50&offset=0"),
    ]);
    return { profile, items: savedAlbums.items || [], total: savedAlbums.total || 0 };
  }

  function needsScopeUpgrade() {
    const hasSession = storage.get("access_token") || storage.get("refresh_token");
    if (!hasSession) return false;
    const grantedScopes = new Set((storage.get("granted_scopes") || "").split(/\s+/).filter(Boolean));
    return SCOPES.some((scope) => !grantedScopes.has(scope));
  }

  function getPlaybackState() {
    return api("/me/player");
  }

  function getAlbum(id) {
    return api(`/albums/${encodeURIComponent(id)}`);
  }

  function pausePlayback() {
    return api("/me/player/pause", { method: "PUT" });
  }

  function resumePlayback() {
    return api("/me/player/play", { method: "PUT" });
  }

  function skipNext() {
    return api("/me/player/next", { method: "POST" });
  }

  function skipPrevious() {
    return api("/me/player/previous", { method: "POST" });
  }

  function seekPlayback(positionMs) {
    const safePosition = Math.max(0, Math.round(Number(positionMs) || 0));
    return api(`/me/player/seek?position_ms=${safePosition}`, { method: "PUT" });
  }

  function playAlbum(contextUri, trackUri = null) {
    return api("/me/player/play", {
      method: "PUT",
      body: {
        context_uri: contextUri,
        ...(trackUri ? { offset: { uri: trackUri } } : {}),
      },
    });
  }

  function logout() {
    ["access_token", "refresh_token", "expires_at", "granted_scopes", "code_verifier", "oauth_state", "redirect_uri"]
      .forEach((key) => storage.remove(key));
  }

  window.spotifyAuth = {
    get redirectUri() {
      try {
        return getRedirectUri();
      } catch (error) {
        return null;
      }
    },
    login,
    logout,
    handleCallback,
    getAccessToken,
    getLibrary,
    getAlbum,
    getPlaybackState,
    pausePlayback,
    resumePlayback,
    skipNext,
    skipPrevious,
    seekPlayback,
    playAlbum,
    needsScopeUpgrade,
  };
})();
