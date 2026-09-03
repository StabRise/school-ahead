import type { Parent, Text } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { Data, Node } from "unist";
import { visit } from "unist-util-visit";

// The hast tag name a "{...}" reference (docs/preschool/games/reading/
// Stories.md §3) turns into — react-markdown's `components` map (see
// stories-game.tsx) renders it via a custom component keyed by this tag,
// same mechanism the codebase already uses for tutor-authored tags like
// <pdfviewer> (components/markdown.tsx).
export const STORY_CARD_TAG = "story-card";

interface StoryCardNode extends Node {
  type: "storyCard";
  data: Data & { hName: string; hProperties: { raw: string } };
}

const GROUP_RE = /\{([^}]+)\}/g;

// Splits "{...}" card references out of any Markdown text run into their
// own <story-card raw="..."> hast element, carrying the group's raw
// (unparsed) content for the component to interpret via
// lib/story-parser.ts's parseSyllableGroup. A remark plugin (runs on the
// parsed mdast tree, before the mdast->hast handoff) rather than a
// pre/post text substitution, so "{...}" is recognized inside any Markdown
// construct — emphasis, list items, a heading — not just a plain paragraph.
export function remarkStoryCards() {
  return (tree: Parent) => {
    visit(tree, "text", (node: Text, index, parent) => {
      if (!parent || index === undefined) return;
      if (!GROUP_RE.test(node.value)) return;
      GROUP_RE.lastIndex = 0; // the .test() above advanced it (the "g" flag)

      const replacement: (Text | StoryCardNode)[] = [];
      let lastIndex = 0;
      for (const match of node.value.matchAll(GROUP_RE)) {
        const matchIndex = match.index ?? 0;
        if (matchIndex > lastIndex) {
          replacement.push({ type: "text", value: node.value.slice(lastIndex, matchIndex) });
        }
        replacement.push({
          type: "storyCard",
          data: { hName: STORY_CARD_TAG, hProperties: { raw: match[1] } },
        } as StoryCardNode);
        lastIndex = matchIndex + match[0].length;
      }
      if (lastIndex < node.value.length) {
        replacement.push({ type: "text", value: node.value.slice(lastIndex) });
      }

      // mdast's Parent["children"] type doesn't know about our custom
      // "storyCard" node type — same kind of cast remark plugins that add
      // custom node types generally need (e.g. remark-gfm's own footnote
      // handling).
      (parent.children as unknown[]).splice(index, 1, ...replacement);
      return index + replacement.length; // resume the visit past the nodes we just inserted
    });
  };
}

// Every plain text run in `body`'s Markdown, in document order, with
// "{...}" card references already split out (via the same remark plugin
// used for rendering) so none of their raw content ends up in the result —
// there's nothing to read aloud for a picture. Used by the "🔊 Прочитати"
// whole-page read-aloud (components/preschool/stories-game.tsx), which
// speaks each returned run in turn.
export function extractStorySpeechRuns(body: string): string[] {
  // .parse() only runs remark-parse itself — remarkStoryCards is a
  // transformer, which only runs via .run()/.runSync() (or .process()), so
  // it has to be applied as a separate step for its "{...}" splitting to
  // actually happen here.
  const processor = unified().use(remarkParse).use(remarkStoryCards);
  const tree = processor.runSync(processor.parse(body));
  const runs: string[] = [];
  visit(tree, "text", (node: Text) => {
    if (node.value.trim()) runs.push(node.value);
  });
  return runs;
}
