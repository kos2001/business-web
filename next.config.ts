import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The gateway client key is read server-side only (see src/lib/hermes.ts).
  // Nothing here may be prefixed NEXT_PUBLIC_ — that would ship it to the browser.
  // Several lockfiles exist above this directory; pin the tracing root so
  // the build does not infer ~/ as the workspace.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
