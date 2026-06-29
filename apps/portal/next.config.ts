import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@wholo/api-client', '@wholo/types'],
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@wholo/api-client': path.resolve(__dirname, '../../packages/api-client/src'),
      '@wholo/types': path.resolve(__dirname, '../../packages/types/src'),
    };
    return config;
  },
};

export default nextConfig;
