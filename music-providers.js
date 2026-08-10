(function () {
  "use strict";

  const STORAGE_KEY = "vinyl.music.provider";
  const metadata = {
    spotify: { id: "spotify", name: "Spotify", auth: window.spotifyAuth },
    apple: { id: "apple", name: "Apple Music", auth: window.appleMusicAuth },
    netease: { id: "netease", name: "网易云音乐", auth: window.neteaseMusicAuth },
  };

  function validId(id) {
    return Object.prototype.hasOwnProperty.call(metadata, id);
  }

  function callbackProvider() {
    const parameters = new URLSearchParams(window.location.search);
    if (parameters.has("code") || parameters.has("error") || parameters.get("spotify_login") === "1") return "spotify";
    return null;
  }

  let activeId = callbackProvider() || window.localStorage.getItem(STORAGE_KEY) || null;
  if (!validId(activeId)) activeId = null;

  function setActive(id) {
    if (!validId(id)) throw new Error(`Unknown music provider: ${id}`);
    activeId = id;
    window.localStorage.setItem(STORAGE_KEY, id);
    return metadata[id].auth;
  }

  function clear() {
    activeId = null;
    window.localStorage.removeItem(STORAGE_KEY);
  }

  function get(id) {
    return validId(id) ? metadata[id].auth : null;
  }

  function current() {
    return get(activeId);
  }

  function currentMeta() {
    return activeId ? metadata[activeId] : null;
  }

  function platform() {
    const reported = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || "";
    if (/win/i.test(reported)) return "windows";
    if (/mac/i.test(reported)) return "macos";
    return "other";
  }

  function setupHtml(id) {
    if (id === "apple") {
      return `
        <strong>Apple Music 需要站长先完成 MusicKit 配置</strong>
        在 Apple Developer 创建 Media ID 与 MusicKit 私钥，再把 Team ID、Key ID 和 .p8 私钥放进 Vercel 环境变量。配置完成后，这里的 Apple 登录会直接弹出官方授权窗口。
        <a href="https://developer.apple.com/documentation/applemusicapi/generating-developer-tokens" target="_blank" rel="noreferrer">查看 Apple 官方说明 ↗</a>
      `;
    }

    if (id === "netease") {
      const os = platform();
      const install = os === "macos"
        ? `brew install mpv\nnpm install -g @music163/ncm-cli\nncm-cli configure\nncm-cli login\ngit clone https://github.com/leoenchanted/vinyll.git\ncd vinyll/bridge && node server.js`
        : `npm install -g @music163/ncm-cli\nncm-cli configure\nncm-cli login\ngit clone https://github.com/leoenchanted/vinyll.git\ncd vinyll\\bridge\nnode server.js`;
      const requirement = os === "windows"
        ? "Windows 需要先安装 Node.js 18+ 与 mpv，并确保 mpv 在 PATH 中。"
        : os === "macos"
          ? "macOS 可用 Homebrew 安装 mpv；同样需要 Node.js 18+。"
          : "需要 Node.js 18+ 与 mpv。";
      return `
        <strong>未检测到网易云本地桥接</strong>
        ${requirement} 浏览器不能静默安装本机软件，请在终端手动执行：
        <code>${install}</code>
        启动后保持终端窗口运行，再点一次“网易云音乐”。
        <a href="https://github.com/leoenchanted/vinyll/tree/main/bridge" target="_blank" rel="noreferrer">查看完整安装说明 ↗</a>
      `;
    }
    return "";
  }

  window.musicProviders = {
    metadata,
    get activeId() { return activeId; },
    get active() { return current(); },
    get activeMeta() { return currentMeta(); },
    get,
    setActive,
    clear,
    callbackProvider,
    setupHtml,
    platform,
  };
})();
