import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Same "@/..." alias as tsconfig, and React's automatic JSX runtime (Next
  // compiles JSX itself, so tsconfig says "preserve"), so component tests can
  // import app code as the app does.
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "jsdom",
  },
});
