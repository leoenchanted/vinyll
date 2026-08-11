// Local fallback collection used before a music account is connected.

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
