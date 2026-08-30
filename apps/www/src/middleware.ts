import { NextResponse, type NextRequest } from 'next/server';

// Comma list, e.g. "default,growth,operations". Fewer than 2 = experiment off.
const VARIANTS = (process.env.EXPERIMENT_HERO_VARIANTS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const COOKIE = 'hero_variant';

export function middleware(req: NextRequest) {
  if (VARIANTS.length < 2) return NextResponse.next();

  const current = req.cookies.get(COOKIE)?.value;
  if (current && VARIANTS.includes(current)) return NextResponse.next();

  const pick = VARIANTS[Math.floor(Math.random() * VARIANTS.length)]!;
  const res = NextResponse.next();
  res.cookies.set(COOKIE, pick, {
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
    sameSite: 'lax',
  });
  return res;
}

export const config = { matcher: ['/'] };
