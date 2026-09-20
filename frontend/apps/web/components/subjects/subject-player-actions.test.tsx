import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@school-ahead/api-client";
import { getListStudentSubjectPlaylistQueryKey } from "@school-ahead/api-client/browser/student-lessons/student-lessons";
import type { PlaylistTrackOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import messages from "../../messages/uk.json";
import { PlayerTrackActions } from "./subject-player-actions";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { push, startLessonToday } = vi.hoisted(() => ({ push: vi.fn(), startLessonToday: vi.fn() }));

vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@school-ahead/api-client/browser/student-lessons/student-lessons", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@school-ahead/api-client/browser/student-lessons/student-lessons")>()),
  startLessonToday,
}));

const SUBJECT_ID = 67;
const TOPIC_ID = 57;
const labels = messages.PreschoolSubjectDetail.player as Record<string, string>;

const track = (overrides: Partial<PlaylistTrackOut> = {}): PlaylistTrackOut => ({
  lesson_id: 1,
  title: "Song",
  video_id: "video000001",
  lesson_type: "theory",
  student_lesson_id: 195,
  status: "in_progress",
  is_favorite: false,
  ...overrides,
});

let host: HTMLDivElement;
let root: Root;

async function render(entry: PlaylistTrackOut, { canDoAnyLesson = false } = {}) {
  useAuthStore.setState({ user: { canDoAnyLesson } as never });
  const queryClient = new QueryClient();
  // The playlist the buttons read their state from — fresh, so nothing is fetched.
  queryClient.setQueryData(getListStudentSubjectPlaylistQueryKey(SUBJECT_ID, { topic_id: TOPIC_ID }), [entry]);
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="uk" messages={messages}>
          <PlayerTrackActions subjectId={SUBJECT_ID} topicId={TOPIC_ID} track={entry} layout="framed" />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
  });
}

const button = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

beforeEach(() => {
  push.mockReset();
  startLessonToday.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  useAuthStore.setState({ user: null });
});

describe("PlayerTrackActions", () => {
  it("offers ✅ (and ❤️), but no ➡️, for a theory lesson", async () => {
    await render(track());

    expect(button(labels.markDone)).not.toBeNull();
    expect(button(labels.favoriteAdd)).not.toBeNull();
    expect(button(labels.goToQuiz)).toBeNull();
    expect(button(labels.goToTask)).toBeNull();
  });

  it("offers ➡️ to the quiz, and no ✅, for a lesson with a quiz — opening the lesson on step 2", async () => {
    await render(track({ lesson_type: "with_quiz", student_lesson_id: 195 }));

    expect(button(labels.markDone)).toBeNull();
    await act(async () => button(labels.goToQuiz)?.click());

    expect(push).toHaveBeenCalledWith("/lessons/195?step=practice");
  });

  it("offers ➡️ to the task for a lesson with a task", async () => {
    await render(track({ lesson_type: "with_task" }));

    expect(button(labels.markDone)).toBeNull();
    expect(button(labels.goToTask)).not.toBeNull();
  });

  it("creates today's lesson first when the student has none and may start any, then opens step 2", async () => {
    startLessonToday.mockResolvedValue({ student_lesson_id: 300 });
    await render(track({ lesson_type: "with_quiz", student_lesson_id: null, status: null }), { canDoAnyLesson: true });

    await act(async () => button(labels.goToQuiz)?.click());

    expect(startLessonToday).toHaveBeenCalledWith(1);
    expect(push).toHaveBeenCalledWith("/lessons/300?step=practice");
  });

  it("shows nothing for a lesson the student has not got and may not start", async () => {
    await render(track({ lesson_type: "with_quiz", student_lesson_id: null, status: null }), { canDoAnyLesson: false });

    expect(host.textContent).toBe("");
    expect(host.querySelector("button")).toBeNull();
  });

  it("marks a finished lesson with a plain ✅ icon — not a button, not ringed, no pointer", async () => {
    await render(track({ lesson_type: "with_quiz", status: "completed" }));

    const done = host.querySelector<HTMLElement>(`[role="img"][aria-label="${labels.done}"]`);
    expect(done?.textContent).toBe("✅");
    expect(done?.tagName).toBe("SPAN");
    expect(done?.className).not.toMatch(/ring|rounded|cursor-pointer|bg-white/);
    expect(done?.className).toContain("cursor-default");
    expect(button(labels.done)).toBeNull();
    expect(button(labels.markDone)).toBeNull();
    // Nothing left to do on step 2: no ➡️ beside it, whatever the type.
    expect(button(labels.goToQuiz)).toBeNull();
    expect(button(labels.goToTask)).toBeNull();
  });

  it.each([
    ["with_quiz", "goToQuiz"],
    ["with_task", "goToTask"],
  ])("hides ➡️ once a %s lesson is completed, keeping only the ✅ icon", async (lessonType, key) => {
    await render(track({ lesson_type: lessonType, status: "completed" }));

    expect(button(labels[key])).toBeNull();
    expect(host.querySelector(`[role="img"][aria-label="${labels.done}"]`)).not.toBeNull();
  });
});
