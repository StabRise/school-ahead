import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/uk.json";
import { PreschoolLessonTile } from "./preschool-lesson-tile";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The locale-aware Link can't load outside Next; these tiles are buttons (`onClick`) anyway.
vi.mock("@/i18n/navigation", () => ({ Link: () => null }));

let host: HTMLDivElement;
let root: Root;

async function render(props: { icon: string | null; completed?: boolean }) {
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="uk" messages={messages}>
        <PreschoolLessonTile
          onClick={() => {}}
          icon={props.icon}
          subjectIcon={null}
          lessonType="theory"
          title="Hello Song"
          index={0}
          completed={props.completed}
        />
      </NextIntlClientProvider>,
    );
  });
}

const badge = () =>
  host.querySelector<HTMLElement>(`[role="img"][aria-label="${messages.PreschoolSubjectDetail.lessonDone}"]`);

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("PreschoolLessonTile's finished-lesson badge", () => {
  it.each([
    ["a picture card", "https://example.com/pic.jpg"],
    ["a gradient card", null],
  ])("puts a green tick in the top-right corner of %s", async (_name, icon) => {
    await render({ icon, completed: true });

    const tick = badge();
    expect(tick).not.toBeNull();
    expect(tick?.className).toContain("right-2");
    expect(tick?.className).toContain("top-2");
    expect(tick?.className).toContain("bg-emerald-500");
    expect(tick?.querySelector("svg")).not.toBeNull();
    // Positioned against the card, which has to be the containing block.
    expect(tick?.closest("button")?.className).toContain("relative");
  });

  it("is only an icon: not a button", async () => {
    await render({ icon: null, completed: true });

    expect(badge()?.tagName).toBe("SPAN");
    expect(badge()?.closest("button")?.querySelectorAll("button")).toHaveLength(0);
  });

  it.each([undefined, false])("is not drawn for a lesson that is not finished (%s)", async (completed) => {
    await render({ icon: null, completed });

    expect(badge()).toBeNull();
  });
});
