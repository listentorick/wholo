import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

// Calls the handler as Next does for /api/markdown/<segments...>.
const get = (segments?: string[]) =>
  GET(new NextRequest(`http://localhost:3040/api/markdown/${(segments ?? []).join('/')}`), {
    params: Promise.resolve({ path: segments }),
  });

function stubPage(status: number, html = '') {
  const fetchMock = vi.fn().mockResolvedValue(new Response(html, { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('GET /api/markdown', () => {
  it('returns the page as markdown with the agent headers', async () => {
    stubPage(200, '<html><head><title>Stocdup</title></head><body><main><h1>Hello</h1><p>World</p></main></body></html>');

    const res = await get();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(res.headers.get('vary')).toBe('Accept');
    const body = await res.text();
    expect(body).toBe('# Hello\n\nWorld\n');
    expect(res.headers.get('x-markdown-tokens')).toBe(String(Math.ceil(body.length / 4)));
  });

  it('renders the page from its own server as HTML', async () => {
    const fetchMock = stubPage(200, '<main><p>x</p></main>');

    await get(['privacy']);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://127.0.0.1:3040/privacy');
    expect(init.headers).toEqual({ Accept: 'text/html' });
  });

  it.each([[['api', 'health']], [['', 'evil.example.com']], [['privacy', '..', 'api']], [['privacy', 'x']]])(
    'returns 404 and fetches nothing for segments %j',
    async (segments) => {
      const fetchMock = stubPage(200);
      const res = await get(segments);
      expect(res.status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('returns 502 when the page cannot be rendered', async () => {
    stubPage(500);
    const res = await get();
    expect(res.status).toBe(502);
  });
});
