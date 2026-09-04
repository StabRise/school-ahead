import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    // No test files here yet — this package is presentational components
    // moved as-is from apps/web, none of which had their own tests.
    passWithNoTests: true,
  },
});
