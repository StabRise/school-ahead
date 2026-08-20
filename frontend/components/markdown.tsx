import { Children, isValidElement } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { getYoutubeVideoId } from "@/lib/youtube";
import { YoutubeEmbed } from "@/components/youtube-embed";

function YoutubeAwareLink({ href, children }: { href?: string; children?: React.ReactNode }) {
  const videoId = href ? getYoutubeVideoId(href) : null;
  if (videoId) {
    return <YoutubeEmbed videoId={videoId} />;
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-blue-600 underline hover:no-underline">
      {children}
    </a>
  );
}

// A markdown paragraph containing only a YouTube link resolves to a single
// <YoutubeEmbed> child — unwrap the <p> in that case, since a block-level
// embed (iframe wrapper div) inside a <p> is invalid HTML.
function ParagraphOrEmbed({ children }: { children?: React.ReactNode }) {
  const childArray = Children.toArray(children);
  const isSoleEmbed =
    childArray.length === 1 && isValidElement(childArray[0]) && childArray[0].type === YoutubeEmbed;
  if (isSoleEmbed) {
    return <>{children}</>;
  }
  return <p>{children}</p>;
}

const youtubeAwareComponents: Components = {
  a: ({ href, children }) => <YoutubeAwareLink href={href}>{children}</YoutubeAwareLink>,
  p: ({ children }) => <ParagraphOrEmbed>{children}</ParagraphOrEmbed>,
};

// Shared renderer for every markdown field the backend serves (Lesson
// content, Subject description, ...). See docs/architecture/02-data-model.md.
// `embedYoutube` opts into rendering YouTube links as inline video players —
// used for lesson content, not e.g. subject descriptions.
export function Markdown({
  content,
  embedYoutube = false,
}: {
  content: string;
  embedYoutube?: boolean;
}) {
  return (
    <div className="prose prose-sm max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={embedYoutube ? youtubeAwareComponents : undefined}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
