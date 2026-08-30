import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone server output — this app deploys as its own container
  // (no NestJS BFF wrapper, unlike portal/admin/driver).
  output: 'standalone',
  // Trace files from the monorepo root so the standalone bundle is complete.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
