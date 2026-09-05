import { describe, expect, it } from "vitest";
import { resolveModelFormat } from "./model-loader";

describe("resolveModelFormat", () => {
  it("resolves .stl urls to stl", () => {
    expect(resolveModelFormat("https://example.com/furniture_models/abc.stl")).toBe("stl");
  });

  it("resolves .obj urls to obj", () => {
    expect(resolveModelFormat("https://example.com/furniture_models/abc.obj")).toBe("obj");
  });

  it("is case-insensitive", () => {
    expect(resolveModelFormat("https://example.com/Koltuk.STL")).toBe("stl");
    expect(resolveModelFormat("https://example.com/Koltuk.OBJ")).toBe("obj");
  });

  it("defaults to obj for an unrecognized extension", () => {
    expect(resolveModelFormat("https://example.com/mystery.glb")).toBe("obj");
  });
});
