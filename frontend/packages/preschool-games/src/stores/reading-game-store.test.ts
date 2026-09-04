import { beforeEach, describe, expect, it } from "vitest";
import { useReadingGameStore } from "./reading-game-store";

describe("useReadingGameStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useReadingGameStore.setState({
      consonant: "М",
      syllableCount: 4,
      showCaptions: true,
      uppercase: true,
      muted: false,
    });
  });

  it("starts with the default consonant, syllable count, and captions on", () => {
    const state = useReadingGameStore.getState();
    expect(state.consonant).toBe("М");
    expect(state.syllableCount).toBe(4);
    expect(state.showCaptions).toBe(true);
    expect(state.uppercase).toBe(true);
    expect(state.muted).toBe(false);
  });

  it("updates individual settings independently", () => {
    useReadingGameStore.getState().setConsonant("Т");
    useReadingGameStore.getState().setShowCaptions(false);
    useReadingGameStore.getState().setUppercase(false);
    useReadingGameStore.getState().setMuted(true);

    const state = useReadingGameStore.getState();
    expect(state.consonant).toBe("Т");
    expect(state.showCaptions).toBe(false);
    expect(state.uppercase).toBe(false);
    expect(state.muted).toBe(true);
    expect(state.syllableCount).toBe(4);
  });

  it("clamps syllableCount to the 3-9 range", () => {
    useReadingGameStore.getState().setSyllableCount(20);
    expect(useReadingGameStore.getState().syllableCount).toBe(9);

    useReadingGameStore.getState().setSyllableCount(0);
    expect(useReadingGameStore.getState().syllableCount).toBe(3);

    useReadingGameStore.getState().setSyllableCount(6);
    expect(useReadingGameStore.getState().syllableCount).toBe(6);
  });

  it("persists state to localStorage so it survives closing the tab", () => {
    useReadingGameStore.getState().setConsonant("Б");
    useReadingGameStore.getState().setMuted(true);

    const stored = JSON.parse(localStorage.getItem("reading-game-store") ?? "{}");
    expect(stored.state.consonant).toBe("Б");
    expect(stored.state.muted).toBe(true);
  });
});
