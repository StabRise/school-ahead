import { beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "./auth-store";

describe("useAuthStore", () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  it("starts with no user", () => {
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("sets and clears the user", () => {
    const user = {
      id: 1,
      email: "ada@example.com",
      role: "student" as const,
      name: "Ada Lovelace",
      locale: "uk",
      avatarUrl: "",
    };

    useAuthStore.getState().setUser(user);
    expect(useAuthStore.getState().user).toEqual(user);

    useAuthStore.getState().clear();
    expect(useAuthStore.getState().user).toBeNull();
  });
});
