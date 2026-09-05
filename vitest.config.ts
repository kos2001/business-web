import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // confluence.ts reads its site from the environment at import time — the
    // same shape as hermes.ts, so that no client component can pull it in. The
    // host check is the security boundary worth testing, and it needs a
    // configured host to check against.
    env: { CONFLUENCE_BASE_URL: "https://acme.atlassian.net/wiki" },
  },
});
