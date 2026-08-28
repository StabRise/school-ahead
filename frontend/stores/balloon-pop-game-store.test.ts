import { beforeEach, describe, expect, it } from "vitest";
import { useBalloonPopGameStore } from "./balloon-pop-game-store";

describe("useBalloonPopGameStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useBalloonPopGameStore.setState({
      mode: "numbers10",
      language: "en",
      size: 112,
      speed: 1,
      maxOnScreen: 9,
      muted: false,
    });
  });

  it("starts with the default mode, language, sizing, and unmuted", () => {
    const state = useBalloonPopGameStore.getState();
    expect(state.mode).toBe("numbers10");
    expect(state.language).toBe("en");
    expect(state.size).toBe(112);
    expect(state.speed).toBe(1);
    expect(state.maxOnScreen).toBe(9);
    expect(state.muted).toBe(false);
  });

  it("updates individual settings independently", () => {
    useBalloonPopGameStore.getState().setMode("letters");
    useBalloonPopGameStore.getState().setLanguage("uk");
    useBalloonPopGameStore.getState().setMuted(true);

    const state = useBalloonPopGameStore.getState();
    expect(state.mode).toBe("letters");
    expect(state.language).toBe("uk");
    expect(state.muted).toBe(true);
    expect(state.size).toBe(112);
  });

  it("persists state to localStorage so it survives closing the tab", () => {
    useBalloonPopGameStore.getState().setMode("colors");
    useBalloonPopGameStore.getState().setMuted(true);

    const stored = JSON.parse(localStorage.getItem("balloon-pop-game-store") ?? "{}");
    expect(stored.state.mode).toBe("colors");
    expect(stored.state.muted).toBe(true);
  });
});
