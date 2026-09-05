import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    // .tsx as well: the answer renderer is worth a test, and the bug it exists
    // to prevent (GFM tables silently not parsing) is only visible in output.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // confluence.ts reads its site from the environment at import time — the
    // same shape as hermes.ts, so that no client component can pull it in. The
    // host check is the security boundary worth testing, and it needs a
    // configured host to check against.
    env: { CONFLUENCE_BASE_URL: "https://acme.atlassian.net/wiki" },
  },
});
