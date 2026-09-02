import path from 'path';
import type { NextConfig } from 'next';

// In-cluster Plausible service; the browser never talks to it directly.
const PLAUSIBLE_INTERNAL_URL =
  process.env.PLAUSIBLE_INTERNAL_URL || 'http://wholo-plausible:8000';

const nextConfig: NextConfig = {
  // Linting is a separate repo-root concern (`pnpm lint`), run in CI before
  // tests. Keep it out of `next build` so image builds stay independent of it.
  eslint: { ignoreDuringBuilds: true },
  // Standalone server output — this app deploys as its own container
  // (no NestJS BFF wrapper, unlike portal/admin/driver).
  output: 'standalone',
  // Trace files from the monorepo root so the standalone bundle is complete.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  reactStrictMode: true,
  poweredByHeader: false,
  // Keep nodemailer out of the bundle — it's a runtime Node dependency.
  serverExternalPackages: ['nodemailer'],

  // Proxy the Plausible tracking script + event endpoint through this origin:
  // first-party (adblock-resistant), and Plausible stays cluster-internal.
  async rewrites() {
    return [
      { source: '/js/script.js', destination: `${PLAUSIBLE_INTERNAL_URL}/js/script.js` },
      { source: '/api/event', destination: `${PLAUSIBLE_INTERNAL_URL}/api/event` },
    ];
  },
};

export default nextConfig;
