import path from "path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  // Workspace root is frontend/ (two levels up) — needed so the standalone
  // output correctly traces files pulled in from sibling packages/* (see
  // packages/preschool-games, packages/preschool-ui, packages/api-client).
  outputFileTracingRoot: path.join(__dirname, "..", ".."),
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
    // @diffusionstudio/vits-web's emscripten-generated piper.js has a
    // `require("fs")`/`require("path")` guarded by a Node-only runtime
    // check that never runs in Next.js's client/edge bundles, but Turbopack
    // still resolves it statically at build time. Stub both out — scoped to
    // the `browser` condition only, so server code (e.g. Route Handlers)
    // keeps the real Node modules.
    resolveAlias: {
      fs: { browser: "./lib/stubs/empty-node-module.js" },
      path: { browser: "./lib/stubs/empty-node-module.js" },
    },
  },
};

export default withNextIntl(nextConfig);
