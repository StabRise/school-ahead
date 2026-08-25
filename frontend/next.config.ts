import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
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
    // still resolves it statically at build time. Stub both out.
    resolveAlias: {
      fs: "./lib/stubs/empty-node-module.js",
      path: "./lib/stubs/empty-node-module.js",
    },
  },
};

export default withNextIntl(nextConfig);
