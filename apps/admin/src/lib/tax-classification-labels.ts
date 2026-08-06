import { TaxClassification } from '@wholo/types';

// Zero-rated, exempt and outside-scope all charge £0 tax but must stay
// distinguishable wherever a tax classification is shown (order lines,
// the Tax Types list) — one label map so they read the same everywhere.
export const CLASSIFICATION_LABELS: Record<TaxClassification, string> = {
  [TaxClassification.STANDARD]: 'Standard',
  [TaxClassification.REDUCED]: 'Reduced rate',
  [TaxClassification.ZERO_RATED]: 'Zero-rated',
  [TaxClassification.EXEMPT]: 'Exempt',
  [TaxClassification.OUTSIDE_SCOPE]: 'Outside the scope of tax',
};
