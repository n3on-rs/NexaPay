import type { NextConfig } from "next";

const apiProxyUrl = process.env.API_PROXY_URL || 'http://localhost:8080';

const nextConfig: NextConfig = {
  output: 'standalone',
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiProxyUrl}/:path*`,
      },
    ]
  }
};

export default nextConfig;
