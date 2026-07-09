// Normalises a SKU/item code for comparison: lowercase, with whitespace,
// dashes and underscores stripped. Deliberately does NOT collapse other
// character differences — CAB-SAUV-001 vs CAB-SAV-001 are different codes and
// must stay different after normalisation.
export function normalizeSku(value: string): string {
  return value.toLowerCase().replace(/[\s\-_]+/g, '');
}
