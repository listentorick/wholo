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

// Minimal substitution: {{var}} and {{#if var}}...{{/if}} conditional blocks
// (an empty/undefined value omits the block, not just the value — used for
// graceful degradation when e.g. a distributor has no logo). Callers must
// pass already-escaped values; this does no HTML-escaping of its own.
function renderTemplateSource(source: string, vars: Record<string, string>): string {
  let rendered = source.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_match, key: string, body: string) =>
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
