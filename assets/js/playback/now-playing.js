// Full-size now-playing artwork and lyrics-mode transitions.

function playbackAlbumToShelfAlbum(item) {
  const source = item?.album || {};
  const artist = source.artists?.map(({ name }) => name).join(", ")
    || item?.artists?.map(({ name }) => name).join(", ")
    || "Unknown artist";
  const [color, ink, label] = paletteFor(source.id || `${source.name}-${artist}`);
  return {
    id: source.id || `now-playing-${Date.now()}`,
    title: source.name || item?.name || "Now playing",
    artist,
    year: source.release_date?.slice(0, 4) || "—",
    cover: source.images?.[0]?.url || null,
    spotifyUrl: source.external_urls?.spotify || null,
    publisher: source.label || null,
    copyrights: source.copyrights || [],
    uri: source.uri || null,
    albumType: source.album_type || "album",
    totalTracks: source.total_tracks || 0,
    tracks: [],
    color,
    ink,
    label,
    art: albums.length % 8,
  };
}

function syncNowPlayingLyricsToggle() {
  const active = document.body.classList.contains("now-playing-lyrics");
  const canOpen = Boolean(playbackState?.item);
  miniPlayer.classList.toggle("can-open-lyrics", canOpen || active);
  miniPlayer.classList.toggle("lyrics-active", active);
  playerLyricsToggle.disabled = !canOpen && !active;
  playerLyricsToggle.setAttribute("aria-pressed", String(active));
  playerLyricsToggle.setAttribute("aria-label", active ? "关闭歌词并返回唱片架" : "打开当前歌曲歌词");
}

function renderNowPlayingHeader(item) {
  if (!item) return;
  detailArtist.textContent = item.artists?.map(({ name }) => name).join(", ")
    || item.show?.name
    || "Unknown artist";
  detailTrack.textContent = item.name || "Unknown track";
  detailTitle.textContent = item.album?.name || item.show?.name || providerName();
  detailMeta.textContent = "";
  const copyrightLine = nowPlayingVisualAlbum ? getCopyrightLine(nowPlayingVisualAlbum) : "";
  detailCopyright.textContent = copyrightLine;
  detailCopyright.hidden = !copyrightLine;
}

function renderNowPlayingVisual(item, force = false) {
  const source = item?.album || {};
  const key = source.id || source.uri || source.images?.[0]?.url || `${source.name || "album"}-${item?.artists?.[0]?.name || "artist"}`;
  if (!force && key === nowPlayingVisualKey && nowPlayingRecord.firstElementChild) return;

  const album = playbackAlbumToShelfAlbum(item);
  nowPlayingVisualKey = key;
  nowPlayingVisualAlbum = album;
  applyAlbumTheme(album);
  nowPlayingRecord.innerHTML = albumVisualMarkup(album, null, true);
  nowPlayingRecord.setAttribute("aria-hidden", "false");
  const element = nowPlayingRecord.querySelector(".album");
  element.style.setProperty("--cover", getCover(album));
  applyExtractedPalette(element, album, true);
}

function openNowPlayingLyrics() {
  const item = playbackState?.item;
  if (!item) {
    showNotice(`请先在 ${providerName()} 播放一首歌。`, "info", 3600);
    return;
  }
  if (!item.album) {
    showNotice("当前内容没有可用的专辑封面。", "info", 3600);
    return;
  }
  window.clearTimeout(nowPlayingCleanupTimer);
  document.body.classList.remove("closing-now-playing-lyrics");
  if (!nowPlayingLyricsOrigin) nowPlayingLyricsOrigin = { activeIndex, shelfCenter };
  detailRequestId += 1;
  renderNowPlayingVisual(item, true);
  renderNowPlayingHeader(item);
  albumDetail.setAttribute("aria-hidden", "false");
  setDetailMode("lyrics");
  void nowPlayingRecord.offsetWidth;
  document.body.classList.add("has-selection", "now-playing-lyrics");
  syncNowPlayingLyricsToggle();
}

function closeNowPlayingLyrics() {
  if (!document.body.classList.contains("now-playing-lyrics")) return;
  const origin = nowPlayingLyricsOrigin;
  window.clearTimeout(nowPlayingCleanupTimer);
  document.body.classList.add("closing-now-playing-lyrics");
  document.body.classList.remove("now-playing-lyrics");
  setDetailMode("tracks");
  syncNowPlayingLyricsToggle();

  nowPlayingCleanupTimer = window.setTimeout(() => {
    nowPlayingRecord.innerHTML = "";
    nowPlayingRecord.setAttribute("aria-hidden", "true");
    nowPlayingVisualKey = "";
    nowPlayingVisualAlbum = null;
    activeIndex = origin?.activeIndex ?? null;
    shelfCenter = Math.max(0, Math.min(albums.length - 1, origin?.shelfCenter ?? shelfCenter));
    if (activeIndex !== null && albums[activeIndex]) {
      document.body.classList.add("has-selection");
      openAlbumDetail(activeIndex);
    } else {
      document.body.classList.remove("has-selection");
      closeAlbumDetail();
    }
    void nowPlayingRecord.offsetWidth;
    document.body.classList.remove("closing-now-playing-lyrics");
    nowPlayingLyricsOrigin = null;
  }, 240);
}

function toggleNowPlayingLyrics() {
  if (document.body.classList.contains("now-playing-lyrics")) closeNowPlayingLyrics();
  else openNowPlayingLyrics();
}
