import { DeliveryAvailabilityResponse } from '@wholo/types';

export abstract class DeliveryAvailabilityProvider {
  abstract getAvailableDates(
    distributorId: string,
    traderCustomerId: string,
  ): Promise<DeliveryAvailabilityResponse>;
}
