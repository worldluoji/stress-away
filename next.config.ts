import type { NextConfig } from "next";

// const assetPrefix = process.env.NEXT_PUBLIC_ASSET_PREFIX || '';

const nextConfig: NextConfig = {
  // basePath: '/untipua',
  // assetPrefix: '/untipua',
  output: 'standalone',
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "connect-src 'self' https://*.tencentcloudapi.com https://*.tencentcloudsa.com https://*.cloud.tencent.com https://api.minimaxi.chat https://api.minimax.io https://api.tiamat.cn",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;