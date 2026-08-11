// Formatting, notifications, and deterministic color helpers.

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
