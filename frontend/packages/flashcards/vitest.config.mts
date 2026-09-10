import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    // No test files here yet — this package's components/lib/stores were
    // moved as-is from apps/web, none of which had their own tests.
    passWithNoTests: true,
  },
});
