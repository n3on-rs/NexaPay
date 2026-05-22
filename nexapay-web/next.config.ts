import type { NextConfig } from "next";

const apiProxyUrl = process.env.API_PROXY_URL || 'http://localhost:8088';

const nextConfig: NextConfig = {
  output: 'standalone',
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
