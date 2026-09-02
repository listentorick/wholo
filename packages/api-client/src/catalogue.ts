import type { CatalogueProductDetail, CatalogueProductsParams, CatalogueProductsResponse, DistributorInfo } from '@wholo/types';
import { apiFetch } from './base';

export const catalogueApi = {
  getDistributor(distributorSlug: string): Promise<DistributorInfo> {
    // Public endpoint — the distributor "about" page renders before the customer
    // has signed in, so this must not pull on the auth token provider.
    return apiFetch<DistributorInfo>(`/api/v1/distributors/${distributorSlug}`, { anonymous: true });
  },

  getProducts(
    distributorSlug: string,
    params?: CatalogueProductsParams,
  ): Promise<CatalogueProductsResponse> {
    const query = new URLSearchParams();
    if (params?.limit != null) query.set('limit', String(params.limit));
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.productTypeCode) query.set('productTypeCode', params.productTypeCode);
    if (params?.search?.trim()) query.set('search', params.search.trim());
    const qs = query.toString();
    return apiFetch<CatalogueProductsResponse>(
      `/api/v1/distributors/${distributorSlug}/products${qs ? `?${qs}` : ''}`,
    );
  },

  getProduct(distributorSlug: string, productId: string): Promise<CatalogueProductDetail> {
    return apiFetch<CatalogueProductDetail>(
      `/api/v1/distributors/${distributorSlug}/products/${productId}`,
    );
  },
};
