import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // A second local server (e.g. for screenshots while `npm run dev` runs) needs its own folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
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
