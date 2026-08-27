import { DeliveryLinkOrder, DeliveryPhoto, SubmitOutcomeRequest } from '@/types/delivery';

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

async function assertOk(res: Response): Promise<void> {
  if (res.ok) return;
  let detail = `Request failed: ${res.status}`;
  try {
    const body = await res.json();
    detail = body.detail ?? detail;
  } catch {
    // Non-JSON error body — fall back to the generic message above.
  }
  throw new DeliveryLinkError(detail, res.status);
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
  await assertOk(res);
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

// Multipart — no Content-Type header so the browser sets the multipart boundary.
export async function uploadDeliveryPhoto(token: string, photo: Blob): Promise<DeliveryPhoto> {
  const form = new FormData();
  form.append('photo', photo, 'delivery-photo.jpg');
  const res = await fetch('/api/v1/delivery-links/photos', {
    method: 'POST',
    headers: { 'X-Delivery-Token': token },
    body: form,
  });
  await assertOk(res);
  return res.json();
}

export async function deleteDeliveryPhoto(token: string, photoId: string): Promise<void> {
  const res = await fetch(`/api/v1/delivery-links/photos/${encodeURIComponent(photoId)}`, {
    method: 'DELETE',
    headers: { 'X-Delivery-Token': token },
  });
  await assertOk(res);
}
