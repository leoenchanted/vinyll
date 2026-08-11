const demoAlbums = [
  { title: "Blue Hour", artist: "North Arcade", year: "2025", color: "#153d5c", ink: "#f4d27f", label: "#da5a39", art: 0 },
  { title: "Velvet Static", artist: "Mara Vale", year: "2024", color: "#772b3a", ink: "#f9e8d0", label: "#dcbd85", art: 1 },
  { title: "Night Drive", artist: "Coast Memory", year: "2022", color: "#321b4f", ink: "#f0d9ff", label: "#a23c78", art: 2 },
  { title: "Soft Geometry", artist: "Studio Haze", year: "2026", color: "#d7a94f", ink: "#241d16", label: "#e6c15e", art: 3 },
  { title: "Afterimage", artist: "Noon Pacific", year: "2021", color: "#294d45", ink: "#ece9df", label: "#e04b36", art: 4 },
  { title: "Sunday Service", artist: "The Common", year: "2019", color: "#a84e2b", ink: "#fff1d2", label: "#314f49", art: 5 },
  { title: "Glass Garden", artist: "Hana / Leo", year: "2023", color: "#77919a", ink: "#122226", label: "#bfddd9", art: 6 },
  { title: "Last Light", artist: "The Hours", year: "2020", color: "#25231f", ink: "#f5efdd", label: "#e0d9c4", art: 7 },
];

const demoTrackNames = [
  ["First Light", "Blue Hour", "Static on the Coast", "Satellite Weather", "Northbound", "Slow Horizon"],
  ["Velvet Static", "Folded Letters", "Mara at Midnight", "Soft Collision", "No Reply", "After the Signal"],
  ["Ignition", "Night Drive", "Coast Memory", "Purple Exit", "2:17 AM", "Home Before Dawn"],
  ["Soft Geometry", "Parallel Lines", "Yellow Room", "Measured Air", "Arc Study", "Open Form"],
  ["Afterimage", "Green Glass", "Noon Pacific", "Remain", "Double Exposure", "Fade Slowly"],
  ["Sunday Service", "Common Ground", "Warm Receiver", "Orange Choir", "Carry Me", "Last Amen"],
  ["Glass Garden", "Hana / Leo", "Clear Weather", "Cut Flowers", "Silver Soil", "Still Growing"],
  ["Last Light", "The Hours", "Long Shadow", "Twenty Past", "Closing Time", "Night Returns"],
];

demoAlbums.forEach((album, albumIndex) => {
  album.tracks = demoTrackNames[albumIndex].map((name, trackIndex) => ({
    name,
    durationMs: 168000 + ((albumIndex * 31 + trackIndex * 23) % 94) * 1000,
    number: trackIndex + 1,
  }));
  album.totalTracks = album.tracks.length;
  album.albumType = "LP";
});

let albums = [...demoAlbums];
const stage = document.querySelector("#album-stage");
const shelf = document.querySelector(".shelf");
const info = document.querySelector(".album-info");
const cursor = document.querySelector(".cursor");
const albumArtist = document.querySelector("#album-artist");
const albumTitle = document.querySelector("#album-title");
const soundToggle = document.querySelector(".sound-toggle");
const providerButton = document.querySelector("#provider-auth");
const providerButtonLabel = document.querySelector(".provider-auth__label");
const providerLogout = document.querySelector("#provider-logout");
const providerPicker = document.querySelector("#provider-picker");
const providerPickerClose = document.querySelector("#provider-picker-close");
const providerSetup = document.querySelector("#provider-setup");
const notice = document.querySelector("#notice");
const miniPlayer = document.querySelector("#mini-player");
const playerTrack = document.querySelector("#player-track");
const playerArtist = document.querySelector("#player-artist");
const playerPrevious = document.querySelector("#player-previous");
const playerToggle = document.querySelector("#player-toggle");
const playerNext = document.querySelector("#player-next");
const playerLyricsToggle = document.querySelector("#player-lyrics-toggle");
const playerProgress = document.querySelector("#player-progress");
const nowPlayingRecord = document.querySelector("#now-playing-record");
const albumDetail = document.querySelector("#album-detail");
const detailArtist = document.querySelector("#detail-artist");
const detailTrack = document.querySelector("#detail-track");
const detailTitle = document.querySelector("#detail-title");
const detailMeta = document.querySelector("#detail-meta");
const detailTracklist = document.querySelector("#album-tracklist");
const detailCopyright = document.querySelector("#detail-copyright");
const detailClose = document.querySelector("#album-detail-close");
const lyricsPanel = document.querySelector("#lyrics-panel");
const lyricsScroll = document.querySelector("#lyrics-scroll");
const lyricsLines = document.querySelector("#lyrics-lines");
const lyricsResume = document.querySelector("#lyrics-resume");
const lyricsSource = document.querySelector("#lyrics-source");
const lyricsTranslationToggle = document.querySelector("#lyrics-translation-toggle");

function isCompactLayout() {
  return window.innerWidth < 760;
}

let activeIndex = null;
let shelfCenter = Math.min(albums.length - 1, isCompactLayout() ? 3 : 2);
let previewIndex = Math.round(shelfCenter);
let dragStartAxis = 0;
let dragStartCenter = 0;
let lastDragAxis = 0;
let lastDragTime = 0;
let dragVelocity = 0;
let didDrag = false;
let pendingTapIndex = null;
let audioContext = null;
let noticeTimer = null;
let wheelAccumulator = 0;
let wheelResetTimer = null;
let detailRequestId = 0;
let playbackState = null;
let playbackPollTimer = null;
let playbackProgressTimer = null;
let playbackRequestPending = false;
let detailMode = "tracks";
let lyricsState = null;
let lyricsRequestId = 0;
let lyricsSyncTimer = null;
let lyricsFollowTimer = null;
let lyricsRequestedTrackKey = "";
let nowPlayingLyricsOrigin = null;
let nowPlayingCleanupTimer = null;
let nowPlayingVisualKey = "";
let nowPlayingVisualAlbum = null;
let pendingProviderId = null;

const spotifyPalettes = [
  ["#193c54", "#f0d998", "#d65f42"],
  ["#7b3045", "#f9e7d2", "#ddb681"],
  ["#332054", "#f1dcff", "#aa4c89"],
  ["#d5a746", "#201d18", "#e5bf55"],
  ["#285147", "#f1eee5", "#df5b41"],
  ["#a94d2f", "#fff0cf", "#345249"],
  ["#78949b", "#13262a", "#bddbd6"],
  ["#282622", "#f4eedc", "#ded7c4"],
];

function escapeXml(value = "") {
  return String(value).replace(/[<>&'\"]/g, (character) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '\"': "&quot;",
  })[character]);
}

function showNotice(message, type = "info", duration = 4200) {
  window.clearTimeout(noticeTimer);
  notice.textContent = message;
  notice.classList.toggle("is-error", type === "error");
  notice.classList.add("is-visible");
  if (duration > 0) {
    noticeTimer = window.setTimeout(() => notice.classList.remove("is-visible"), duration);
  }
}

function paletteFor(value) {
  const hash = [...String(value)].reduce((total, character) => ((total << 5) - total + character.charCodeAt(0)) | 0, 0);
  return spotifyPalettes[Math.abs(hash) % spotifyPalettes.length];
}

function rgbToHex(red, green, blue) {
  return `#${[red, green, blue].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

function readableInk(red, green, blue) {
  const channels = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  return luminance > .22 ? "#171714" : "#f7f3e9";
}

function hexToRgbString(hex) {
  const value = String(hex || "").replace("#", "");
  const normalized = value.length === 3 ? [...value].map((character) => character + character).join("") : value;
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return "50, 27, 79";
  return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16)).join(", ");
}

function formatDuration(milliseconds = 0) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatAlbumType(value = "Album") {
  const text = String(value || "Album").replace(/_/g, " ");
  if (text.toUpperCase() === "LP") return "LP";
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function getCopyrightLine(album) {
  const rights = (album.copyrights || [])
    .filter(({ type, text }) => String(type || "").toUpperCase() === "C" || String(text || "").trim().startsWith("©"))
    .map(({ text }) => `© ${String(text || "").trim().replace(/^(?:©|\(C\))\s*/i, "")}`.trim())
    .filter(Boolean);
  if (rights.length) return rights.join("  ·  ");
  const holder = album.publisher || album.artist;
  return holder ? `© ${album.year || ""} ${holder}`.replace(/\s+/g, " ").trim() : "";
}

function mapSpotifyTrack(track, index) {
  return {
    id: track.id,
    uri: track.uri,
    name: track.name || `Track ${index + 1}`,
    artist: track.artists?.map(({ name }) => name).join(", ") || "",
    durationMs: track.duration_ms || 0,
    number: track.track_number || index + 1,
  };
}

function applyAlbumTheme(album) {
  const root = document.documentElement;
  root.style.setProperty("--theme-color", album.color);
  root.style.setProperty("--theme-rgb", hexToRgbString(album.color));
  root.style.setProperty("--theme-ink", album.ink);
}

function extractCoverPalette(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 48;
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0, size, size);
        const pixels = context.getImageData(0, 0, size, size).data;
        const buckets = new Map();

        for (let index = 0; index < pixels.length; index += 16) {
          const red = pixels[index];
          const green = pixels[index + 1];
          const blue = pixels[index + 2];
          const alpha = pixels[index + 3];
          const maximum = Math.max(red, green, blue);
          const minimum = Math.min(red, green, blue);
          const lightness = (maximum + minimum) / 510;
          const saturation = maximum === minimum
            ? 0
            : (maximum - minimum) / (255 - Math.abs(maximum + minimum - 255));

          if (alpha < 220 || lightness < .055 || lightness > .94) continue;

          const key = `${red >> 5}-${green >> 5}-${blue >> 5}`;
          const bucket = buckets.get(key) || { red: 0, green: 0, blue: 0, count: 0, weight: 0 };
          const weight = .55 + saturation * .8;
          bucket.red += red;
          bucket.green += green;
          bucket.blue += blue;
          bucket.count += 1;
          bucket.weight += weight;
          buckets.set(key, bucket);
        }

        const dominant = [...buckets.values()].sort((a, b) => b.weight - a.weight)[0];
        if (!dominant) throw new Error("No usable cover colors");

        let red = dominant.red / dominant.count;
        let green = dominant.green / dominant.count;
        let blue = dominant.blue / dominant.count;
        const average = (red + green + blue) / 3;
        red = average + (red - average) * 1.08;
        green = average + (green - average) * 1.08;
        blue = average + (blue - average) * 1.08;

        const highest = Math.max(red, green, blue);
        const lowest = Math.min(red, green, blue);
        if (highest < 58) {
          const lift = 58 / Math.max(highest, 1);
          red *= lift;
          green *= lift;
          blue *= lift;
        } else if (lowest > 214) {
          const shade = 214 / lowest;
          red *= shade;
          green *= shade;
          blue *= shade;
        }

        red = Math.max(0, Math.min(255, red));
        green = Math.max(0, Math.min(255, green));
        blue = Math.max(0, Math.min(255, blue));
        resolve({ color: rgbToHex(red, green, blue), ink: readableInk(red, green, blue) });
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = reject;
    image.src = source;
  });
}

async function applyExtractedPalette(element, album, useAsCurrentTheme = false) {
  if (!album.cover) return;
  try {
    const palette = await extractCoverPalette(album.cover);
    if (!element.isConnected) return;
    album.color = palette.color;
    album.ink = palette.ink;
    element.style.setProperty("--spine-color", palette.color);
    element.style.setProperty("--spine-ink", palette.ink);
    if (useAsCurrentTheme || (activeIndex !== null && albums[activeIndex] === album)) applyAlbumTheme(album);
  } catch (error) {
    // 跨域封面无法读取像素时保留稳定的预设色，不影响唱片架使用。
    console.debug("Cover palette fallback", error);
  }
}

function mapSpotifyAlbum({ album }, index) {
  const [color, ink, label] = paletteFor(album.id || `${album.name}-${index}`);
  return {
    id: album.id,
    title: album.name || "Untitled album",
    artist: album.artists?.map(({ name }) => name).join(", ") || "Unknown artist",
    year: album.release_date?.slice(0, 4) || "—",
    cover: album.images?.[0]?.url || null,
    spotifyUrl: album.external_urls?.spotify || null,
    publisher: album.label || null,
    copyrights: album.copyrights || [],
    uri: album.uri || null,
    albumType: album.album_type || "album",
    totalTracks: album.total_tracks || album.tracks?.total || 0,
    tracks: album.tracks?.items?.map(mapSpotifyTrack) || [],
    color,
    ink,
    label,
    art: index % 8,
  };
}

function svgArtwork(album) {
  const title = escapeXml(album.title.toUpperCase());
  const artist = escapeXml(album.artist.toUpperCase());
  const common = `xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"`;
  const noise = `<filter id="noise"><feTurbulence baseFrequency=".7" numOctaves="3" seed="${album.art + 3}"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 .11"/></feComponentTransfer></filter>`;
  let scene = "";

  switch (album.art) {
    case 0:
      scene = `<rect width="800" height="800" fill="#102d4b"/><circle cx="570" cy="305" r="225" fill="#d75d3f" opacity=".88"/><circle cx="570" cy="305" r="170" fill="#0b233e"/><path d="M0 590 Q190 440 395 590 T800 590 V800 H0Z" fill="#d1bc83"/><path d="M0 645 Q210 495 410 645 T800 645" fill="none" stroke="#173a5b" stroke-width="9"/>`;
      break;
    case 1:
      scene = `<rect width="800" height="800" fill="#66283a"/><path d="M-30 690 C150 190 420 140 840 40 L840 820 H-30Z" fill="#e3b27c"/><path d="M-20 690 C220 420 490 260 820 170" fill="none" stroke="#fff0d7" stroke-width="9"/><circle cx="243" cy="278" r="92" fill="none" stroke="#f5dfbf" stroke-width="2"/><circle cx="243" cy="278" r="66" fill="#702e42"/>`;
      break;
    case 2:
      scene = `<rect width="800" height="800" fill="#24133e"/><g fill="none" stroke="#a8428c" stroke-width="3">${Array.from({length: 9}, (_, i) => `<path d="M${-80 + i * 105} 820 Q${160 + i * 48} 280 ${850 - i * 22} -20"/>`).join("")}</g><circle cx="405" cy="410" r="155" fill="#120b28" stroke="#e25dad" stroke-width="5"/><circle cx="405" cy="410" r="8" fill="#f4cf84"/>`;
      break;
    case 3:
      scene = `<rect width="800" height="800" fill="#e1bc63"/><rect x="120" y="125" width="560" height="560" fill="#1c2224"/><circle cx="400" cy="405" r="212" fill="#d85a35"/><rect x="362" y="110" width="76" height="590" fill="#f1e4bd"/><circle cx="400" cy="405" r="77" fill="#1c2224"/>`;
      break;
    case 4:
      scene = `<rect width="800" height="800" fill="#23473f"/><g opacity=".85">${Array.from({length: 18}, (_, i) => `<rect x="${i * 48 - 30}" y="${110 + (i % 4) * 35}" width="25" height="570" rx="13" fill="${i % 3 === 0 ? '#df593d' : '#8ca99e'}" transform="rotate(${i % 2 ? -8 : 6} 400 400)"/>`).join("")}</g><rect y="625" width="800" height="175" fill="#19342f"/>`;
      break;
    case 5:
      scene = `<rect width="800" height="800" fill="#a54d2f"/><circle cx="400" cy="360" r="240" fill="#f2d18e"/><path d="M400 120 V600 M160 360 H640 M230 190 L570 530 M570 190 L230 530" stroke="#a54d2f" stroke-width="28"/><circle cx="400" cy="360" r="78" fill="#304c45"/><rect y="650" width="800" height="150" fill="#2b463f"/>`;
      break;
    case 6:
      scene = `<rect width="800" height="800" fill="#9ab2b5"/><path d="M105 650 L270 135 L420 650Z" fill="#193539" opacity=".86"/><path d="M315 650 L510 210 L730 650Z" fill="#d4e4dc"/><circle cx="535" cy="215" r="96" fill="#c56155" opacity=".86"/><g stroke="#f6efe0" stroke-width="4" opacity=".75"><path d="M0 110 H800"/><path d="M0 685 H800"/></g>`;
      break;
    default:
      scene = `<rect width="800" height="800" fill="#20201e"/><circle cx="400" cy="380" r="250" fill="none" stroke="#ded7c2" stroke-width="2"/><circle cx="400" cy="380" r="190" fill="none" stroke="#ded7c2" stroke-width="2"/><circle cx="400" cy="380" r="125" fill="#ded7c2"/><path d="M0 590 L800 290 V800 H0Z" fill="#3f3d37" opacity=".86"/>`;
  }

  const svg = `<svg ${common}>${noise}${scene}<rect width="800" height="800" filter="url(#noise)"/><text x="54" y="70" fill="${album.ink}" font-family="Avenir Next,sans-serif" font-size="17" letter-spacing="7">${artist}</text><text x="54" y="752" fill="${album.ink}" font-family="Bodoni 72,Didot,serif" font-size="42" letter-spacing="1">${title}</text></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function getCover(album) {
  return album.cover ? `url("${album.cover}")` : svgArtwork(album);
}

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
    album.tracks = details.tracks?.items?.map(mapSpotifyTrack) || album.tracks;
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
  lyricsPanel.classList.toggle("show-translation", hasTranslation);
  lyricsTranslationToggle.hidden = !hasTranslation;
  lyricsTranslationToggle.setAttribute("aria-pressed", String(hasTranslation));
  lyricsLines.innerHTML = result.lines.map((line, index) => `
    <button class="lyrics-line" type="button" data-lyric-index="${index}" data-time-ms="${line.timeMs}">
      <span class="lyrics-line__original">${escapeXml(line.text)}</span>
      ${line.translation ? `<span class="lyrics-line__translation">${escapeXml(line.translation)}</span>` : ""}
    </button>
  `).join("");
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

async function loadMusicCollection(showSuccess = false) {
  const service = activeMusicService();
  if (!service) return;
  setProviderButton("loading", null, activeProviderId());
  const { profile, items, total } = await service.getLibrary();
  setProviderButton("connected", profile, activeProviderId());
  startPlaybackPolling();
  if (items.length) {
    setCollection(items.map(mapSpotifyAlbum));
    if (showSuccess) showNotice(`已载入 ${items.length} 张收藏专辑${total > items.length ? ` · 共 ${total} 张` : ""}`);
  } else {
    const message = activeProviderId() === "netease"
      ? "网易云播放控制已连接；官方 CLI 暂未向网页返回收藏专辑，继续展示演示唱片。"
      : `这个 ${providerName()} 账号暂时没有收藏专辑，继续展示演示唱片。`;
    showNotice(message, "info", 6500);
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
  providerPicker.hidden = false;
  providerButton.setAttribute("aria-expanded", "true");
  providerSetup.hidden = true;
  providerSetup.innerHTML = "";
  window.setTimeout(() => providerPicker.querySelector("[data-provider-choice]")?.focus(), 0);
}

function closeProviderPicker() {
  providerPicker.hidden = true;
  providerButton.setAttribute("aria-expanded", "false");
  providerSetup.hidden = true;
  providerSetup.innerHTML = "";
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
    showNotice(`${providerName()} 已连接。`, "info", 2200);
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
