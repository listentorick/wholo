import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
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
