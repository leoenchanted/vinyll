// Album object markup, shelf layout, selection, and collection replacement.

function albumVisualMarkup(album, index = null, active = false) {
  const interactive = Number.isInteger(index);
  const attributes = interactive
    ? `role="button" tabindex="0" data-index="${index}" aria-label="${escapeXml(album.title)} by ${escapeXml(album.artist)}" aria-pressed="false"`
    : 'aria-hidden="true"';
  return `
    <div
      class="album${active ? " is-active is-now-playing-album" : ""}"
      ${attributes}
      style="--spine-color:${album.color};--spine-ink:${album.ink};--label-color:${album.label}"
    >
      <span class="vinyl-wrap" aria-hidden="true">
        <span class="vinyl"></span>
        <span class="vinyl-hole"></span>
      </span>
      <span class="jacket" aria-hidden="true">
        <span class="jacket__front"></span>
        <span class="jacket__back"></span>
        <span class="jacket__spine jacket__spine--left">
          <span class="spine-copy">
            <span class="spine-title">${escapeXml(album.title)}</span>
            <span class="spine-divider"></span>
            <span class="spine-artist">${escapeXml(album.artist)}</span>
          </span>
        </span>
        <span class="jacket__spine jacket__spine--right">
          <span class="spine-copy">
            <span class="spine-title">${escapeXml(album.title)}</span>
            <span class="spine-divider"></span>
            <span class="spine-artist">${escapeXml(album.artist)}</span>
          </span>
        </span>
        <span class="jacket__lip jacket__lip--top"><span>${escapeXml(album.artist)} — ${escapeXml(album.title)}</span></span>
        <span class="jacket__lip jacket__lip--bottom"><span>${escapeXml(album.artist)} — ${escapeXml(album.title)}</span></span>
      </span>
    </div>`;
}

function renderAlbums() {
  stage.innerHTML = albums.map((album, index) => `
    <div class="record-object" data-index="${index}">
      ${albumVisualMarkup(album, index)}
    </div>
  `).join("");

  stage.querySelectorAll(".album").forEach((element) => {
    const album = albums[Number(element.dataset.index)];
    element.style.setProperty("--cover", getCover(album));
    applyExtractedPalette(element, album);
    element.addEventListener("click", () => {
      if (didDrag) return;
      selectAlbum(Number(element.dataset.index));
    });
    element.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      selectAlbum(Number(element.dataset.index));
    });
    element.addEventListener("pointerenter", showCursor);
    element.addEventListener("pointerleave", hideCursor);
    element.addEventListener("pointermove", updateHighlight);
  });
}

function getSpacing() {
  if (isCompactLayout()) return Math.min(82, Math.max(62, window.innerHeight * .08));
  return Math.min(180, Math.max(140, window.innerWidth * .11));
}

function getFlowPose(distance, compact) {
  const absDistance = Math.abs(distance);
  if (compact) {
    const spacing = getSpacing();
    return {
      x: 0,
      y: distance * spacing,
      z: 52 - Math.min(absDistance * 22, 130),
      // 手机端所有封套保持同一倾斜方向，越过中心时不再整张翻面。
      rotateX: 76 + Math.min(absDistance * 2.2, 10),
      rotateY: 0,
      rotateZ: distance * -.08,
      scale: 1 - Math.min(absDistance * .016, .075),
      visible: absDistance < 5.2,
    };
  }
  // 接近参考图的书本陈列角度：书脊完整可读，同时保留一段封面。
  return {
    x: distance * getSpacing(),
    y: Math.min(absDistance * 3, 12),
    z: 72 - Math.min(absDistance * 30, 190),
    rotateX: -1.15,
    rotateY: 78 + Math.min(absDistance * 1.1, 4),
    rotateZ: distance * -.22,
    scale: 1 - Math.min(absDistance * .022, .095),
    visible: absDistance < 5.7,
  };
}

function updatePreviewInfo(index, animate = true) {
  if (!albums.length) return;
  const safeIndex = Math.max(0, Math.min(albums.length - 1, index));
  if (previewIndex === safeIndex && albumTitle.textContent) return;
  previewIndex = safeIndex;
  const album = albums[safeIndex];

  if (!animate) {
    albumArtist.textContent = album.artist;
    albumTitle.textContent = album.title;
    return;
  }

  info.classList.add("is-changing");
  window.setTimeout(() => {
    albumArtist.textContent = album.artist;
    albumTitle.textContent = album.title;
    info.classList.remove("is-changing");
  }, 90);
}

function updateLayout(immediate = false) {
  const elements = [...stage.querySelectorAll(".album")];
  const compact = isCompactLayout();
  const focus = activeIndex ?? shelfCenter;

  elements.forEach((element, index) => {
    const distance = index - focus;
    const isActive = index === activeIndex;
    const pose = getFlowPose(distance, compact);

    if (isActive) {
      pose.x = compact ? -Math.min(34, window.innerWidth * .085) : -Math.min(300, window.innerWidth * .21);
      pose.y = compact ? -Math.min(112, window.innerHeight * .15) : 18;
      pose.z = compact ? 230 : 300;
      pose.rotateX = 0;
      pose.rotateY = 0;
      pose.rotateZ = compact ? -.45 : -.38;
      pose.scale = compact ? .82 : .82;
      pose.visible = true;
    } else if (activeIndex !== null) {
      pose.z -= compact ? 100 : 140;
      pose.visible = Math.abs(distance) <= (compact ? 3 : 4);
      pose.scale *= .93;
    }

    const stack = isActive ? 100 : Math.max(1, Math.round(82 - Math.abs(distance) * 8));
    if (immediate) element.style.transition = "none";

    element.style.setProperty("--stack", stack);
    element.style.setProperty("--shadow-x", `${compact ? 0 : Math.round(-Math.sin(pose.rotateY * Math.PI / 180) * 6)}px`);
    element.style.setProperty("--shadow-y", `${compact ? 21 : 27}px`);
    element.style.setProperty("--shadow-blur", `${Math.round(22 + Math.abs(distance) * 4)}px`);
    element.style.setProperty("--shadow-alpha", `${Math.max(.12, .27 - Math.abs(distance) * .018)}`);
    element.style.transform = `translate3d(calc(-50% + ${pose.x}px), calc(-50% + ${pose.y}px), ${pose.z}px) rotateX(${pose.rotateX}deg) rotateY(${pose.rotateY}deg) rotateZ(${pose.rotateZ}deg) scale(${pose.scale})`;
    element.style.opacity = "1";
    element.style.visibility = pose.visible ? "visible" : "hidden";
    element.classList.toggle("is-active", isActive);
    element.classList.toggle("is-muted", activeIndex !== null && !isActive);
    element.setAttribute("aria-pressed", String(isActive));
    element.style.pointerEvents = pose.visible ? "auto" : "none";
    element.tabIndex = pose.visible ? 0 : -1;

    if (immediate) requestAnimationFrame(() => { element.style.transition = ""; });
  });

  const nearest = activeIndex ?? Math.max(0, Math.min(albums.length - 1, Math.round(shelfCenter)));
  updatePreviewInfo(nearest, !immediate);
}

function selectAlbum(index, options = {}) {
  if (document.body.classList.contains("now-playing-lyrics") && activeIndex === index && !options.forceOpen) {
    closeNowPlayingLyrics();
    return;
  }
  const closing = activeIndex === index && !options.forceOpen;
  activeIndex = closing ? null : index;
  shelfCenter = index;
  document.body.classList.toggle("has-selection", activeIndex !== null);
  updateLayout();
  updatePreviewInfo(index);
  if (closing) closeAlbumDetail();
  else openAlbumDetail(index);
  playTick(closing ? 112 : 174);
}

function browse(direction) {
  if (!albums.length) return;
  if (document.body.classList.contains("now-playing-lyrics")) return;
  if (activeIndex !== null) {
    activeIndex = (activeIndex + direction + albums.length) % albums.length;
    shelfCenter = activeIndex;
    updateLayout();
    updatePreviewInfo(activeIndex);
    openAlbumDetail(activeIndex);
  } else {
    shelfCenter = Math.max(0, Math.min(albums.length - 1, Math.round(shelfCenter + direction)));
    updateLayout();
  }
  playTick(direction > 0 ? 143 : 126);
}

function showCursor() {
  if (window.matchMedia("(pointer: coarse)").matches) return;
  cursor.classList.add("is-visible");
}
function hideCursor() {
  cursor.classList.remove("is-visible");
}

function updateHighlight(event) {
  const card = event.currentTarget;
  const rect = card.getBoundingClientRect();
  card.style.setProperty("--mx", `${((event.clientX - rect.left) / rect.width) * 100}%`);
  card.style.setProperty("--my", `${((event.clientY - rect.top) / rect.height) * 100}%`);
}

function playTick(frequency) {
  if (soundToggle.getAttribute("aria-pressed") !== "true") return;
  audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * .74, audioContext.currentTime + .055);
  gain.gain.setValueAtTime(.024, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + .065);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + .07);
}

function setCollection(nextAlbums) {
  window.clearTimeout(nowPlayingCleanupTimer);
  nowPlayingLyricsOrigin = null;
  nowPlayingVisualKey = "";
  nowPlayingVisualAlbum = null;
  nowPlayingRecord.innerHTML = "";
  nowPlayingRecord.setAttribute("aria-hidden", "true");
  albums = nextAlbums;
  activeIndex = null;
  shelfCenter = Math.min(albums.length - 1, isCompactLayout() ? 3 : 2);
  previewIndex = -1;
  document.body.classList.remove("has-selection", "now-playing-lyrics", "closing-now-playing-lyrics");
  closeAlbumDetail();
  renderAlbums();
  updateLayout(true);
}
