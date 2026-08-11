"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  compactNeteaseCookie,
  normalizeAlbum,
  normalizeAlbumDetail,
  normalizeTrack,
  requireSuccessfulBody,
} = require("../backend/netease/api");

test("keeps only the small NetEase session cookie allowlist", () => {
  assert.equal(
    compactNeteaseCookie("MUSIC_U=secret; Path=/; HttpOnly; __csrf=token; SameSite=None"),
    "MUSIC_U=secret; __csrf=token",
  );
});

test("normalizes a saved NetEase album for the shared Vinyl mapper", () => {
  const album = normalizeAlbum({
    id: 42,
    name: "Black Vinyl",
    artists: [{ id: 7, name: "Needle" }],
    picUrl: "https://p1.music.126.net/cover.jpg",
    publishTime: Date.UTC(2024, 4, 2),
    size: 10,
    company: "Quiet Records",
  });
  assert.equal(album.id, 42);
  assert.equal(album.name, "Black Vinyl");
  assert.deepEqual(album.artists, [{ id: 7, name: "Needle" }]);
  assert.equal(album.release_date, "2024-05-02");
  assert.equal(album.total_tracks, 10);
  assert.equal(album.uri, null);
  assert.match(album.images[0].url, /param=1000y1000$/);
});

test("normalizes read-only tracks without a playable URI", () => {
  assert.deepEqual(normalizeTrack({ id: 9, name: "Side A", ar: [{ name: "Needle" }], dt: 183000, no: 1 }), {
    id: 9,
    uri: null,
    name: "Side A",
    artists: [{ id: null, name: "Needle" }],
    duration_ms: 183000,
    track_number: 1,
  });
});

test("normalizes album details and songs", () => {
  const detail = normalizeAlbumDetail({
    album: { id: 42, name: "Black Vinyl", artists: [{ name: "Needle" }], size: 1 },
    songs: [{ id: 9, name: "Side A", ar: [{ name: "Needle" }], dt: 183000, no: 1 }],
  });
  assert.equal(detail.id, 42);
  assert.equal(detail.tracks.items.length, 1);
  assert.equal(detail.tracks.items[0].uri, null);
});

test("turns an expired upstream session into a catchable authentication error", () => {
  assert.throws(
    () => requireSuccessfulBody({ status: 200, body: { code: 301, message: "需要登录" } }),
    (error) => error.status === 301 && error.body.code === 301,
  );
});
