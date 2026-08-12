// Shared application state and cached DOM references.

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
const neteaseHelperLink = document.querySelector("#netease-helper-link");
const providerPicker = document.querySelector("#provider-picker");
const providerPickerClose = document.querySelector("#provider-picker-close");
const providerPickerEyebrow = document.querySelector("#provider-picker-eyebrow");
const providerPickerTitle = document.querySelector("#provider-picker-title");
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
