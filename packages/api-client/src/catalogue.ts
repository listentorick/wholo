import type { CatalogueProductsParams, CatalogueProductsResponse } from '@wholo/types';
import { apiFetch } from './base';

export const catalogueApi = {
  getProducts(
    distributorSlug: string,
    params?: CatalogueProductsParams,
  ): Promise<CatalogueProductsResponse> {
    const query = new URLSearchParams();
    if (params?.limit != null) query.set('limit', String(params.limit));
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.productTypeCode) query.set('productTypeCode', params.productTypeCode);
    const qs = query.toString();
    return apiFetch<CatalogueProductsResponse>(
      `/api/v1/catalogue/${distributorSlug}/products${qs ? `?${qs}` : ''}`,
    );
  },
};
