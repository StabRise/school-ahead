import { Children, isValidElement } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { getYoutubeVideoId } from "@/lib/youtube";
import { YoutubeEmbed } from "@/components/youtube-embed";

function YoutubeAwareLink({ href, children }: { href?: string; children?: React.ReactNode }) {
  const videoId = href ? getYoutubeVideoId(href) : null;

  if (videoId) {
    // Construct the strict embed URL with parameters to restrict external videos
    const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&iv_load_policy=3`;

    return (
      <div className="relative w-full overflow-hidden rounded-2xl shadow-md aspect-video">
        <iframe
          src={embedUrl}
          title="Lesson Video"
          className="absolute top-0 left-0 h-full w-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
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
    <div className="prose prose-sm max-w-none w-full">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // rehype-raw parses HTML tags written inline in the markdown source
        // (tutors sometimes need e.g. <br>, <sup>, <span> for formatting
        // markdown alone can't do); rehype-sanitize (GitHub's default
        // allow-list) runs right after so no script/style/event-handler
        // content ever reaches the DOM.
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={embedYoutube ? youtubeAwareComponents : undefined}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
