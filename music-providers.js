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
          <strong>直接连接网易云音乐 Windows 桌面客户端</strong>
          <p>无需申请开发者凭证，也不再需要 Node.js、mpv 或 ncm-cli。助手优先读取 Windows 系统媒体会话；若当前网易云版本关闭了 SMTC，则只从 <code class="provider-setup__inline">cloudmusic.exe</code> 窗口和本机播放队列补齐当前歌曲信息，不会读取账号密码。</p>
          <ol>
            <li><b>下载助手：</b>点击下方按钮，下载单文件 Windows 助手。</li>
            <li><b>双击安装：</b>助手会安装到当前用户目录、自动启动并驻留在系统托盘；不需要管理员权限。</li>
            <li><b>播放歌曲：</b>打开网易云音乐桌面客户端并播放任意歌曲。</li>
            <li><b>允许本地访问：</b>回到 Vinyll，再点一次“网易云音乐”；浏览器首次询问本地网络权限时请选择允许。</li>
          </ol>
          <a href="https://github.com/leoenchanted/vinyll/releases/latest/download/Vinyll.NeteaseBridge-win-x64.exe">下载 Windows 本地助手 ↓</a>
          <p>如果 Windows SmartScreen 提示未知发布者，请先确认下载地址为本项目 GitHub Releases。正式代码签名证书可在后续消除该提示。</p>
          <a href="https://github.com/leoenchanted/vinyll/tree/main/bridge#windows推荐" target="_blank" rel="noreferrer">查看安装与排错说明 ↗</a>
        `;
      }
      const install = os === "macos"
        ? `brew install mpv\nnpm install -g @music163/ncm-cli\nncm-cli configure\nncm-cli login\ngit clone https://github.com/leoenchanted/vinyll.git\ncd vinyll/bridge && node server.js`
        : `npm install -g @music163/ncm-cli\nncm-cli configure\nncm-cli login\ngit clone https://github.com/leoenchanted/vinyll.git\ncd vinyll\\bridge\nnode server.js`;
      const requirement = os === "macos"
          ? "macOS 可用 Homebrew 安装 mpv；同样需要 Node.js 18+。"
          : "需要 Node.js 18+ 与 mpv。";
      return `
        <strong>每台电脑都需要完成一次网易云本地配置</strong>
        <p>这是浏览器的安全限制：Vinyll 无法直接控制访客电脑上的网易云程序，也不能替访客静默安装软件。${requirement}</p>
        <ol>
          <li><b>申请个人凭证：</b>前往 <a href="https://developer.music.163.com/st/developer/apply/account?type=INDIVIDUAL" target="_blank" rel="noreferrer">网易云音乐开放平台 ↗</a>完成入驻，申请自己的 <code class="provider-setup__inline">appId</code> 和 <code class="provider-setup__inline">privateKey</code>。</li>
          <li><b>安装并配置官方 CLI：</b>运行下面的命令；<code class="provider-setup__inline">ncm-cli configure</code> 会要求填写刚才的凭证，<code class="provider-setup__inline">ncm-cli login</code> 会显示二维码供网易云 App 扫码。</li>
          <li><b>启动 Vinyll 桥接：</b>下载本仓库并运行 <code class="provider-setup__inline">bridge/server.js</code>。</li>
          <li><b>保持终端运行：</b>回到此页面，再点一次“网易云音乐”即可连接。</li>
        </ol>
        <code>${install}</code>
        <p>凭证与登录状态只保存在访客自己的电脑，不会上传到 Vinyll、Vercel 或站主服务器。</p>
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
