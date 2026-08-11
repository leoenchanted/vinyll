// Playback polling, progress, transport commands, and track selection.

function updatePlaybackProgress() {
  if (!playbackState?.item?.duration_ms) {
    playerProgress.style.width = "0%";
    return;
  }
  const elapsed = playbackState.is_playing ? Date.now() - playbackState.receivedAt : 0;
  const progress = Math.min(playbackState.item.duration_ms, (playbackState.progress_ms || 0) + elapsed);
  playerProgress.style.width = `${(progress / playbackState.item.duration_ms) * 100}%`;
}

function setPlaybackControlsEnabled(enabled, capabilities = null) {
  playerPrevious.disabled = !enabled || capabilities?.previous === false;
  playerToggle.disabled = !enabled || capabilities?.pause === false;
  playerNext.disabled = !enabled || capabilities?.next === false;
  syncNowPlayingLyricsToggle();
}

function renderPlayback(state) {
  playbackState = state?.item ? { ...state, receivedAt: Date.now() } : null;
  if (!playbackState) {
    miniPlayer.classList.remove("has-cover");
    miniPlayer.style.removeProperty("--player-cover");
    playerTrack.textContent = isProviderConnected() ? "Nothing playing" : "Connect music";
    playerArtist.textContent = isProviderConnected() ? `请先在 ${providerName()} 开始播放` : "选择你的音乐平台";
    playerToggle.setAttribute("aria-pressed", "false");
    playerToggle.setAttribute("aria-label", "播放");
    setPlaybackControlsEnabled(false);
    updatePlaybackProgress();
    if (detailMode === "lyrics") renderLyricsMessage("还没有正在播放的歌曲", `请先在 ${providerName()} 播放一首歌。`);
    return;
  }

  const item = playbackState.item;
  const cover = item.album?.images?.[0]?.url || item.images?.[0]?.url || null;
  const artists = item.artists?.map(({ name }) => name).join(", ") || item.show?.name || providerName();
  playerTrack.textContent = item.name || "Unknown track";
  playerArtist.textContent = artists;
  miniPlayer.classList.toggle("has-cover", Boolean(cover));
  if (cover) miniPlayer.style.setProperty("--player-cover", `url("${cover}")`);
  else miniPlayer.style.removeProperty("--player-cover");
  playerToggle.setAttribute("aria-pressed", String(Boolean(playbackState.is_playing)));
  playerToggle.setAttribute("aria-label", playbackState.is_playing ? "暂停" : "播放");
  setPlaybackControlsEnabled(Boolean(playbackState.device), playbackState.capabilities);
  updatePlaybackProgress();
  if (document.body.classList.contains("now-playing-lyrics")) {
    renderNowPlayingVisual(item);
    renderNowPlayingHeader(item);
  }
  if (detailMode === "lyrics" && lyricsState?.trackKey !== currentPlaybackMetadata()?.key) loadLyricsForPlayback();
}

async function refreshPlayback() {
  const service = activeMusicService();
  if (playbackRequestPending || !isProviderConnected() || !service?.getPlaybackState) return;
  playbackRequestPending = true;
  try {
    renderPlayback(await service.getPlaybackState());
  } catch (error) {
    console.error(error);
    renderPlayback(null);
  } finally {
    playbackRequestPending = false;
  }
}

function startPlaybackPolling() {
  window.clearInterval(playbackPollTimer);
  window.clearInterval(playbackProgressTimer);
  refreshPlayback();
  playbackPollTimer = window.setInterval(refreshPlayback, 5000);
  playbackProgressTimer = window.setInterval(updatePlaybackProgress, 1000);
}

function stopPlaybackPolling() {
  window.clearInterval(playbackPollTimer);
  window.clearInterval(playbackProgressTimer);
  playbackPollTimer = null;
  playbackProgressTimer = null;
  playbackRequestPending = false;
  renderPlayback(null);
}

function playbackErrorMessage(error) {
  const message = error?.message || `${providerName()} 播放控制失败`;
  if (activeProviderId() === "spotify" && /premium|403/i.test(message)) return "播放控制需要 Spotify Premium，请重新确认账号权限。";
  if (/device|404/i.test(message)) return `没有可用的播放设备，请先打开 ${providerName()} 并播放任意歌曲。`;
  return message;
}

async function runPlaybackCommand(command) {
  const service = activeMusicService();
  if (!service?.[command]) return;
  if (playbackRequestPending) return;
  playbackRequestPending = true;
  try {
    await service[command]();
    await new Promise((resolve) => window.setTimeout(resolve, 320));
  } catch (error) {
    showNotice(playbackErrorMessage(error), "error", 6500);
  } finally {
    playbackRequestPending = false;
    refreshPlayback();
  }
}

async function seekToLyric(positionMs) {
  const service = activeMusicService();
  if (playbackState?.capabilities?.seek === false) {
    showNotice("当前网易云客户端没有开放进度跳转控制。", "info", 3200);
    return;
  }
  if (!isProviderConnected() || !service?.seekPlayback) {
    showNotice(`请先连接 ${providerName()}。`, "info", 3200);
    return;
  }
  try {
    await service.seekPlayback(positionMs);
    if (playbackState) {
      playbackState.progress_ms = positionMs;
      playbackState.receivedAt = Date.now();
    }
    resumeLyricsFollowing("smooth");
    updateLyricsSync(true);
    window.setTimeout(refreshPlayback, 350);
  } catch (error) {
    showNotice(playbackErrorMessage(error), "error", 6500);
  }
}

async function playSelectedTrack(trackUri) {
  const album = albums[activeIndex];
  if (!album?.uri || !trackUri) return;
  const service = activeMusicService();
  if (!isProviderConnected() || !service?.playAlbum) {
    showNotice(`请先连接 ${providerName()}。`, "info", 3200);
    return;
  }
  playbackRequestPending = true;
  try {
    await service.playAlbum(album.uri, trackUri);
    await new Promise((resolve) => window.setTimeout(resolve, 420));
  } catch (error) {
    showNotice(playbackErrorMessage(error), "error", 6500);
  } finally {
    playbackRequestPending = false;
    refreshPlayback();
  }
}
