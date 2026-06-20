import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiClientService {
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('CENTRAL_API_URL', 'http://wholo-api:3001');
  }

  private async request<T>(
    method: string,
    path: string,
    distributorId: string,
    body?: unknown,
    userId?: string,
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-distributor-id': distributorId,
        ...(userId && { 'x-user-id': userId }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });

    if (res.status === 204) return undefined as T;

    const data = await res.json();
    if (!res.ok) {
      const raw = data?.detail ?? data?.message ?? `Request failed: ${res.status}`;
      throw new HttpException(Array.isArray(raw) ? raw.join(', ') : raw, res.status);
    }
    return data as T;
  }

  get<T>(path: string, distributorId: string, userId?: string): Promise<T> {
    return this.request<T>('GET', path, distributorId, undefined, userId);
  }

  post<T>(path: string, distributorId: string, body?: unknown, userId?: string): Promise<T> {
    return this.request<T>('POST', path, distributorId, body, userId);
  }

  patch<T>(path: string, distributorId: string, body?: unknown, userId?: string): Promise<T> {
    return this.request<T>('PATCH', path, distributorId, body, userId);
  }

  put<T>(path: string, distributorId: string, body?: unknown, userId?: string): Promise<T> {
    return this.request<T>('PUT', path, distributorId, body, userId);
  }

  delete<T>(path: string, distributorId: string, userId?: string): Promise<T> {
    return this.request<T>('DELETE', path, distributorId, undefined, userId);
  }

  async postMultipart<T>(
    path: string,
    distributorId: string,
    formData: FormData,
    userId?: string,
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-distributor-id': distributorId,
        ...(userId && { 'x-user-id': userId }),
      },
      body: formData,
    });

    if (res.status === 204) return undefined as T;

    const data = await res.json();
    if (!res.ok) {
      const raw = data?.detail ?? data?.message ?? `Request failed: ${res.status}`;
      throw new HttpException(Array.isArray(raw) ? raw.join(', ') : raw, res.status);
    }
    return data as T;
  }

  async postAnonymous<T>(path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    if (res.status === 204) return undefined as T;
    const data = await res.json();
    if (!res.ok) {
      const raw = data?.detail ?? data?.message ?? `Request failed: ${res.status}`;
      throw new HttpException(Array.isArray(raw) ? raw.join(', ') : raw, res.status);
    }
    return data as T;
  }

  async getAsBearer<T>(path: string, bearerToken: string): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearerToken}`,
      },
    });
    if (res.status === 204) return undefined as T;
    const data = await res.json();
    if (!res.ok) {
      const raw = data?.detail ?? data?.message ?? `Request failed: ${res.status}`;
      throw new HttpException(Array.isArray(raw) ? raw.join(', ') : raw, res.status);
    }
    return data as T;
  }
}
