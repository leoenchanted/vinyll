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

function setProviderButton(state, profile = null, providerId = activeProviderId()) {
  const connected = state === "connected";
  const meta = providerId ? window.musicProviders.metadata[providerId] : null;
  providerButton.disabled = state === "loading";
  providerButton.classList.toggle("is-connected", connected);
  providerButton.dataset.provider = connected && providerId ? providerId : "none";
  providerButton.setAttribute("aria-label", connected
    ? `${meta?.name || "音乐平台"} 已连接${profile?.display_name ? ` · ${profile.display_name}` : ""}`
    : "选择音乐平台");
  providerLogout.hidden = !connected;
  providerLogout.setAttribute("aria-label", `断开 ${meta?.name || "音乐平台"}`);
  if (state === "loading") providerButtonLabel.textContent = "Connecting…";
  else if (connected) providerButtonLabel.textContent = (profile?.display_name || `${meta?.name || "Music"} connected`).slice(0, 20);
  else providerButtonLabel.textContent = "Choose music";
}
