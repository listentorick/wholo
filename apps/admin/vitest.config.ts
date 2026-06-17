import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@wholo/admin-api-client': path.resolve(__dirname, '../../packages/admin-api-client/src/index.ts'),
      '@wholo/types': path.resolve(__dirname, '../../packages/types/src/index.ts'),
    },
  },
});
