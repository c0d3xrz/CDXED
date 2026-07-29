// ==========================================================================
// CDXED — Link helpers (video embeds + file-type detection)
//
// The site no longer uploads any file to Firebase Storage (it now requires
// the paid Blaze plan even for zero usage — see README). Profile photo,
// certificate badge and project video/cover are all just LINKS the admin
// pastes in. This module turns a pasted video link into something useful
// to render: an embeddable player + a default thumbnail for YouTube/Vimeo,
// and tells an image link apart from a PDF one for certificates.
// ==========================================================================

function extractYouTubeId(url) {
  const m = url.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|shorts\/|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}
function extractVimeoId(url) {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? m[1] : null;
}

/**
 * Parses a pasted video URL. Synchronous — no network call.
 * Returns null if the string isn't a usable http(s) URL, otherwise
 * { platform: 'youtube'|'vimeo'|'other', embedUrl, thumbnailUrl, watchUrl }.
 * embedUrl/thumbnailUrl are null when we can't derive them (e.g. an
 * unrecognized platform, or Vimeo's thumbnail — see resolveThumbnail).
 */
export function parseVideoLink(rawUrl) {
  const url = (rawUrl || '').trim();
  if (!url) return null;
  let u;
  try { u = new URL(url); } catch (_) { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;

  const ytId = extractYouTubeId(url);
  if (ytId) {
    return {
      platform: 'youtube',
      embedUrl: `https://www.youtube-nocookie.com/embed/${ytId}`,
      thumbnailUrl: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
      watchUrl: url,
    };
  }
  const vimeoId = extractVimeoId(url);
  if (vimeoId) {
    return {
      platform: 'vimeo',
      embedUrl: `https://player.vimeo.com/video/${vimeoId}`,
      thumbnailUrl: null, // Vimeo needs an API round-trip — see resolveThumbnail()
      watchUrl: url,
    };
  }
  return { platform: 'other', embedUrl: null, thumbnailUrl: null, watchUrl: url };
}

/**
 * Best-effort thumbnail for links that don't expose one directly in the
 * URL itself (currently just Vimeo, via its public oEmbed endpoint).
 * Always resolves — never throws — falling back to null if it can't
 * find one (offline, blocked, private video, unknown platform, etc.).
 */
export async function resolveThumbnail(parsed) {
  if (!parsed) return null;
  if (parsed.thumbnailUrl) return parsed.thumbnailUrl;
  if (parsed.platform === 'vimeo') {
    try {
      const res = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(parsed.watchUrl)}`);
      if (res.ok) {
        const data = await res.json();
        return data.thumbnail_url || null;
      }
    } catch (_) { /* fail quietly — the card just shows no cover */ }
  }
  return null;
}

/** True when a pasted link points at a PDF (by file extension). */
export function isPdfUrl(rawUrl) {
  const url = (rawUrl || '').trim();
  if (!url) return false;
  try {
    const u = new URL(url);
    return /\.pdf($|\?)/i.test(u.pathname);
  } catch (_) { return false; }
}
