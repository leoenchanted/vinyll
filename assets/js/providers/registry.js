(function () {
  "use strict";

  const STORAGE_KEY = "vinyl.music.provider";
  const metadata = {
    spotify: { id: "spotify", name: "Spotify", auth: window.spotifyAuth },
    apple: { id: "apple", name: "Apple Music", auth: window.appleMusicAuth, available: false },
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
  if (!validId(activeId) || metadata[activeId]?.available === false) {
    activeId = null;
    window.localStorage.removeItem(STORAGE_KEY);
  }

  function setActive(id) {
    if (!validId(id)) throw new Error(`Unknown music provider: ${id}`);
    if (metadata[id].available === false) throw new Error(`${metadata[id].name} 暂不可用`);
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
        <strong>Apple Music 暂不可用</strong>
        站主目前尚未开通付费 Apple Developer Program，因此无法创建 MusicKit 所需的 Media ID 与私钥。入口会在完成官方开发者配置后开放。
      `;
    }

    if (id === "netease") {
      const os = platform();
      if (os === "windows") {
        return `
          <strong>收藏专辑与本地播放彼此独立</strong>
          <p>扫码登录只用于载入收藏专辑和曲目。Windows 助手是可选项，只读取网易云桌面客户端正在播放的歌曲、封面和进度，用来显示黑胶与同步歌词。</p>
          <ol>
            <li><b>收藏专辑：</b>你的扫码会话已经连接，不需要重复登录。</li>
            <li><b>同步播放：</b>下载并双击一次 Windows 助手，然后在网易云 App 播放歌曲。</li>
            <li><b>控制播放：</b>暂停、切歌和拖动进度始终在网易云音乐 App 内完成。</li>
          </ol>
          <a class="provider-setup__download" href="https://github.com/leoenchanted/vinyll/releases/latest/download/Vinyll.NeteaseBridge-win-x64.exe">下载 Windows 本地助手 ↓</a>
          <a href="https://github.com/leoenchanted/vinyll/tree/main/bridge#windows推荐" target="_blank" rel="noreferrer">查看安装与排错说明 ↗</a>
        `;
      }
      if (os === "macos") {
        return `
          <strong>收藏唱片架已经可以使用</strong>
          <p>扫码登录和收藏专辑在 Mac 上与 Windows 一样可用，不需要安装助手。</p>
          <p><b>当前歌曲同步仍是开发者方案：</b>现有桥接读取的是 <code class="provider-setup__inline">ncm-cli + mpv</code> 的播放状态，不是网易云官方 Mac 客户端，因此还不能当作 Windows 原生助手的等价功能。</p>
          <a href="https://github.com/leoenchanted/vinyll/tree/main/bridge#macos--linux%E7%8E%B0%E6%9C%89%E5%91%BD%E4%BB%A4%E8%A1%8C%E6%96%B9%E6%A1%88" target="_blank" rel="noreferrer">查看 Mac 现有同步步骤 ↗</a>
        `;
      }
      return `
        <strong>收藏专辑可以直接使用</strong>
        <p>使用网易云音乐 App 扫码后即可浏览收藏专辑与曲目。当前歌曲的本地只读同步目前优先支持 Windows；当前系统仍可正常使用网页收藏唱片架。</p>
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
