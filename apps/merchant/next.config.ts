import type { NextConfig } from 'next';

if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_USE_MOCK === 'true') {
  throw new Error('Production merchant build requires NEXT_PUBLIC_USE_MOCK=false');
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}/api/:path*`,
      },
    ];
  },
  typedRoutes: false,
};

export default nextConfig;
