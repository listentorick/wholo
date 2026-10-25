/** "OPS · Vine & Co · Price lists" inside a wholesaler; "Stocdup Ops · Wholesalers" on the Ops pages. */
export function opsTitle(wholesaler: string | null, page?: string): string {
  if (wholesaler) return ['OPS', wholesaler, page].filter(Boolean).join(' · ');
  return ['Stocdup Ops', page].filter(Boolean).join(' · ');
}
