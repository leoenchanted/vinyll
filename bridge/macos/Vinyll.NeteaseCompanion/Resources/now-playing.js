ObjC.import("Foundation");

function value(info, key) {
  try {
    const result = info.valueForKey(key);
    if (!result) return null;
    return ObjC.unwrap(result);
  } catch (_error) {
    return null;
  }
}

function dateSeconds(info, key) {
  try {
    const result = info.valueForKey(key);
    if (!result) return 0;
    return Number(result.timeIntervalSince1970);
  } catch (_error) {
    return 0;
  }
}

function artwork(info) {
  try {
    const data = info.valueForKey("kMRMediaRemoteNowPlayingInfoArtworkData");
    if (!data || Number(data.length) <= 0 || Number(data.length) > 8000000) return null;
    return ObjC.unwrap(data.base64EncodedStringWithOptions(0));
  } catch (_error) {
    return null;
  }
}

function run() {
  try {
    const framework = $.NSBundle.bundleWithPath("/System/Library/PrivateFrameworks/MediaRemote.framework/");
    framework.load;
    const request = $.NSClassFromString("MRNowPlayingRequest");
    if (!request) return JSON.stringify({ supported: false });

    const playerPath = request.localNowPlayingPlayerPath;
    const client = playerPath ? playerPath.client : null;
    const item = request.localNowPlayingItem;
    const info = item ? item.nowPlayingInfo : null;
    const displayName = client ? String(ObjC.unwrap(client.displayName) || "") : "";
    const bundleIdentifier = client ? String(ObjC.unwrap(client.bundleIdentifier) || "") : "";

    if (!info) {
      return JSON.stringify({ supported: true, displayName, bundleIdentifier });
    }

    return JSON.stringify({
      supported: true,
      displayName,
      bundleIdentifier,
      title: String(value(info, "kMRMediaRemoteNowPlayingInfoTitle") || ""),
      artist: String(value(info, "kMRMediaRemoteNowPlayingInfoArtist") || ""),
      album: String(value(info, "kMRMediaRemoteNowPlayingInfoAlbum") || ""),
      duration: Number(value(info, "kMRMediaRemoteNowPlayingInfoDuration") || 0),
      elapsedTime: Number(value(info, "kMRMediaRemoteNowPlayingInfoElapsedTime") || 0),
      timestamp: dateSeconds(info, "kMRMediaRemoteNowPlayingInfoTimestamp"),
      playbackRate: Number(value(info, "kMRMediaRemoteNowPlayingInfoPlaybackRate") || 0),
      uniqueIdentifier: String(value(info, "kMRMediaRemoteNowPlayingInfoUniqueIdentifier") || ""),
      artworkMimeType: String(value(info, "kMRMediaRemoteNowPlayingInfoArtworkMIMEType") || ""),
      artworkData: artwork(info),
    });
  } catch (error) {
    return JSON.stringify({ supported: true, error: String(error) });
  }
}
