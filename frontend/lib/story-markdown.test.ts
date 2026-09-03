import type { Root } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";
import { remarkStoryCards, STORY_CARD_TAG } from "./story-markdown";

function parseWithStoryCards(markdown: string): Root {
  const processor = unified().use(remarkParse).use(remarkStoryCards);
  return processor.runSync(processor.parse(markdown)) as Root;
}

// mdast doesn't know about our custom "storyCard" node type, so these tests
// reach into the tree with `any` rather than fighting the types — same
// trade-off remarkStoryCards itself makes (see its own casts).
/* eslint-disable @typescript-eslint/no-explicit-any */
function findStoryCards(tree: Root): any[] {
  const found: any[] = [];
  const visitNode = (node: any) => {
    if (node.type === "storyCard") found.push(node);
    for (const child of node.children ?? []) visitNode(child);
  };
  visitNode(tree);
  return found;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe("remarkStoryCards", () => {
  it("replaces a {...} reference with a story-card node carrying its raw content", () => {
    const cards = findStoryCards(parseWithStoryCards("Щоранку {ві - н} виходив."));
    expect(cards).toHaveLength(1);
    expect(cards[0].data.hName).toBe(STORY_CARD_TAG);
    expect(cards[0].data.hProperties.raw).toBe("ві - н");
  });

  it("keeps the surrounding text as separate text nodes", () => {
    const tree = parseWithStoryCards("Щоранку {ві - н} виходив.");
    const paragraph = tree.children[0] as unknown as { children: { type: string; value?: string }[] };
    expect(paragraph.children.map((child) => child.type)).toEqual(["text", "storyCard", "text"]);
    expect(paragraph.children[0].value).toBe("Щоранку ");
    expect(paragraph.children[2].value).toBe(" виходив.");
  });

  it("finds every {...} reference in the document, including more than one per paragraph", () => {
    const cards = findStoryCards(parseWithStoryCards("{ ді - д } та { ба - ба } жили."));
    expect(cards).toHaveLength(2);
    expect(cards.map((card) => card.data.hProperties.raw)).toEqual([" ді - д ", " ба - ба "]);
  });

  it("recognizes a {...} reference inside Markdown emphasis", () => {
    const cards = findStoryCards(parseWithStoryCards("Це **{ба - ба}** казки."));
    expect(cards).toHaveLength(1);
    expect(cards[0].data.hProperties.raw).toBe("ба - ба");
  });
});
