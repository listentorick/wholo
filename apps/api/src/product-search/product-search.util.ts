/**
 * Pure helpers for building the curated product search document (ADR-050).
 */

export interface ProductSearchSource {
  name: string;
  sku: string | null;
  description: string | null;
}

/** Curated searchable text for a product. Extend here (producer, product type)
 *  without schema changes — searchVector is derived from this in Postgres. */
export function buildProductSearchText(product: ProductSearchSource): string {
  return [product.name, product.sku, product.description]
    .filter((part): part is string => Boolean(part && part.trim()))
    .map((part) => part.trim())
    .join(' ');
}

/** Lowercase, strip accents ("Château" → "chateau"), collapse whitespace. */
export function normalise(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Escape LIKE wildcards so user input is matched literally. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (match) => `\\${match}`);
}
