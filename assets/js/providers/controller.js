// Provider login, collection loading, picker UI, and session restoration.

async function loadMusicCollection(showSuccess = false) {
  const service = activeMusicService();
  if (!service) return;
  setProviderButton("loading", null, activeProviderId());
  const { profile, items, total } = await service.getLibrary();
  setProviderButton("connected", profile, activeProviderId());
  startPlaybackPolling();
  if (items.length) {
    setCollection(items.map(mapProviderAlbum));
    if (showSuccess) showNotice(`已载入 ${items.length} 张收藏专辑${total > items.length ? ` · 共 ${total} 张` : ""}`);
  } else {
    const message = `这个 ${providerName()} 账号暂时没有收藏专辑，继续展示演示唱片。`;
    showNotice(message, "info", 6500);
  }
  if (showSuccess && activeProviderId() === "netease") {
    window.setTimeout(openConnectedProviderInfo, 420);
  }
}

async function initializeMusicProvider() {
  const parameters = new URLSearchParams(window.location.search);
  const shouldResumeLogin = parameters.get("spotify_login") === "1";
  const hasCallback = parameters.has("code") || parameters.has("error");
  const providerId = window.musicProviders.activeId;
  if (!providerId) {
    setProviderButton("disconnected");
    stopPlaybackPolling();
    return;
  }
  pendingProviderId = providerId;
  const service = activeMusicService();
  try {
    if (providerId === "spotify" && shouldResumeLogin) {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("spotify_login");
      window.history.replaceState({}, "", cleanUrl);
      setProviderButton("loading", null, providerId);
      await service.login();
      return;
    }
    if (hasCallback) setProviderButton("loading", null, providerId);
    const completedLogin = providerId === "spotify" ? await service.handleCallback() : false;
    if (providerId === "spotify" && !hasCallback && service.needsScopeUpgrade()) {
      await service.logout();
      window.musicProviders.clear();
      pendingProviderId = null;
      setProviderButton("disconnected");
      stopPlaybackPolling();
      showNotice("播放器需要新增 Spotify 播放权限，请点击右上角重新连接一次。", "info", 9000);
      return;
    }
    const accessToken = await service.getAccessToken();
    if (!accessToken) {
      window.musicProviders.clear();
      pendingProviderId = null;
      setProviderButton("disconnected");
      stopPlaybackPolling();
      return;
    }
    await loadMusicCollection(completedLogin);
  } catch (error) {
    console.error(error);
    window.musicProviders.clear();
    pendingProviderId = null;
    setProviderButton("disconnected");
    stopPlaybackPolling();
    showNotice(error.message || `${providerName()} 连接失败，请重试。`, "error", 8000);
  }
}

function openProviderPicker() {
  providerPicker.classList.remove("is-connected-view");
  providerPickerEyebrow.textContent = "Music source";
  providerPickerTitle.textContent = "选择音乐平台";
  providerPicker.hidden = false;
  providerButton.setAttribute("aria-expanded", "true");
  providerSetup.hidden = true;
  providerSetup.innerHTML = "";
  window.setTimeout(() => providerPicker.querySelector("[data-provider-choice]")?.focus(), 0);
}

function openConnectedProviderInfo() {
  const providerId = activeProviderId();
  if (!isProviderConnected() || providerId !== "netease") return;
  providerPicker.classList.add("is-connected-view");
  providerPickerEyebrow.textContent = "Local companion";
  providerPickerTitle.textContent = "本地播放同步";
  providerPicker.hidden = false;
  providerButton.setAttribute("aria-expanded", "true");
  showProviderSetup(providerId);
  window.setTimeout(() => providerPickerClose.focus(), 0);
}

function closeProviderPicker() {
  providerPicker.hidden = true;
  providerPicker.classList.remove("is-connected-view");
  providerButton.setAttribute("aria-expanded", "false");
  providerSetup.hidden = true;
  providerSetup.innerHTML = "";
  providerPickerEyebrow.textContent = "Music source";
  providerPickerTitle.textContent = "选择音乐平台";
}

function showProviderSetup(providerId) {
  const content = window.musicProviders.setupHtml(providerId);
  providerSetup.innerHTML = content;
  providerSetup.hidden = !content;
}

async function connectProvider(providerId) {
  const meta = window.musicProviders.metadata[providerId];
  if (meta?.available === false) {
    showProviderSetup(providerId);
    return;
  }
  const service = window.musicProviders.get(providerId);
  if (!service) return;
  pendingProviderId = providerId;
  providerPicker.querySelectorAll("[data-provider-choice]:not([data-unavailable])").forEach((button) => { button.disabled = true; });
  setProviderButton("loading", null, providerId);
  try {
    window.musicProviders.setActive(providerId);
    await service.login();
    closeProviderPicker();
    await loadMusicCollection(true);
  } catch (error) {
    console.error(error);
    window.musicProviders.clear();
    pendingProviderId = null;
    setProviderButton("disconnected");
    stopPlaybackPolling();
    if (error.code === "NETEASE_LOGIN_CANCELLED") return;
    if (providerId === "apple" || providerId === "netease") {
      providerPicker.hidden = false;
      providerButton.setAttribute("aria-expanded", "true");
      showProviderSetup(providerId);
    }
    showNotice(error.message || `无法连接 ${window.musicProviders.metadata[providerId].name}。`, "error", 7500);
  } finally {
    providerPicker.querySelectorAll("[data-provider-choice]:not([data-unavailable])").forEach((button) => { button.disabled = false; });
  }
}
