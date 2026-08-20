import { defineConfig } from "orval";

const schemaUrl =
  process.env.OPENAPI_SCHEMA_URL ?? "http://localhost:8000/api/openapi.json";

// Three output targets from the same Django OpenAPI schema — a browser
// client (React Query hooks, cookie-authenticated), a server client (plain
// functions, Bearer-authenticated), and standalone Zod schemas (request/
// response validation, react-hook-form's zodResolver, ...). See
// docs/architecture/06-frontend-architecture.md.
export default defineConfig({
  schoolAheadZod: {
    input: schemaUrl,
    output: {
      mode: "tags-split",
      target: "lib/api/zod",
      client: "zod",
    },
  },
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
