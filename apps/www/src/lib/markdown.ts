import TurndownService from 'turndown';

// HTML → Markdown conversion for `/api/markdown`. Negotiation (which requests
// get Markdown) lives in markdown-negotiation.ts, which has no dependencies so
// the edge middleware and next.config can import it.

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});
// Not content: scripts, styling, decorative SVG and the interactive register form.
turndown.remove(['script', 'style', 'noscript', 'form', 'button', 'iframe']);
// svg is not in turndown's HTML tag-name type, so match it by node name.
turndown.remove((node) => node.nodeName.toLowerCase() === 'svg');

/**
 * Converts a page's <main> element (or its <body> if it has none) to Markdown,
 * adding the <title> as a heading when the content has no h1.
 */
export function htmlToMarkdown(html: string): string {
  const main = /<main\b[^>]*>([\s\S]*)<\/main>/i.exec(html)?.[1];
  const body = main ?? /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  const rawTitle = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim();
  const title = rawTitle ? turndown.turndown(rawTitle) : undefined; // decodes entities
  const markdown = turndown.turndown(body).replace(/\n{3,}/g, '\n\n').trim();
  return title && !/^# /m.test(markdown) ? `# ${title}\n\n${markdown}\n` : `${markdown}\n`;
}

/** Rough token count for the `x-markdown-tokens` header (about 4 characters per token). */
export function estimateTokens(markdown: string): number {
  return Math.ceil(markdown.length / 4);
}
