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
    token: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
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

  get<T>(path: string, token: string): Promise<T> {
    return this.request<T>('GET', path, token);
  }

  post<T>(path: string, token: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, token, body);
  }

  patch<T>(path: string, token: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, token, body);
  }

  put<T>(path: string, token: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, token, body);
  }

  delete<T>(path: string, token: string): Promise<T> {
    return this.request<T>('DELETE', path, token);
  }

  async postMultipart<T>(
    path: string,
    token: string,
    formData: FormData,
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
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
}
