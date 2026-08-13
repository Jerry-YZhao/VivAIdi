import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["replicate"],
  turbopack: {},
};

export default nextConfig;
