// Lyrics loading, rendering, scrolling, and playback synchronization.

function currentPlaybackMetadata() {
  const item = playbackState?.item;
  if (!item) return null;
  return {
    key: item.id || item.uri || `${item.name}-${item.duration_ms}`,
    track: item.name || "",
    artist: item.artists?.map(({ name }) => name).join(", ") || item.show?.name || "",
    album: item.album?.name || item.show?.name || "",
    durationMs: item.duration_ms || 0,
  };
}

function currentPlaybackPosition() {
  if (!playbackState?.item) return 0;
  const elapsed = playbackState.is_playing ? Date.now() - playbackState.receivedAt : 0;
  return Math.max(0, Math.min(playbackState.item.duration_ms || Infinity, (playbackState.progress_ms || 0) + elapsed));
}

function renderLyricsMessage(message, detail = "") {
  lyricsState = null;
  lyricsLines.innerHTML = `
    <div class="lyrics-message">
      <strong>${escapeXml(message)}</strong>
      ${detail ? `<span>${escapeXml(detail)}</span>` : ""}
    </div>
  `;
  lyricsSource.textContent = "Lyrics";
  lyricsTranslationToggle.hidden = true;
  lyricsResume.hidden = true;
}

function scrollToCurrentLyric(behavior = "smooth") {
  if (!lyricsState || lyricsState.activeIndex < 0) return;
  const line = lyricsLines.querySelector(`[data-lyric-index="${lyricsState.activeIndex}"]`);
  if (!line) return;
  const target = line.offsetTop - (lyricsScroll.clientHeight - line.offsetHeight) / 2;
  lyricsScroll.scrollTo({ top: Math.max(0, target), behavior });
}

function resumeLyricsFollowing(behavior = "smooth") {
  if (!lyricsState) return;
  window.clearTimeout(lyricsFollowTimer);
  lyricsState.following = true;
  lyricsResume.hidden = true;
  scrollToCurrentLyric(behavior);
}

function pauseLyricsFollowing() {
  if (!lyricsState) return;
  window.clearTimeout(lyricsFollowTimer);
  lyricsState.following = false;
  lyricsResume.hidden = false;
  lyricsFollowTimer = window.setTimeout(() => resumeLyricsFollowing(), 6500);
}

function updateLyricsSync(force = false) {
  if (detailMode !== "lyrics" || !lyricsState?.lines.length) return;
  const position = currentPlaybackPosition();
  let low = 0;
  let high = lyricsState.lines.length - 1;
  let nextIndex = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (lyricsState.lines[middle].timeMs <= position + 90) {
      nextIndex = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (!force && nextIndex === lyricsState.activeIndex) return;
  lyricsState.activeIndex = nextIndex;
  [...lyricsLines.querySelectorAll(".lyrics-line")].forEach((element, index) => {
    element.classList.toggle("is-active", index === nextIndex);
    element.classList.toggle("is-past", index < nextIndex);
  });
  if (lyricsState.following) scrollToCurrentLyric(force ? "auto" : "smooth");
}

function startLyricsSync() {
  window.clearInterval(lyricsSyncTimer);
  updateLyricsSync(true);
  lyricsSyncTimer = window.setInterval(updateLyricsSync, 250);
}

function stopLyricsSync() {
  window.clearInterval(lyricsSyncTimer);
  window.clearTimeout(lyricsFollowTimer);
  lyricsSyncTimer = null;
  lyricsFollowTimer = null;
}

function renderLyrics(result, metadata) {
  const hasTranslation = result.lines.some(({ translation }) => Boolean(translation));
  const canSeek = playbackState?.capabilities?.seek !== false && Boolean(activeMusicService()?.seekPlayback);
  lyricsPanel.classList.toggle("show-translation", hasTranslation);
  lyricsTranslationToggle.hidden = !hasTranslation;
  lyricsTranslationToggle.setAttribute("aria-pressed", String(hasTranslation));
  lyricsLines.innerHTML = result.lines.map((line, index) => {
    const tag = canSeek ? "button" : "div";
    const attributes = canSeek ? `type="button" data-time-ms="${line.timeMs}"` : "aria-disabled=\"true\"";
    return `
    <${tag} class="lyrics-line" ${attributes} data-lyric-index="${index}">
      <span class="lyrics-line__original">${escapeXml(line.text)}</span>
      ${line.translation ? `<span class="lyrics-line__translation">${escapeXml(line.translation)}</span>` : ""}
    </${tag}>
  `;
  }).join("");
  const sources = [result.synced ? "同步歌词" : "非同步歌词", result.source]
    .concat(result.translationSource ? [`翻译 · ${result.translationSource}`] : [])
    .filter(Boolean);
  lyricsSource.textContent = sources.join("  ·  ");
  lyricsState = {
    ...result,
    trackKey: metadata.key,
    activeIndex: -1,
    following: true,
  };
  lyricsScroll.scrollTop = 0;
  startLyricsSync();
}

async function loadLyricsForPlayback(force = false) {
  const metadata = currentPlaybackMetadata();
  if (!metadata) {
    lyricsRequestedTrackKey = "";
    renderLyricsMessage("还没有正在播放的歌曲", `请先在 ${providerName()} 播放一首歌。`);
    return;
  }
  if (!force && (lyricsState?.trackKey === metadata.key || lyricsRequestedTrackKey === metadata.key)) {
    startLyricsSync();
    return;
  }
  lyricsRequestedTrackKey = metadata.key;
  const requestId = ++lyricsRequestId;
  renderLyricsMessage("正在寻找歌词", `${metadata.track} · ${metadata.artist}`);
  try {
    const result = await window.lyricsService.getLyrics(metadata);
    if (requestId !== lyricsRequestId) return;
    if (detailMode !== "lyrics") {
      lyricsRequestedTrackKey = "";
      return;
    }
    if (result.instrumental) {
      renderLyricsMessage("纯音乐", "这首歌没有演唱歌词。");
      return;
    }
    if (!result.lines.length) {
      renderLyricsMessage("暂未找到歌词", "可以切回曲目列表继续播放。");
      return;
    }
    renderLyrics(result, metadata);
  } catch (error) {
    if (requestId !== lyricsRequestId) return;
    lyricsRequestedTrackKey = "";
    if (detailMode !== "lyrics") return;
    renderLyricsMessage(error.message || "歌词加载失败", "稍后切换回来会自动重试。");
  }
}

function setDetailMode(mode) {
  detailMode = mode === "lyrics" ? "lyrics" : "tracks";
  const showLyrics = detailMode === "lyrics";
  albumDetail.classList.toggle("show-lyrics", showLyrics);
  detailTracklist.setAttribute("aria-hidden", String(showLyrics));
  lyricsPanel.setAttribute("aria-hidden", String(!showLyrics));
  if (showLyrics) loadLyricsForPlayback();
  else {
    lyricsRequestId += 1;
    lyricsRequestedTrackKey = "";
    stopLyricsSync();
  }
}
