import { NextRequest, NextResponse } from "next/server";
import { getPreschool } from "@school-ahead/api-client/server/preschool/preschool";

// A DB story's content references each uploaded image/audio/video as
// "{ /api/story-asset/<name> }" (see backend/preschool/models.py's
// STORY_ASSET_REF_PREFIX), never by the file's storage URL — in prod that's
// a presigned S3 link which expires an hour after it was issued. This
// redirects the stable ref to a freshly signed URL on every request, so a
// story keeps working no matter when it's opened. The ref ends in the file's
// extension, which is what lets story-parser.ts recognise it as an
// image/audio/video card, and it starts with "/", which stories-game.tsx's
// storyAssetUrl passes through as-is. Reachable without a session (excluded
// from the locale/auth middleware by its "/api" matcher, see middleware.ts),
// same as /api/story.
const ASSET_NAME_RE = /^[0-9a-f]{32}\.[A-Za-z0-9]{1,5}$/;

// Well inside the presigned URL's one-hour lifetime.
const REDIRECT_MAX_AGE_SECONDS = 600;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!ASSET_NAME_RE.test(name)) return new NextResponse(null, { status: 404 });

  try {
    const { url } = await getPreschool().getPreschoolStoryAssetUrl(name);
    const response = NextResponse.redirect(url, 302);
    response.headers.set("Cache-Control", `private, max-age=${REDIRECT_MAX_AGE_SECONDS}`);
    return response;
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status !== 404) console.error(`/api/story-asset: lookup failed for "${name}"`, err);
    return new NextResponse(null, { status: status === 404 ? 404 : 502 });
  }
}
