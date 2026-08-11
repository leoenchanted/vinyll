// Selected album metadata, track list rendering, and detail hydration.

function renderTracklist(album, loading = false) {
  if (loading && !album.tracks?.length) {
    detailTracklist.innerHTML = '<li class="tracklist__loading">Loading tracks…</li>';
    return;
  }

  if (!album.tracks?.length) {
    detailTracklist.innerHTML = '<li class="tracklist__loading">Tracklist unavailable</li>';
    return;
  }

  detailTracklist.innerHTML = album.tracks.map((track, index) => {
    const content = `
      <span class="tracklist__number">${String(track.number || index + 1).padStart(2, "0")}</span>
      <span class="tracklist__name">${escapeXml(track.name)}</span>
      <span class="tracklist__duration">${formatDuration(track.durationMs)}</span>
    `;
    if (album.uri && track.uri) {
      return `<li><button class="tracklist__row" type="button" data-track-uri="${escapeXml(track.uri)}">${content}</button></li>`;
    }
    return `<li><div class="tracklist__row">${content}</div></li>`;
  }).join("");
}

function renderAlbumDetail(album, loading = false) {
  detailArtist.textContent = album.artist;
  detailTitle.textContent = album.title;
  const trackCount = album.totalTracks || album.tracks?.length || 0;
  detailMeta.textContent = [album.year, trackCount ? `${trackCount} tracks` : null, formatAlbumType(album.albumType)]
    .filter(Boolean)
    .join("  ·  ");
  renderTracklist(album, loading);

  const copyrightLine = getCopyrightLine(album);
  detailCopyright.textContent = copyrightLine;
  detailCopyright.hidden = !copyrightLine;
}

async function hydrateAlbumDetail(index, requestId) {
  const album = albums[index];
  const service = activeMusicService();
  if (!album?.id || !service?.getAlbum || !isProviderConnected()) return;
  try {
    const details = await service.getAlbum(album.id);
    if (requestId !== detailRequestId || albums[index] !== album) return;
    album.uri = details.uri || album.uri;
    album.spotifyUrl = details.external_urls?.spotify || album.spotifyUrl;
    album.publisher = details.label || album.publisher;
    album.copyrights = details.copyrights || album.copyrights;
    album.albumType = details.album_type || album.albumType;
    album.totalTracks = details.total_tracks || album.totalTracks;
    album.tracks = details.tracks?.items?.map(mapProviderTrack) || album.tracks;
    if (activeIndex === index) renderAlbumDetail(album);
  } catch (error) {
    console.error(error);
    if (activeIndex === index && !album.tracks?.length) renderTracklist(album);
  }
}

function openAlbumDetail(index) {
  const album = albums[index];
  if (!album) return;
  setDetailMode("tracks");
  const requestId = ++detailRequestId;
  applyAlbumTheme(album);
  renderAlbumDetail(album, Boolean(album.id));
  albumDetail.setAttribute("aria-hidden", "false");
  hydrateAlbumDetail(index, requestId);
}

function closeAlbumDetail() {
  detailRequestId += 1;
  albumDetail.setAttribute("aria-hidden", "true");
  setDetailMode("tracks");
}
