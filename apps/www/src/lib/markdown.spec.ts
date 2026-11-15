import { describe, expect, it } from 'vitest';
import { estimateTokens, htmlToMarkdown } from './markdown';

const page = (main: string, title = 'Stocdup &amp; friends') => `<!doctype html><html><head>
<title>${title}</title><style>.x{}</style><script>var a=1</script></head>
<body><header><nav><a href="/">Home</a></nav></header>
<main id="main">${main}</main>
<footer>© Stocdup</footer><script>more()</script></body></html>`;

describe('htmlToMarkdown', () => {
  it('converts the main content to markdown and leaves out the nav and footer', () => {
    const md = htmlToMarkdown(
      page('<h1>Wholesale, sorted</h1><p>Take <strong>orders</strong> <a href="/privacy">here</a>.</p><ul><li>One</li><li>Two</li></ul>'),
    );
    expect(md).toBe('# Wholesale, sorted\n\nTake **orders** [here](/privacy).\n\n-   One\n-   Two\n');
  });

  it('drops scripts, styles, svg and forms', () => {
    const md = htmlToMarkdown(
      page('<h1>Hi</h1><svg><text>icon</text></svg><form><label>Email</label><input><button>Send</button></form><script>x()</script><p>End</p>'),
    );
    expect(md).toBe('# Hi\n\nEnd\n');
  });

  it('adds the page title as a heading when the content has no h1', () => {
    expect(htmlToMarkdown(page('<p>Body</p>'))).toBe('# Stocdup & friends\n\nBody\n');
  });

  it('does not add the title when an h1 follows other content', () => {
    expect(htmlToMarkdown(page('<p>Eyebrow</p><h1>Headline</h1>'))).toBe('Eyebrow\n\n# Headline\n');
  });

  it('falls back to the body when there is no main element', () => {
    expect(htmlToMarkdown('<html><body><h1>Only body</h1></body></html>')).toBe('# Only body\n');
  });
});

describe('estimateTokens', () => {
  it('counts about one token per four characters, rounded up', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});
