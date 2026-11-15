import { NextResponse, type NextRequest } from 'next/server';
import { estimateTokens, htmlToMarkdown } from '@/lib/markdown';
import { MARKDOWN_CONTENT_TYPE, MARKDOWN_PATHS } from '@/lib/markdown-negotiation';

// Serves the Markdown version of a page. The middleware rewrites requests that
// prefer text/markdown here, with the page path appended: `/` → /api/markdown,
// `/privacy` → /api/markdown/privacy. (A path segment, not a query parameter:
// query parameters added by a middleware rewrite don't reach the handler.)
// Only paths in MARKDOWN_PATHS are fetched, so this can't be pointed elsewhere.
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ path?: string[] }> };

function selfOrigin(): string {
  return `http://127.0.0.1:${process.env.PORT ?? '3040'}`;
}

const markdownHeaders = { 'Content-Type': MARKDOWN_CONTENT_TYPE, Vary: 'Accept' };

export async function GET(_req: NextRequest, { params }: Params) {
  const path = `/${((await params).path ?? []).join('/')}`;
  if (!MARKDOWN_PATHS.includes(path)) {
    return new NextResponse('Not found\n', { status: 404, headers: markdownHeaders });
  }

  // Render the real page (asking for HTML so the middleware doesn't loop back here).
  const page = await fetch(`${selfOrigin()}${path}`, {
    headers: { Accept: 'text/html' },
    cache: 'no-store',
  });
  if (!page.ok) {
    return new NextResponse('Page unavailable\n', { status: 502, headers: markdownHeaders });
  }

  const markdown = htmlToMarkdown(await page.text());
  return new NextResponse(markdown, {
    status: 200,
    headers: {
      ...markdownHeaders,
      'x-markdown-tokens': String(estimateTokens(markdown)),
      'Cache-Control': 'public, max-age=300',
    },
  });
}
