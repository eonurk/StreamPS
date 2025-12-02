import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Enable standalone output for containerized deploys that need the Node server
  output: 'standalone',
  // Ensure trace output is rooted at the project to avoid deep nested paths in standalone
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
