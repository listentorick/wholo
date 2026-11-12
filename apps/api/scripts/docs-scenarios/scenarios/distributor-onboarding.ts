import { fromNothing } from '../lib/types';

// Starting data: nothing. No base: the docs owner (James) signs in with no user record and
// no business, so the app opens the onboarding wizard. The business he creates uses the
// store URL harbour-wines (DOCS_ONBOARDING_SLUGS), which the clear-down removes.
export default fromNothing();
