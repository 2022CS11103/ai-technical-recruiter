import type { NextConfig } from "next";

const API_PROXY_TARGET =
  process.env.API_PROXY_TARGET ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8001";

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
    // Same-origin /api/* → FastAPI (local or production API_PROXY_TARGET).
    const target = API_PROXY_TARGET.replace(/\/$/, "");
    return [
      {
        source: "/api/:path*",
        destination: `${target}/api/:path*`,
      },
      {
        source: "/health",
        destination: `${target}/health`,
      },
    ];
  },
};

export default nextConfig;
