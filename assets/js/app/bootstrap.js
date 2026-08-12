// UI event bindings and application startup.

document.querySelector(".nav-button--previous").addEventListener("click", (event) => {
  event.stopPropagation();
  browse(-1);
});
document.querySelector(".nav-button--next").addEventListener("click", (event) => {
  event.stopPropagation();
  browse(1);
});

soundToggle.addEventListener("click", () => {
  const enabled = soundToggle.getAttribute("aria-pressed") !== "true";
  soundToggle.setAttribute("aria-pressed", String(enabled));
  if (enabled) playTick(180);
});

playerPrevious.addEventListener("click", () => runPlaybackCommand("skipPrevious"));
playerNext.addEventListener("click", () => runPlaybackCommand("skipNext"));
playerToggle.addEventListener("click", () => {
  runPlaybackCommand(playerToggle.getAttribute("aria-pressed") === "true" ? "pausePlayback" : "resumePlayback");
});
playerLyricsToggle.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleNowPlayingLyrics();
});
miniPlayer.addEventListener("click", (event) => {
  if (event.target.closest("button")) return;
  toggleNowPlayingLyrics();
});

detailTracklist.addEventListener("click", (event) => {
  const track = event.target.closest("[data-track-uri]");
  if (track) playSelectedTrack(track.dataset.trackUri);
});

lyricsResume.addEventListener("click", () => resumeLyricsFollowing());
lyricsScroll.addEventListener("wheel", pauseLyricsFollowing, { passive: true });
lyricsScroll.addEventListener("pointerdown", pauseLyricsFollowing, { passive: true });
lyricsTranslationToggle.addEventListener("click", () => {
  const enabled = lyricsTranslationToggle.getAttribute("aria-pressed") !== "true";
  lyricsTranslationToggle.setAttribute("aria-pressed", String(enabled));
  lyricsPanel.classList.toggle("show-translation", enabled);
});
lyricsLines.addEventListener("click", (event) => {
  const line = event.target.closest("[data-time-ms]");
  if (line) seekToLyric(Number(line.dataset.timeMs));
});

detailClose.addEventListener("click", () => {
  if (document.body.classList.contains("now-playing-lyrics")) closeNowPlayingLyrics();
  else if (activeIndex !== null) selectAlbum(activeIndex);
});

providerButton.addEventListener("click", () => {
  if (isProviderConnected()) {
    if (activeProviderId() === "netease") {
      if (providerPicker.hidden) openConnectedProviderInfo();
      else closeProviderPicker();
    } else {
      showNotice(`${providerName()} 已连接。`, "info", 2200);
    }
    return;
  }
  if (providerPicker.hidden) openProviderPicker();
  else closeProviderPicker();
});

providerPickerClose.addEventListener("click", closeProviderPicker);
providerPicker.addEventListener("click", (event) => {
  const choice = event.target.closest("[data-provider-choice]");
  if (choice) connectProvider(choice.dataset.providerChoice);
});
document.addEventListener("pointerdown", (event) => {
  if (providerPicker.hidden || event.target.closest("#provider-picker, #provider-auth")) return;
  closeProviderPicker();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !providerPicker.hidden) {
    closeProviderPicker();
    event.stopImmediatePropagation();
  }
});

providerLogout.addEventListener("click", async () => {
  if (document.body.classList.contains("now-playing-lyrics")) closeNowPlayingLyrics();
  const disconnectedName = providerName();
  const service = activeMusicService();
  try { await service?.logout?.(); }
  catch (error) { console.error(error); }
  window.musicProviders.clear();
  pendingProviderId = null;
  setProviderButton("disconnected");
  stopPlaybackPolling();
  setCollection([...demoAlbums]);
  showNotice(`${disconnectedName} 已断开。`, "info", 2600);
});

shelf.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || event.target.closest(".nav-button, .icon-button")) return;
  const compact = isCompactLayout();
  dragStartAxis = compact ? event.clientY : event.clientX;
  dragStartCenter = shelfCenter;
  lastDragAxis = dragStartAxis;
  lastDragTime = performance.now();
  dragVelocity = 0;
  didDrag = false;
  pendingTapIndex = Number(event.target.closest(".album")?.dataset.index);
  if (!Number.isFinite(pendingTapIndex)) pendingTapIndex = null;
  shelf.classList.add("is-dragging");
  shelf.setPointerCapture(event.pointerId);
});

shelf.addEventListener("pointermove", (event) => {
  cursor.style.left = `${event.clientX}px`;
  cursor.style.top = `${event.clientY}px`;
  if (!shelf.hasPointerCapture(event.pointerId) || activeIndex !== null) return;
  const currentAxis = isCompactLayout() ? event.clientY : event.clientX;
  const delta = currentAxis - dragStartAxis;
  const now = performance.now();
  const elapsed = Math.max(1, now - lastDragTime);
  const instantVelocity = -((currentAxis - lastDragAxis) / getSpacing()) / elapsed;
  dragVelocity = dragVelocity * .7 + instantVelocity * .3;
  lastDragAxis = currentAxis;
  lastDragTime = now;
  if (Math.abs(delta) > (isCompactLayout() ? 8 : 4)) didDrag = true;
  shelfCenter = Math.max(-.28, Math.min(albums.length - .72, dragStartCenter - delta / getSpacing()));
  updateLayout();
});

function endDrag(event) {
  if (!shelf.hasPointerCapture(event.pointerId)) return;
  shelf.releasePointerCapture(event.pointerId);
  shelf.classList.remove("is-dragging");
  const tappedIndex = pendingTapIndex;
  pendingTapIndex = null;
  if (!didDrag && tappedIndex !== null) {
    didDrag = true;
    selectAlbum(tappedIndex);
  } else if (activeIndex === null) {
    const projectedCenter = shelfCenter + dragVelocity * (isCompactLayout() ? 72 : 155);
    shelfCenter = Math.round(Math.max(0, Math.min(albums.length - 1, projectedCenter)));
    updateLayout();
  }
  window.setTimeout(() => { didDrag = false; }, 0);
}

shelf.addEventListener("pointerup", endDrag);
shelf.addEventListener("pointercancel", endDrag);
shelf.addEventListener("pointerleave", hideCursor);

shelf.addEventListener("wheel", (event) => {
  event.preventDefault();
  const amount = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (Math.abs(amount) < 1) return;
  if (activeIndex !== null) {
    wheelAccumulator += amount;
    window.clearTimeout(wheelResetTimer);
    wheelResetTimer = window.setTimeout(() => { wheelAccumulator = 0; }, 130);
    if (Math.abs(wheelAccumulator) > 64) {
      browse(Math.sign(wheelAccumulator));
      wheelAccumulator = 0;
    }
  } else {
    shelfCenter = Math.max(0, Math.min(albums.length - 1, shelfCenter + amount * .0048));
    updateLayout();
  }
}, { passive: false });

document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") browse(-1);
  if (event.key === "ArrowRight") browse(1);
  if (isCompactLayout() && event.key === "ArrowUp") browse(-1);
  if (isCompactLayout() && event.key === "ArrowDown") browse(1);
  if (event.key === "Escape" && document.body.classList.contains("now-playing-lyrics")) {
    closeNowPlayingLyrics();
  } else if (event.key === "Escape" && activeIndex !== null) {
    const closingIndex = activeIndex;
    activeIndex = null;
    shelfCenter = closingIndex;
    document.body.classList.remove("has-selection");
    closeAlbumDetail();
    updateLayout();
  }
  if ((event.key === "Enter" || event.key === " ") && document.activeElement === shelf) {
    event.preventDefault();
    selectAlbum(Math.round(shelfCenter));
  }
});

window.addEventListener("resize", () => {
  shelfCenter = Math.max(0, Math.min(albums.length - 1, activeIndex ?? shelfCenter));
  updateLayout(true);
});

renderAlbums();
updateLayout(true);
initializeMusicProvider();
