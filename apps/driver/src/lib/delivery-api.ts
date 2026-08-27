import { DeliveryLinkOrder, SubmitOutcomeRequest } from '@/types/delivery';

// Same-origin calls to driver-api's own routes — the token always travels as
// a header, never a URL param, at every hop (see the plan's "Keeping the
// token out of logs" note, PRD §7).
export class DeliveryLinkError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Delivery-Token': token,
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let detail = `Request failed: ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      // Non-JSON error body — fall back to the generic message above.
    }
    throw new DeliveryLinkError(detail, res.status);
  }

  return res.json();
}

export function getDeliveryOrder(token: string): Promise<DeliveryLinkOrder> {
  return request<DeliveryLinkOrder>('/delivery-links', token);
}

export function submitDeliveryOutcome(token: string, body: SubmitOutcomeRequest): Promise<DeliveryLinkOrder> {
  return request<DeliveryLinkOrder>('/delivery-links/outcome', token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
