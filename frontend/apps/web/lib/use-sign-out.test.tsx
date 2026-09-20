import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@school-ahead/api-client";
import { useSignOut } from "./use-sign-out";

// React only flushes updates inside act() when it knows it's in a test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { mutate, push, removeQueries, logoutState } = vi.hoisted(() => ({
  mutate: vi.fn(),
  push: vi.fn(),
  removeQueries: vi.fn(),
  logoutState: { isPending: false },
}));

vi.mock("@school-ahead/api-client/browser/auth/auth", () => ({
  getMeQueryKey: () => ["/api/auth/me"],
  useLogout: () => ({ mutate, isPending: logoutState.isPending }),
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ removeQueries }) }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push }) }));

let host: HTMLDivElement;
let root: Root;
let signOut: () => void;

// Hands the hook's function out to the tests below.
const capture = (fn: () => void) => {
  signOut = fn;
};

function Probe() {
  const { signOut: current } = useSignOut();
  useEffect(() => capture(current));
  return null;
}

beforeEach(() => {
  mutate.mockReset();
  push.mockReset();
  removeQueries.mockReset();
  logoutState.isPending = false;
  useAuthStore.setState({ user: { id: 1 } as never, isResolved: true });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<Probe />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("useSignOut", () => {
  it("asks the server to end the session", () => {
    signOut();

    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("forgets the user, drops the cached `me` and goes to the login page once that is done", () => {
    signOut();
    const { onSettled } = mutate.mock.calls[0][1] as { onSettled: () => void };

    act(() => onSettled());

    expect(useAuthStore.getState().user).toBeNull();
    expect(removeQueries).toHaveBeenCalledWith({ queryKey: ["/api/auth/me"] });
    expect(push).toHaveBeenCalledWith("/login");
  });

  it("does not ask twice while it is already signing out", () => {
    logoutState.isPending = true;
    act(() => root.render(<Probe />));

    signOut();

    expect(mutate).not.toHaveBeenCalled();
  });
});
