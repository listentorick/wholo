import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Customer, CustomerSelfView, MyDeliveryAddressResponse } from '@wholo/types';
import { ApiClientService } from '../api-client/api-client.service';

// apps/api now returns the full Customer record to any authorized caller
// (staff or the customer themselves) — this BFF is what keeps the
// distributor's working data (notes, credit, pricing/catalogue wiring,
// invitations) from ever reaching the portal frontend.
function toSelfView(customer: Customer): CustomerSelfView {
  const {
    notes: _notes,
    creditLimit: _creditLimit,
    priceListId: _priceListId,
    priceList: _priceList,
    deliveryProfileId: _deliveryProfileId,
    deliveryProfile: _deliveryProfile,
    catalogues: _catalogues,
    invitations: _invitations,
    ...selfView
  } = customer;
  return selfView;
}

@Injectable()
export class PortalService {
  constructor(private api: ApiClientService) {}

  getMyDistributors(organisationId: string, token: string) {
    return this.api.get(`/organisations/${organisationId}/distributors`, token);
  }

  getRecommendedDistributors(organisationId: string, token: string) {
    return this.api.get(`/organisations/${organisationId}/recommended-distributors`, token);
  }

  getMyProfile(organisationId: string, token: string) {
    return this.api.get(`/organisations/${organisationId}`, token);
  }

  updateMyProfile(organisationId: string, token: string, body: unknown) {
    return this.api.patch(`/organisations/${organisationId}`, token, body);
  }

  async getMyDeliveryAddress(
    token: string,
    distributorSlug: string,
    customerId: string,
  ): Promise<MyDeliveryAddressResponse> {
    const distributor = await this.api.get<{ id: string }>(`/distributors/${distributorSlug}`, token);
    const customer = await this.api.get<Customer>(
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

  async getDistributorRelationship(
    token: string,
    distributorSlug: string,
    customerId: string,
  ): Promise<CustomerSelfView | null> {
    const distributor = await this.api.get<{ id: string }>(`/distributors/${distributorSlug}`, token);
    try {
      const customer = await this.api.get<Customer>(
        `/distributors/${distributor.id}/customers/${customerId}`,
        token,
      );
      return toSelfView(customer);
    } catch (e) {
      if (e instanceof HttpException && e.getStatus() === HttpStatus.NOT_FOUND) return null;
      throw e;
    }
  }

  async requestDistributorAccess(
    token: string,
    distributorSlug: string,
    customerId: string,
    recentContact: boolean,
  ): Promise<CustomerSelfView> {
    const distributor = await this.api.get<{ id: string }>(`/distributors/${distributorSlug}`, token);
    const customer = await this.api.post<Customer>(
      `/distributors/${distributor.id}/customers/${customerId}`,
      token,
      { recentContact },
    );
    return toSelfView(customer);
  }
}
