import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { setUser, googleLogin } = vi.hoisted(() => ({ setUser: vi.fn(), googleLogin: vi.fn() }));

vi.mock("@school-ahead/api-client", () => ({
  useAuthStore: { getState: () => ({ setUser }) },
  mapApiUserToAuthUser: (user: unknown) => user,
}));
vi.mock("@school-ahead/api-client/browser/auth/auth", () => ({ googleLogin }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { renderGoogleButton, resetGoogleSignInForTests } from "./google-sign-in";

// A stand-in for the GIS script: records how it was initialised and lets a test
// hand its callback a credential the way Google would after the account chooser.
function installFakeGoogle() {
  const initialize = vi.fn();
  const renderButton = vi.fn();
  window.google = { accounts: { id: { initialize, renderButton } } };
  const credential = (idToken: string) => initialize.mock.calls[0][0].callback({ credential: idToken });
  return { initialize, renderButton, credential };
}

describe("renderGoogleButton", () => {
  beforeEach(() => {
    resetGoogleSignInForTests();
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "client-id");
    setUser.mockReset();
    googleLogin.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.google;
  });

  it("initialises Google once, however many buttons are drawn", async () => {
    const google = installFakeGoogle();

    expect(await renderGoogleButton(document.createElement("div"), { width: 240 })).toBe(true);
    expect(await renderGoogleButton(document.createElement("div"), {})).toBe(true);

    expect(google.initialize).toHaveBeenCalledTimes(1);
    expect(google.initialize).toHaveBeenCalledWith(expect.objectContaining({ client_id: "client-id" }));
    expect(google.renderButton).toHaveBeenCalledTimes(2);
  });

  it("does nothing, and says so, without a client id", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "");
    const google = installFakeGoogle();
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await renderGoogleButton(document.createElement("div"), {})).toBe(false);
    expect(google.initialize).not.toHaveBeenCalled();
  });

  it("sends Google's credential to the backend and stores the signed-in user", async () => {
    const google = installFakeGoogle();
    googleLogin.mockResolvedValue({ user: { email: "a@b.c" } });
    await renderGoogleButton(document.createElement("div"), {});

    await google.credential("id-token");

    expect(googleLogin).toHaveBeenCalledWith({ id_token: "id-token" });
    expect(setUser).toHaveBeenCalledWith({ email: "a@b.c" });
  });

  it("does not store a user when the backend rejects the credential", async () => {
    const google = installFakeGoogle();
    googleLogin.mockRejectedValue(new Error("401"));
    await renderGoogleButton(document.createElement("div"), {});

    await google.credential("bad-token");

    expect(setUser).not.toHaveBeenCalled();
  });

  it("ignores a second credential while one is being verified", async () => {
    const google = installFakeGoogle();
    let resolve!: (value: unknown) => void;
    googleLogin.mockReturnValue(new Promise((r) => (resolve = r)));
    await renderGoogleButton(document.createElement("div"), {});

    const first = google.credential("one");
    await google.credential("two");
    resolve({ user: {} });
    await first;

    expect(googleLogin).toHaveBeenCalledTimes(1);
  });
});
