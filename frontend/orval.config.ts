import { defineConfig } from "orval";

const schemaUrl =
  process.env.OPENAPI_SCHEMA_URL ?? "http://localhost:8000/api/openapi.json";

// Two output targets from the same Django OpenAPI schema — a browser client
// (React Query hooks, cookie-authenticated) and a server client (plain
// functions, Bearer-authenticated). See docs/architecture/06-frontend-architecture.md.
export default defineConfig({
  schoolAheadBrowser: {
    input: schemaUrl,
    output: {
      mode: "tags-split",
      target: "lib/api/browser",
      client: "react-query",
      httpClient: "axios",
      override: {
        mutator: {
          path: "./lib/api/mutators/browser-mutator.ts",
          name: "browserMutator",
        },
      },
    },
  },
  schoolAheadServer: {
    input: schemaUrl,
    output: {
      mode: "tags-split",
      target: "lib/api/server",
      client: "axios",
      override: {
        mutator: {
          path: "./lib/api/mutators/server-mutator.ts",
          name: "serverMutator",
        },
      },
    },
  },
});
