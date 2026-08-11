(function () {
  "use strict";

  const MUSICKIT_SRC = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
  let music = null;
  let developerToken = "";
  let scriptPromise = null;

  function artworkUrl(artwork, size = 1000) {
    const template = typeof artwork === "string" ? artwork : artwork?.url;
    if (!template) return null;
    return template
      .replace("{w}", String(size))
      .replace("{h}", String(size))
      .replace("{f}", "jpg");
  }

  function loadMusicKit() {
    if (window.MusicKit) return Promise.resolve(window.MusicKit);
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = MUSICKIT_SRC;
      script.async = true;
      script.onload = () => window.MusicKit ? resolve(window.MusicKit) : reject(new Error("MusicKit 加载失败"));
      script.onerror = () => reject(new Error("无法连接 Apple MusicKit"));
      document.head.appendChild(script);
    });
    return scriptPromise;
  }

  async function fetchDeveloperToken() {
    const response = await fetch("/api/apple-token", { headers: { Accept: "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.developerToken) {
      const error = new Error(payload.error || "Apple Music 尚未在 Vercel 配置开发者令牌");
      error.code = payload.code || "APPLE_NOT_CONFIGURED";
      throw error;
    }
    developerToken = payload.developerToken;
    return developerToken;
  }

  async function configure() {
    if (music) return music;
    const [MusicKit, token] = await Promise.all([loadMusicKit(), fetchDeveloperToken()]);
    const configured = await MusicKit.configure({
      developerToken: token,
      app: { name: "The Vinyl", build: "1.0.0" },
    });
    music = configured || MusicKit.getInstance();
    if (!music) throw new Error("MusicKit 初始化失败");
    return music;
  }

  async function login() {
    const instance = await configure();
    const userToken = await instance.authorize();
    if (!userToken && !instance.musicUserToken) throw new Error("Apple Music 授权未完成");
    return true;
  }

  async function getAccessToken() {
    try {
      const instance = await configure();
      return instance.musicUserToken || null;
    } catch (error) {
      if (error.code === "APPLE_NOT_CONFIGURED") throw error;
      return null;
    }
  }

  async function api(path, options = {}) {
    const instance = await configure();
    const userToken = instance.musicUserToken;
    if (!userToken) throw new Error("Apple Music 尚未登录");
    const response = await fetch(`https://api.music.apple.com${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${developerToken}`,
        "Music-User-Token": userToken,
        Accept: "application/json",
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload.errors?.[0]?.detail || payload.errors?.[0]?.title || `Apple Music API 请求失败 (${response.status})`;
      throw new Error(message);
    }
    return payload;
  }

  function catalogResource(resource) {
    return resource?.relationships?.catalog?.data?.[0] || null;
  }

  function normalizedAlbum(resource) {
    const catalog = catalogResource(resource);
    const attributes = { ...(resource?.attributes || {}), ...(catalog?.attributes || {}) };
    const libraryId = resource?.id || catalog?.id;
    const catalogId = attributes.playParams?.catalogId || catalog?.id || attributes.playParams?.id || libraryId;
    const artistName = attributes.artistName || "Unknown artist";
    return {
      id: libraryId,
      name: attributes.name || "Untitled album",
      artists: [{ name: artistName }],
      images: artworkUrl(attributes.artwork) ? [{ url: artworkUrl(attributes.artwork) }] : [],
      release_date: attributes.releaseDate || attributes.dateAdded || "",
      external_urls: { spotify: attributes.url || null },
      uri: `apple:album:${catalogId || libraryId}`,
      album_type: "album",
      total_tracks: attributes.trackCount || resource?.relationships?.tracks?.data?.length || 0,
      label: attributes.recordLabel || null,
      copyrights: attributes.copyright ? [{ type: "C", text: attributes.copyright }] : [],
    };
  }

  function normalizedTrack(resource, index = 0) {
    const attributes = resource?.attributes || {};
    const catalogId = attributes.playParams?.catalogId || attributes.playParams?.id || resource?.id;
    return {
      id: resource?.id,
      uri: `apple:song:${catalogId || resource?.id}`,
      name: attributes.name || `Track ${index + 1}`,
      artists: [{ name: attributes.artistName || "" }],
      duration_ms: attributes.durationInMillis || 0,
      track_number: attributes.trackNumber || index + 1,
    };
  }

  async function getLibrary() {
    const payload = await api("/v1/me/library/albums?limit=100&include=catalog");
    const resources = payload.data || [];
    return {
      profile: { display_name: "Apple Music" },
      items: resources.map((resource) => ({ album: normalizedAlbum(resource) })),
      total: Number(payload.meta?.total || resources.length),
    };
  }

  async function getAlbum(id) {
    const payload = await api(`/v1/me/library/albums/${encodeURIComponent(id)}?include=tracks,catalog`);
    const resource = payload.data?.[0];
    if (!resource) throw new Error("Apple Music 专辑不存在");
    const album = normalizedAlbum(resource);
    let tracks = resource.relationships?.tracks?.data || [];
    if (!tracks.length) {
      const trackPayload = await api(`/v1/me/library/albums/${encodeURIComponent(id)}/tracks?limit=100`);
      tracks = trackPayload.data || [];
    }
    return { ...album, tracks: { items: tracks.map(normalizedTrack) } };
  }

  function nowPlayingArtwork(item, attributes) {
    return artworkUrl(attributes.artwork)
      || artworkUrl(item?.artworkURL)
      || null;
  }

  async function getPlaybackState() {
    const instance = await configure();
    const player = instance.player;
    const nowPlaying = player?.nowPlayingItem;
    if (!nowPlaying) return null;
    const attributes = nowPlaying.attributes || nowPlaying;
    const artistName = attributes.artistName || attributes.artist || "Apple Music";
    const cover = nowPlayingArtwork(nowPlaying, attributes);
    const durationSeconds = Number(player.currentPlaybackDuration || attributes.durationInMillis / 1000 || attributes.duration || 0);
    const state = player.playbackState;
    const playingValue = window.MusicKit?.PlaybackStates?.playing;
    const isPlaying = state === playingValue || state === 2 || String(state).toLowerCase() === "playing";
    return {
      is_playing: isPlaying,
      progress_ms: Math.max(0, Number(player.currentPlaybackTime || 0) * 1000),
      device: { id: "musickit-web", name: "Apple Music Web" },
      item: {
        id: nowPlaying.id || attributes.playParams?.id,
        name: attributes.name || attributes.title || "Unknown track",
        duration_ms: Math.max(0, durationSeconds * 1000),
        artists: [{ name: artistName }],
        album: {
          id: attributes.albumId || attributes.playParams?.catalogId || attributes.albumName,
          name: attributes.albumName || "Apple Music",
          artists: [{ name: artistName }],
          images: cover ? [{ url: cover }] : [],
          release_date: attributes.releaseDate || "",
          external_urls: { spotify: attributes.url || null },
          uri: attributes.albumId ? `apple:album:${attributes.albumId}` : null,
          album_type: "album",
        },
      },
    };
  }

  async function pausePlayback() {
    return (await configure()).player.pause();
  }

  async function resumePlayback() {
    return (await configure()).player.play();
  }

  async function skipNext() {
    return (await configure()).player.skipToNextItem();
  }

  async function skipPrevious() {
    return (await configure()).player.skipToPreviousItem();
  }

  async function seekPlayback(positionMs) {
    return (await configure()).player.seekToTime(Math.max(0, Number(positionMs) || 0) / 1000);
  }

  async function playAlbum(contextUri, trackUri = null) {
    const instance = await configure();
    const albumId = String(contextUri || "").replace(/^apple:album:/, "");
    const trackId = String(trackUri || "").replace(/^apple:song:/, "") || undefined;
    if (!albumId) throw new Error("Apple Music 专辑缺少可播放 ID");
    await instance.setQueue({ album: albumId, ...(trackId ? { startWith: trackId } : {}) });
    return instance.player.play();
  }

  async function logout() {
    if (!music) return;
    try {
      await music.unauthorize();
    } finally {
      music = null;
      developerToken = "";
    }
  }

  window.appleMusicAuth = {
    prepare: configure,
    login,
    logout,
    getAccessToken,
    getLibrary,
    getAlbum,
    getPlaybackState,
    pausePlayback,
    resumePlayback,
    skipNext,
    skipPrevious,
    seekPlayback,
    playAlbum,
    needsScopeUpgrade: () => false,
    handleCallback: async () => false,
  };
})();
