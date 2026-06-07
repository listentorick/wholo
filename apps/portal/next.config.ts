import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@wholo/api-client', '@wholo/types'],
};

export default nextConfig;
