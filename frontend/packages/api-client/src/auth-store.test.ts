import { beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "./auth-store";

describe("useAuthStore", () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  it("starts with no user", () => {
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("isn't resolved until a user is set or the store is cleared", () => {
    useAuthStore.setState({ user: null, isResolved: false });
    expect(useAuthStore.getState().isResolved).toBe(false);

    useAuthStore.getState().clear();
    expect(useAuthStore.getState().isResolved).toBe(true);
  });

  it("sets and clears the user", () => {
    const user = {
      id: 1,
      email: "ada@example.com",
      role: "student" as const,
      name: "Ada Lovelace",
      locale: "uk",
      avatarUrl: "",
      interfaceMode: "default" as const,
      translationScope: "word" as const,
      translateOnSelect: false,
      equippedAvatar: null,
      equippedClothingItems: [],
      equippedHeadwearItems: [],
      equippedAccessoryItems: [],
      diamondBalance: null,
      canDoAnyLesson: null,
      schoolClassId: null,
      schoolClassName: null,
    };

    useAuthStore.getState().setUser(user);
    expect(useAuthStore.getState().user).toEqual(user);

    useAuthStore.getState().clear();
    expect(useAuthStore.getState().user).toBeNull();
  });
});
