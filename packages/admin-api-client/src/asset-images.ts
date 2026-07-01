import type { AssetImage, ReorderAssetImagesRequest } from '@wholo/types';
import { apiFetch, ApiError } from './base';

async function apiFetchMultipart<T>(path: string, formData: FormData, token: string): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    let problem;
    try { problem = await res.json(); } catch { problem = { type: 'about:blank', title: res.statusText, status: res.status, detail: res.statusText }; }
    throw new ApiError(problem, res.status);
  }
  return res.json() as Promise<T>;
}

export const adminAssetImagesApi = {
  upload(token: string, assetType: string, entityId: string, file: File): Promise<AssetImage> {
    const form = new FormData();
    form.append('file', file);
    form.append('assetType', assetType);
    form.append('entityId', entityId);
    return apiFetchMultipart<AssetImage>('/api/v1/asset-images', form, token);
  },

  list(token: string, assetType: string, entityId: string): Promise<AssetImage[]> {
    const qs = new URLSearchParams({ assetType, entityId }).toString();
    return apiFetch<AssetImage[]>(`/api/v1/asset-images?${qs}`, { token });
  },

  delete(token: string, imageId: string): Promise<void> {
    return apiFetch<void>(`/api/v1/asset-images/${imageId}`, { method: 'DELETE', token });
  },

  reorder(token: string, req: ReorderAssetImagesRequest): Promise<AssetImage[]> {
    return apiFetch<AssetImage[]>('/api/v1/asset-images/reorder', {
      method: 'PUT',
      body: JSON.stringify(req),
      token,
    });
  },
};
