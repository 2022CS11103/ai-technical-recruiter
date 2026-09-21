import type { NextConfig } from "next";

const API_PROXY_TARGET = process.env.API_PROXY_TARGET || "http://127.0.0.1:8001";

const nextConfig: NextConfig = {
  // LLM turns can take >30s; default proxy abort was dropping /answer before TTS/reply.
  experimental: {
    proxyTimeout: 120_000,
  },
  // Windows + low RAM: webpack pack cache throws "Array buffer allocation failed"
  webpack: (config, { dev }) => {
    if (dev) config.cache = false;
    return config;
  },
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
