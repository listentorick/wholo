// Markdown for agents: a request whose Accept header prefers text/markdown gets
// the page's <main> content converted to Markdown; browsers keep getting HTML.
// The middleware does the negotiation and `/api/markdown` does the conversion.

/** Pages that have a Markdown version. Also the allow-list for `/api/markdown`. */
export const MARKDOWN_PATHS: readonly string[] = ['/', '/privacy'];

export const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8';

/** q-value of `type` in an Accept header (0 when absent), honouring `type/*` and `*\/*`. */
function qualityOf(accept: string, type: string): number {
  const [major] = type.split('/');
  let best = 0;
  let bestSpecificity = -1;
  for (const part of accept.split(',')) {
    const [rawRange, ...params] = part.split(';').map((s) => s.trim());
    const range = rawRange?.toLowerCase();
    if (!range) continue;
    const specificity =
      range === type ? 2 : range === `${major}/*` ? 1 : range === '*/*' ? 0 : -1;
    if (specificity < 0 || specificity < bestSpecificity) continue;
    const qParam = params.find((p) => p.toLowerCase().startsWith('q='));
    const q = qParam ? Number(qParam.slice(2)) : 1;
    bestSpecificity = specificity;
    best = Number.isFinite(q) ? q : 0;
  }
  return best;
}

/**
 * True when the client explicitly lists text/markdown and rates it at least as
 * highly as text/html. A wildcard alone never selects Markdown, so browsers
 * (which never list text/markdown) always get HTML.
 */
export function prefersMarkdown(accept: string | null | undefined): boolean {
  if (!accept || !/text\/markdown/i.test(accept)) return false;
  const markdown = qualityOf(accept, 'text/markdown');
  return markdown > 0 && markdown >= qualityOf(accept, 'text/html');
}
