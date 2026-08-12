import { readFileSync } from 'fs';
import { join } from 'path';
// `mjml`'s type declaration is `export =`; using a plain default import here
// is interop-config-sensitive (breaks under a tsconfig without
// esModuleInterop, e.g. ts-jest's) — this form works regardless.
import mjml2html = require('mjml');

// .mjml source is static per deploy — read once and reuse the compiled MJML
// document string across every send instead of hitting disk per email.
const templateCache = new Map<string, string>();

function loadTemplateSource(name: string): string {
  let source = templateCache.get(name);
  if (!source) {
    source = readFileSync(join(__dirname, 'templates', `${name}.mjml`), 'utf8');
    templateCache.set(name, source);
  }
  return source;
}

// Partials (templates/partials/_name.mjml) hold chrome shared across every
// email — the Stocdup header lockup, the closing card/footer — so each
// per-email template only authors its own hero/status content. Cached the
// same way as a top-level template source.
const partialCache = new Map<string, string>();

function loadPartial(name: string): string {
  let source = partialCache.get(name);
  if (!source) {
    const raw = readFileSync(join(__dirname, 'templates', 'partials', `_${name}.mjml`), 'utf8');
    // Strip <!-- --> comments before splicing. A top-level template comment
    // (outside mj-head/mj-body, e.g. every template's own direction-contract
    // block) is dropped by MJML's own parser — verified empirically — but a
    // partial always splices INSIDE mj-body/mj-column, where MJML preserves
    // comments verbatim in the compiled output. Undetected, this means a
    // partial's own doc comment ships as literal bytes in every real email
    // sent (caught via a real render + a naive `<img>`-count assertion
    // matching comment prose, not a real <img> tag — not from reading the
    // markup).
    source = raw.replace(/<!--[\s\S]*?-->/g, '');
    partialCache.set(name, source);
  }
  return source;
}

// Minimal substitution: {{> partial}} splices, {{var}}, and
// {{#if var}}...{{/if}} conditional blocks (an empty/undefined value omits
// the block, not just the value — used for graceful degradation when e.g. a
// distributor has no logo). Partials are spliced in first, as raw source, so
// they can themselves contain {{var}}/{{#if}} markers resolved by the same
// pass below — one pass over the fully-assembled string, no recursive
// partial-in-partial support (not needed by anything here). Callers must
// pass already-escaped values; this does no HTML-escaping of its own.
// GOTCHA: this runs over the raw .mjml source, including <!-- --> comments
// (mjml itself hasn't parsed the source yet, so nothing has stripped them) —
// never write this marker's literal two-brace syntax inside a template's own
// direction-contract comment when describing this mechanism in prose, or
// the regex below will try to load a partial by whatever word follows it.
function renderTemplateSource(source: string, vars: Record<string, string>): string {
  // Partial names may contain hyphens (identity-row) — \w alone doesn't
  // match "-", so this must be [\w-]+, not \w+. A prior version used \w+:
  // it silently matched nothing for any hyphenated name, leaving the
  // literal {{> name}} marker in the assembled string; MJML's parser then
  // dropped that unrecognized bare text as an invalid child of mj-column,
  // with no error — the whole row vanished with nothing in the logs to
  // point at why. Caught via a real render, not template review.
  const assembled = source.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_match, name: string) => loadPartial(name));
  let rendered = assembled.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_match, key: string, body: string) =>
    vars[key] ? body : '',
  );
  rendered = rendered.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? '');
  return rendered;
}

export async function compileMjmlTemplate(name: string, vars: Record<string, string>): Promise<string> {
  const mjmlSource = renderTemplateSource(loadTemplateSource(name), vars);
  const { html, errors } = await mjml2html(mjmlSource);
  if (errors.length > 0) {
    throw new Error(`MJML compile errors for template "${name}": ${JSON.stringify(errors)}`);
  }
  return html;
}
