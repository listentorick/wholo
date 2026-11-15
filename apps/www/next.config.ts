import path from 'path';
import type { NextConfig } from 'next';
import { buildLinkHeader, HOMEPAGE_LINKS } from './src/lib/link-header';

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

  // RFC 8288 Link header on the homepage for agent discovery (help site,
  // sitemap, privacy policy). Evaluated at build time; the values are static.
  async headers() {
    return [
      { source: '/', headers: [{ key: 'Link', value: buildLinkHeader(HOMEPAGE_LINKS) }] },
    ];
  },

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
