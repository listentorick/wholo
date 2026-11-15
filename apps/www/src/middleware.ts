import { NextResponse, type NextRequest } from 'next/server';
import { MARKDOWN_PATHS, prefersMarkdown } from '@/lib/markdown-negotiation';

// Comma list, e.g. "default,growth,operations". Fewer than 2 = experiment off.
const VARIANTS = (process.env.EXPERIMENT_HERO_VARIANTS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const COOKIE = 'hero_variant';

export function middleware(req: NextRequest) {
  // Markdown for agents: Accept: text/markdown gets the page as Markdown.
  const { pathname } = req.nextUrl;
  if (MARKDOWN_PATHS.includes(pathname) && prefersMarkdown(req.headers.get('accept'))) {
    // `/` → /api/markdown, `/privacy` → /api/markdown/privacy
    return NextResponse.rewrite(new URL(`/api/markdown${pathname === '/' ? '' : pathname}`, req.url));
  }

  const res = NextResponse.next();

  // Hero A/B cookie: homepage only.
  if (pathname !== '/' || VARIANTS.length < 2) return res;

  const current = req.cookies.get(COOKIE)?.value;
  if (current && VARIANTS.includes(current)) return res;

  const pick = VARIANTS[Math.floor(Math.random() * VARIANTS.length)]!;
  res.cookies.set(COOKIE, pick, {
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
    sameSite: 'lax',
  });
  return res;
}

// Must list every path in MARKDOWN_PATHS (src/lib/markdown-negotiation.ts);
// the matcher has to be a static literal.
export const config = { matcher: ['/', '/privacy'] };
