// Album mapping, cover palette extraction, and generated demo artwork.

function mapProviderTrack(track, index) {
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

function mapProviderAlbum({ album }, index) {
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
    tracks: album.tracks?.items?.map(mapProviderTrack) || [],
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
