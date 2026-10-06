import type {
  PaymentTerm,
  PaymentTermListResponse,
  PaymentTermPreview,
  PaymentTermRule,
  CreatePaymentTermRequest,
  UpdatePaymentTermRequest,
} from '@wholo/types';
import { apiFetch } from './base';

export const adminPaymentTermsApi = {
  list(): Promise<PaymentTermListResponse> {
    return apiFetch<PaymentTermListResponse>('/api/v1/payment-terms');
  },

  get(id: string): Promise<PaymentTerm> {
    return apiFetch<PaymentTerm>(`/api/v1/payment-terms/${id}`);
  },

  create(req: CreatePaymentTermRequest): Promise<PaymentTerm> {
    return apiFetch<PaymentTerm>('/api/v1/payment-terms', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  preview(rule: PaymentTermRule): Promise<PaymentTermPreview> {
    return apiFetch<PaymentTermPreview>('/api/v1/payment-terms/preview', {
      method: 'POST',
      body: JSON.stringify(rule),
    });
  },

  update(id: string, req: UpdatePaymentTermRequest): Promise<PaymentTerm> {
    return apiFetch<PaymentTerm>(`/api/v1/payment-terms/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
  },

  makeDefault(id: string): Promise<PaymentTerm> {
    return apiFetch<PaymentTerm>(`/api/v1/payment-terms/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isDefault: true }),
    });
  },

  deactivate(id: string): Promise<PaymentTerm> {
    return apiFetch<PaymentTerm>(`/api/v1/payment-terms/${id}`, { method: 'DELETE' });
  },
};
