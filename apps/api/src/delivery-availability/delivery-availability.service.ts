import { Injectable } from '@nestjs/common';
import { DeliveryAvailabilityProvider } from './delivery-availability.provider';

@Injectable()
export class DeliveryAvailabilityService {
  constructor(private provider: DeliveryAvailabilityProvider) {}

  getAvailableDates(distributorId: string, traderCustomerId: string) {
    return this.provider.getAvailableDates(distributorId, traderCustomerId);
  }
}
