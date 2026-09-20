"use client";

import { useEffect, useRef, useState } from "react";

export interface OptionsGearOption<T extends string> {
  value: T;
  emoji: string;
  label: string;
}

// One more choice offered in the same panel, under a divider — the bookshelf's
// "how to open a lesson" beside its "which subjects".
export interface OptionsGearSection<T extends string> {
  value: T;
  options: OptionsGearOption<T>[];
  onChange: (next: T) => void;
  // The section's heading.
  title: string;
}

function OptionButton({
  active,
  option,
  onChoose,
}: {
  active: boolean;
  option: OptionsGearOption<string>;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onChoose}
      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-left font-bold transition ${
        active
          ? "bg-emerald-400 text-white ring-2 ring-emerald-500"
          : "bg-gray-100 text-gray-800 hover:bg-gray-200"
      }`}
    >
      <span className="text-2xl" aria-hidden="true">
        {option.emoji}
      </span>
      {option.label}
    </button>
  );
}

// The gear in a preschool screen's top-right corner, styled and behaving like
// the ⚙️ every minigame has (e.g. math-game.tsx): a small round white button
// that toggles a floating panel, closed by a tap anywhere outside it or
// Escape. The panel lists `options` one per row; choosing one calls `onChange`
// and closes it; an optional `secondary` section adds a second choice under a
// divider. Used for the bookshelf's "which subjects" choice and "how to open a
// lesson" (subjects-shelf.tsx) and the subject page's "which lessons" one.
export function PreschoolOptionsGear<T extends string>({
  value,
  options,
  onChange,
  buttonLabel,
  title,
  secondary,
}: {
  value: T;
  options: OptionsGearOption<T>[];
  onChange: (next: T) => void;
  // The button's accessible name — it is only a gear glyph.
  buttonLabel: string;
  // The panel's heading.
  title: string;
  secondary?: OptionsGearSection<string>;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const choose = (next: T) => {
    onChange(next);
    setOpen(false);
  };
  const chooseSecondary = (next: string) => {
    secondary?.onChange(next);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={buttonLabel}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white text-lg shadow-lg ring-2 ring-gray-200"
      >
        ⚙️
      </button>

      {open && (
        <div
          ref={panelRef}
          role="group"
          aria-label={title}
          className="absolute right-0 top-full z-30 mt-2 flex w-64 flex-col gap-2 rounded-2xl bg-white p-3 text-sm shadow-lg ring-2 ring-gray-200"
        >
          <span className="px-1 font-medium text-gray-700">{title}</span>
          {options.map((option) => (
            <OptionButton
              key={option.value}
              active={value === option.value}
              option={option}
              onChoose={() => choose(option.value)}
            />
          ))}
          {secondary && (
            <>
              <span className="mt-1 border-t border-gray-200 px-1 pt-3 font-medium text-gray-700">
                {secondary.title}
              </span>
              {secondary.options.map((option) => (
                <OptionButton
                  key={option.value}
                  active={secondary.value === option.value}
                  option={option}
                  onChoose={() => chooseSecondary(option.value)}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
