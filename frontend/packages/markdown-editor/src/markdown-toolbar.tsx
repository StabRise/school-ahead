"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Quote,
  Smile,
} from "lucide-react";

// Callbacks a MarkdownToolbar caller implements to actually mutate its own
// text-editing surface — a plain <textarea>'s selectionStart/End, or a
// contentEditable's Selection/Range (see story/story-rich-text-editor.tsx
// for the latter). This component is pure presentation: every button just
// calls the matching action.
export interface MarkdownToolbarActions {
  onHeading: (level: 1 | 2 | 3) => void;
  onBold: () => void;
  onItalic: () => void;
  onInlineCode: () => void;
  onBlockquote: () => void;
  onBulletList: () => void;
  onNumberedList: () => void;
  onLink: () => void;
  onHorizontalRule: () => void;
  onInsertEmoji: (emoji: string) => void;
}

const HEADING_LEVELS = [1, 2, 3] as const;
const HEADING_ICONS = { 1: Heading1, 2: Heading2, 3: Heading3 } as const;

// A small curated set (faces, animals, nature, treasure/food, hearts) —
// not a full emoji-picker library, just enough to sprinkle a few into text.
const COMMON_EMOJIS = [
  "😀", "😊", "😉", "😢", "😱", "😴", "🥳", "😻",
  "🐺", "🦊", "🐻", "🐰", "🐱", "🐶", "🐸", "🦉", "🐦", "🦋",
  "🌳", "🌸", "🌞", "🌙", "⭐", "🌈", "☀️", "🌧️", "❄️",
  "🏠", "🗝️", "👑", "🍎", "🍯", "🎂", "💎",
  "❤️", "💛", "💚", "💙", "💜",
];

const BUTTON_CLASS = "rounded p-1.5 text-gray-600 hover:bg-gray-200";

function Separator() {
  return <span aria-hidden="true" className="mx-1 h-4 w-px bg-gray-300" />;
}

// Standard Markdown formatting toolbar — icon-only buttons for headings
// 1-3, bold, italic, inline code, blockquote, bullet/numbered list, link,
// a horizontal rule, and an emoji picker. Reusable by any editor: it owns
// no text-mutation logic itself, only the button row + emoji popup UI, so
// a contentEditable-based editor and a plain-<textarea>-based one can both
// drop it in by implementing MarkdownToolbarActions for their own surface.
export function MarkdownToolbar({ actions }: { actions: MarkdownToolbarActions }) {
  const t = useTranslations("MarkdownToolbar");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-md border border-gray-200 bg-gray-50 p-1">
      {HEADING_LEVELS.map((level) => {
        const Icon = HEADING_ICONS[level];
        return (
          <button
            key={level}
            type="button"
            title={t(`heading${level}Label`)}
            aria-label={t(`heading${level}Label`)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => actions.onHeading(level)}
            className={BUTTON_CLASS}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
      <Separator />
      <button
        type="button"
        title={t("boldLabel")}
        aria-label={t("boldLabel")}
        onMouseDown={(e) => e.preventDefault()}
        onClick={actions.onBold}
        className={BUTTON_CLASS}
      >
        <Bold className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title={t("italicLabel")}
        aria-label={t("italicLabel")}
        onMouseDown={(e) => e.preventDefault()}
        onClick={actions.onItalic}
        className={BUTTON_CLASS}
      >
        <Italic className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title={t("inlineCodeLabel")}
        aria-label={t("inlineCodeLabel")}
        onMouseDown={(e) => e.preventDefault()}
        onClick={actions.onInlineCode}
        className={BUTTON_CLASS}
      >
        <Code className="h-3.5 w-3.5" />
      </button>
      <Separator />
      <button
        type="button"
        title={t("blockquoteLabel")}
        aria-label={t("blockquoteLabel")}
        onMouseDown={(e) => e.preventDefault()}
        onClick={actions.onBlockquote}
        className={BUTTON_CLASS}
      >
        <Quote className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title={t("bulletListLabel")}
        aria-label={t("bulletListLabel")}
        onMouseDown={(e) => e.preventDefault()}
        onClick={actions.onBulletList}
        className={BUTTON_CLASS}
      >
        <List className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title={t("numberedListLabel")}
        aria-label={t("numberedListLabel")}
        onMouseDown={(e) => e.preventDefault()}
        onClick={actions.onNumberedList}
        className={BUTTON_CLASS}
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title={t("linkLabel")}
        aria-label={t("linkLabel")}
        onMouseDown={(e) => e.preventDefault()}
        onClick={actions.onLink}
        className={BUTTON_CLASS}
      >
        <LinkIcon className="h-3.5 w-3.5" />
      </button>
      <Separator />
      <button
        type="button"
        title={t("horizontalRuleLabel")}
        aria-label={t("horizontalRuleLabel")}
        onMouseDown={(e) => e.preventDefault()}
        onClick={actions.onHorizontalRule}
        className={BUTTON_CLASS}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <Separator />
      <div className="relative">
        <button
          type="button"
          title={t("emojiLabel")}
          aria-label={t("emojiLabel")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setShowEmojiPicker((prev) => !prev)}
          className={BUTTON_CLASS}
        >
          <Smile className="h-3.5 w-3.5" />
        </button>
        {showEmojiPicker && (
          <div className="absolute left-0 top-full z-10 mt-1 grid w-64 grid-cols-8 gap-0.5 rounded-md border border-gray-200 bg-white p-2 shadow-lg">
            {COMMON_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setShowEmojiPicker(false);
                  actions.onInsertEmoji(emoji);
                }}
                className="rounded p-1 text-lg hover:bg-gray-100"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
