import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Linting is a separate repo-root concern (`pnpm lint`), run in CI before
  // tests. Keep it out of `next build` so image builds stay independent of it.
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ['@wholo/admin-api-client', '@wholo/types'],
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@wholo/admin-api-client': path.resolve(__dirname, '../../packages/admin-api-client/src'),
      '@wholo/types': path.resolve(__dirname, '../../packages/types/src'),
    };
    return config;
  },
};

export default nextConfig;
