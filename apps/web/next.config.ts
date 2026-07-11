import type { NextConfig } from 'next';

if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_USE_MOCK === 'true') {
  throw new Error('Production web build requires NEXT_PUBLIC_USE_MOCK=false');
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 后端 API 在 :3000, 前端在 :3001。通过 rewrites 把 /api/* 代理过去, 避开浏览器 CORS / cookie 路径痛点
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}/api/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: '**.cloudfront.net' },
      // 头像/avatar 占位
      { protocol: 'https', hostname: 'api.dicebear.com' },
    ],
  },
  // App Router 默认开启 RSC; 不显式配置
  // typedRoutes 暂关 — Slice 2 把 /submit、/u/[username]、/settings 等页面补全后再开
  typedRoutes: false,
};

export default nextConfig;
