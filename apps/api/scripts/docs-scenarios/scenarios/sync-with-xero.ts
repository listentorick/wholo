import { withXero } from '../lib/types';

// Starting data: the base, connected to Demo Company (UK) holding the shared Xero data
// (xero-fixtures.ts), and nothing synced yet: Integrations shows "No Xero data has been synced
// yet" and the scheduler is held off until tomorrow, so the reader's Sync with Xero is the first.
export default withXero({ synced: false });
