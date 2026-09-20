import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../messages/uk.json";
import { GoogleSignInButton } from "./google-sign-in-button";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { renderGoogleButton, useGoogleSignIn } = vi.hoisted(() => ({
  renderGoogleButton: vi.fn(),
  useGoogleSignIn: vi.fn(() => "idle"),
}));
vi.mock("@/lib/google-sign-in", () => ({ renderGoogleButton, useGoogleSignIn }));

const labels = messages.Login as Record<string, string>;

let host: HTMLDivElement;
let root: Root;

async function render() {
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="uk" messages={messages}>
        <GoogleSignInButton className="visible-button">Увійти через Google</GoogleSignInButton>
      </NextIntlClientProvider>,
    );
  });
}

const visibleButton = () => host.querySelector<HTMLButtonElement>("button.visible-button");
const overlay = () => host.querySelector<HTMLElement>("div[style]");

beforeEach(() => {
  renderGoogleButton.mockReset();
  useGoogleSignIn.mockReturnValue("idle");
  // jsdom has neither layout nor ResizeObserver.
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("GoogleSignInButton", () => {
  it("is not a link to anywhere — there is no login page", async () => {
    renderGoogleButton.mockResolvedValue(true);
    await render();

    expect(host.querySelector("a")).toBeNull();
    expect(visibleButton()?.textContent).toBe("Увійти через Google");
  });

  it("puts Google's own button over ours, out of the tab order, once Google is there", async () => {
    renderGoogleButton.mockResolvedValue(true);
    await render();

    expect(overlay()?.className).not.toContain("pointer-events-none");
    expect(visibleButton()?.getAttribute("aria-hidden")).toBe("true");
    expect(visibleButton()?.tabIndex).toBe(-1);
  });

  it("leaves the overlay out of the way while Google is missing, and says so when pressed again", async () => {
    renderGoogleButton.mockResolvedValue(false);
    await render();
    expect(overlay()?.className).toContain("pointer-events-none");
    expect(host.querySelector('[role="alert"]')).toBeNull();

    await act(async () => visibleButton()?.click());

    expect(renderGoogleButton).toHaveBeenCalledTimes(2); // once on mount, once on the press
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(labels.unavailable);
  });

  it("gets Google's button in on a later press, when it has loaded by then", async () => {
    renderGoogleButton.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await render();

    await act(async () => visibleButton()?.click());

    expect(overlay()?.className).not.toContain("pointer-events-none");
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it("shows the sign-in progress and errors", async () => {
    renderGoogleButton.mockResolvedValue(true);
    useGoogleSignIn.mockReturnValue("pending");
    await render();
    expect(visibleButton()?.textContent).toBe(labels.signingIn);

    useGoogleSignIn.mockReturnValue("error");
    await render();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(labels.error);
  });
});
