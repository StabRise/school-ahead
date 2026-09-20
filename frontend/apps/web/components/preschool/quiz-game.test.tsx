import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { QuizQuestionOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import messages from "../../messages/uk.json";
import { PreschoolQuizGame } from "./quiz-game";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { submit, getQuizQuestionHint } = vi.hoisted(() => ({ submit: vi.fn(), getQuizQuestionHint: vi.fn() }));

vi.mock("@school-ahead/api-client/browser/student-lessons/student-lessons", () => ({
  useSubmitQuiz: () => ({ mutate: submit }),
  getQuizQuestionHint,
}));
vi.mock("@school-ahead/api-client", () => ({
  prefetchVoice: vi.fn(),
  speakSequence: vi.fn(),
  toSpeechText: (text: string) => text,
}));
vi.mock("@school-ahead/markdown-editor", () => ({
  Markdown: ({ content }: { content: string }) => <span>{content}</span>,
}));

const questions: QuizQuestionOut[] = [
  {
    id: 1,
    prompt: "Where is your head?",
    order_index: 1,
    language: "en",
    choices: [
      { id: 11, text: "Голова", image: null },
      { id: 12, text: "Нога", image: null },
    ],
  },
];

const labels = messages.PreschoolQuizGame as Record<string, string>;

let host: HTMLDivElement;
let root: Root;
let onBackToMaterials: Mock<() => void>;
let onChanged: Mock<() => void>;

async function open() {
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="uk" messages={messages}>
        <PreschoolQuizGame
          studentLessonId={191}
          questions={questions}
          onChanged={onChanged}
          onBackToMaterials={onBackToMaterials}
        />
      </NextIntlClientProvider>,
    );
  });
}

const closeButton = () => host.querySelector<HTMLButtonElement>(`button[aria-label="${labels.closeLabel}"]`);
const choice = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
const pressEscape = () => act(async () => void document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));

beforeEach(() => {
  vi.useFakeTimers();
  submit.mockReset();
  getQuizQuestionHint.mockReset();
  getQuizQuestionHint.mockResolvedValue({ correct_choice_id: 11 });
  onBackToMaterials = vi.fn<() => void>();
  onChanged = vi.fn<() => void>();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("PreschoolQuizGame's popup", () => {
  it("is a dialog over the lesson, with a ✕ that closes it — back to the lesson's content", async () => {
    await open();

    expect(host.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe(labels.dialogLabel);
    expect(closeButton()).not.toBeNull();

    await act(async () => closeButton()?.click());

    expect(onBackToMaterials).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
  });

  it("closes with Escape too", async () => {
    await open();

    await pressEscape();

    expect(onBackToMaterials).toHaveBeenCalledTimes(1);
  });

  it("can be closed after a failed try as well, from the ✕", async () => {
    submit.mockImplementation((_vars, options) => options.onSuccess({ score_percent: 0 }));
    await open();
    await act(async () => choice("Нога")?.click());
    await act(async () => void vi.advanceTimersByTime(2000));

    expect(host.textContent).toContain(labels.failedMessage);
    expect(closeButton()).not.toBeNull();

    await act(async () => closeButton()?.click());
    expect(onBackToMaterials).toHaveBeenCalledTimes(1);
  });

  it("does not send the answers when it is closed during the pause after the last answer", async () => {
    await open();
    await act(async () => choice("Голова")?.click());

    // Closed (the lesson goes back to its content, so the quiz unmounts) before the pause is over.
    await act(async () => root.render(<div />));
    await act(async () => void vi.advanceTimersByTime(3000));

    expect(submit).not.toHaveBeenCalled();
  });

  it("still sends the answers when it is left open", async () => {
    await open();
    await act(async () => choice("Голова")?.click());
    await act(async () => void vi.advanceTimersByTime(2000));

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0][0]).toEqual({ studentLessonId: 191, data: { answers: { 1: 11 } } });
  });
});
