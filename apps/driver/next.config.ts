import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@wholo/types'],
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@wholo/types': path.resolve(__dirname, '../../packages/types/src'),
    };
    return config;
  },
  // Delivery links carry their token as a request header, never a URL param
  // — but Referer leakage on any outgoing link from this page is still a
  // real exposure path for the current page's own URL. See the plan's
  // "Keeping the token out of logs" note (PRD §7).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
    ];
  },
};

export default nextConfig;
