import { Injectable } from '@nestjs/common';
import type { CustomerSelfView, MyDeliveryAddressResponse } from '@wholo/types';
import { ApiClientService } from '../api-client/api-client.service';

@Injectable()
export class PortalService {
  constructor(private api: ApiClientService) {}

  getMyDistributors(token: string) {
    return this.api.get('/portal/me/distributors', token);
  }

  getMyProfile(token: string) {
    return this.api.get('/portal/me/profile', token);
  }

  updateMyProfile(token: string, body: unknown) {
    return this.api.patch('/portal/me/profile', token, body);
  }

  async getMyDeliveryAddress(
    token: string,
    distributorSlug: string,
    customerId: string,
  ): Promise<MyDeliveryAddressResponse> {
    const distributor = await this.api.get<{ id: string }>(`/distributors/${distributorSlug}`, token);
    const customer = await this.api.get<CustomerSelfView>(
      `/distributors/${distributor.id}/customers/${customerId}`,
      token,
    );

    const address = {
      line1: customer.deliveryLine1,
      line2: customer.deliveryLine2,
      city: customer.deliveryCity,
      state: customer.deliveryState,
      postcode: customer.deliveryPostcode,
      country: customer.deliveryCountry,
    };
    const hasAddress = Object.values(address).some(Boolean);
    return { deliveryAddress: hasAddress ? address : null };
  }
}
