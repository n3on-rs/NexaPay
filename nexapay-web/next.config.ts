import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://nexapay-node:8080/:path*',
      },
    ]
  }
};

export default nextConfig;
