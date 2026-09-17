import type { NextConfig } from "next";

const API_PROXY_TARGET = process.env.API_PROXY_TARGET || "http://127.0.0.1:8001";

const nextConfig: NextConfig = {
  async rewrites() {
    // Same-origin /api/* → FastAPI. Fixes Cursor/browser "Failed to fetch" to :8001.
    return [
      {
        source: "/api/:path*",
        destination: `${API_PROXY_TARGET}/api/:path*`,
      },
      {
        source: "/health",
        destination: `${API_PROXY_TARGET}/health`,
      },
    ];
  },
};

export default nextConfig;
