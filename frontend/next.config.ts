import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1"],
  // jsdom (used by app/api/read-along/extract/route.ts to parse fetched
  // HTML) pulls in css-tree, which loads a data file via a runtime-relative
  // require() — Turbopack's production bundler tries to statically resolve
  // that and fails ("Cannot find module '../data/patch.json'") even though
  // jsdom is already in Next's default server-external-packages list; this
  // opts it (and its dependency tree) out of bundling entirely so it's
  // loaded via plain Node `require` from node_modules at runtime instead.
  serverExternalPackages: ["jsdom"],
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
