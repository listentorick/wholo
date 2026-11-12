import { withXero } from '../lib/types';

// Starting data: Vine & Co connected to Demo Company (UK) and synced. Standard VAT isn't
// linked to any Xero tax rate, and the sync doesn't suggest one (the names differ).
export default withXero({ synced: true });
