import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@nv/core", "@nv/playwright"],
  serverExternalPackages: ["playwright"],
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
};

export default nextConfig;
