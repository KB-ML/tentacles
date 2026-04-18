import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    swcPlugins: [["@effector/swc-plugin", { factories: ["@kbml-tentacles/core"] }]],
  },
};

export default nextConfig;
