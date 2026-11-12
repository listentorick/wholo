import { addCatalogue, addDeliveryProfile } from '../lib/builders';
import { ScenarioSeed } from '../lib/types';

// Starting data: the delivery profile and catalogue the new customer is given. No
// customers; the price list (Standard Pricing) comes with the base. The catalogue is
// empty: the task only chooses it.
const seed: ScenarioSeed = async ({ prisma }) => {
  await addDeliveryProfile(prisma, { id: 'docs-dp-weekday', name: 'Standard Weekday', weekdays: [1, 2, 3, 4, 5] });
  await addCatalogue(prisma, { id: 'docs-cat-full-range', name: 'Full Range', productIds: [] });
};

export default seed;
