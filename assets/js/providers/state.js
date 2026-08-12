// Active provider lookup and connection button presentation.

function activeProviderId() {
  return window.musicProviders.activeId || pendingProviderId;
}

function activeProviderMeta() {
  const id = activeProviderId();
  return id ? window.musicProviders.metadata[id] : null;
}

function activeMusicService() {
  const id = activeProviderId();
  return id ? window.musicProviders.get(id) : null;
}

function providerName() {
  return activeProviderMeta()?.name || "音乐平台";
}

function isProviderConnected() {
  return providerButton.classList.contains("is-connected");
}

function setNeteaseHelperLink(connected, providerId) {
  const visible = connected && providerId === "netease";
  neteaseHelperLink.hidden = !visible;
  if (!visible) return;
  const platform = window.musicProviders.platform();
  const directDownload = platform === "windows" || platform === "macos";
  neteaseHelperLink.href = platform === "windows"
    ? "https://github.com/leoenchanted/vinyll/releases/latest/download/Vinyll.NeteaseBridge-win-x64.exe"
    : platform === "macos"
      ? "https://github.com/leoenchanted/vinyll/releases/latest/download/Vinyll.NeteaseCompanion-macOS-universal.zip"
      : "https://github.com/leoenchanted/vinyll/tree/main/bridge#linux";
  neteaseHelperLink.target = directDownload ? "" : "_blank";
  neteaseHelperLink.rel = directDownload ? "" : "noreferrer";
  neteaseHelperLink.querySelector("span").textContent = platform === "windows"
    ? "下载 Windows 助手"
    : platform === "macos" ? "下载 Mac 助手" : "系统支持说明";
  neteaseHelperLink.setAttribute("aria-label", platform === "windows"
    ? "下载 Windows 网易云播放助手"
    : platform === "macos" ? "下载 macOS 网易云播放助手" : "查看网易云播放助手系统支持说明");
}

function setProviderButton(state, profile = null, providerId = activeProviderId()) {
  const connected = state === "connected";
  const meta = providerId ? window.musicProviders.metadata[providerId] : null;
  providerButton.disabled = state === "loading";
  providerButton.classList.toggle("is-connected", connected);
  providerButton.dataset.provider = connected && providerId ? providerId : "none";
  document.body.dataset.musicProvider = connected && providerId ? providerId : "none";
  setNeteaseHelperLink(connected, providerId);
  providerButton.setAttribute("aria-label", connected
    ? `${meta?.name || "音乐平台"} 已连接${profile?.display_name ? ` · ${profile.display_name}` : ""}`
    : "选择音乐平台");
  providerLogout.hidden = !connected;
  providerLogout.setAttribute("aria-label", `断开 ${meta?.name || "音乐平台"}`);
  if (state === "loading") providerButtonLabel.textContent = "Connecting…";
  else if (connected) providerButtonLabel.textContent = (profile?.display_name || `${meta?.name || "Music"} connected`).slice(0, 20);
  else providerButtonLabel.textContent = "Choose music";
}
