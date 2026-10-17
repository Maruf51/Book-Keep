import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // @react-pdf/renderer ships native-ish ESM/CJS internals (yoga-layout,
  // fontkit) that bundle poorly; keep it external so it is loaded by Node at
  // runtime in the invoice PDF route (P6-T2/T3).
  serverExternalPackages: ["@react-pdf/renderer", "stripe"],
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
