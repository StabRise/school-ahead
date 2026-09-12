const YOUTUBE_HOST_PATTERN = /(?:youtube(?:-nocookie)?\.com|youtu\.be)/i;

// Matches https://www.youtube.com/watch?v=ID, https://youtu.be/ID,
// https://www.youtube.com/embed/ID, https://www.youtube.com/shorts/ID
// (with or without extra query params/fragments), and the -nocookie host.
const YOUTUBE_URL_PATTERN =
  /https?:\/\/(?:www\.)?(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^\s)]*&)?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})[^\s)]*/i;

export function getYoutubeVideoId(href: string): string | null {
  if (!YOUTUBE_HOST_PATTERN.test(href)) return null;
  const match = href.match(YOUTUBE_URL_PATTERN);
  return match ? match[1] : null;
}

// Pulls the first YouTube link out of markdown content (bare URL or
// `[text](url)` form) so it can be rendered as a standalone full-width
// embed instead of inline prose — see components/preschool/lesson-view.tsx.
export function extractYoutubeVideo(content: string): { videoId: string | null; content: string } {
  const markdownLinkPattern = new RegExp(`\\[[^\\]]*\\]\\(${YOUTUBE_URL_PATTERN.source}\\)`, "i");

  const match = content.match(markdownLinkPattern) ?? content.match(YOUTUBE_URL_PATTERN);
  if (!match) return { videoId: null, content };

  const videoId = getYoutubeVideoId(match[0]);
  if (!videoId) return { videoId: null, content };

  const remaining = content
    .replace(match[0], "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { videoId, content: remaining };
}
