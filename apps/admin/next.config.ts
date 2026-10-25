import path from 'path';
import type { NextConfig } from 'next';

// The Ops build (ADR-078) is this app built with NEXT_PUBLIC_APP_MODE=ops. Its
// own routes are `*.ops.tsx` files, which are routes only when their extension
// is listed here — so in the admin build they do not exist at all.
const isOpsBuild = process.env.NEXT_PUBLIC_APP_MODE === 'ops';

const nextConfig: NextConfig = {
  pageExtensions: isOpsBuild ? ['tsx', 'ts', 'ops.tsx', 'ops.ts'] : ['tsx', 'ts'],
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
