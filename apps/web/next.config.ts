import type { NextConfig } from "next";

const API_PROXY_TARGET = (
  process.env.API_PROXY_TARGET ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8001"
).replace(/\/$/, "");

const isLocalApi =
  API_PROXY_TARGET.includes("127.0.0.1") || API_PROXY_TARGET.includes("localhost");

const nextConfig: NextConfig = {
  // Windows + low RAM: webpack pack cache throws "Array buffer allocation failed"
  webpack: (config, { dev }) => {
    if (dev) config.cache = false;
    return config;
  },
  async rewrites() {
    // Never proxy production traffic to localhost (causes FUNCTION_INVOCATION_FAILED on Vercel).
    if (process.env.VERCEL && isLocalApi) {
      return [];
    }
    if (!API_PROXY_TARGET || isLocalApi) {
      return [];
    }
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
