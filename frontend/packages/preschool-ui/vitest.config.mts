import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    // Only the pure logic (subjects-display.ts) has tests; the presentational
    // components moved as-is from apps/web had none of their own.
    passWithNoTests: true,
  },
});
