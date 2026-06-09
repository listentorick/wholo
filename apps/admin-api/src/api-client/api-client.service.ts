import { Injectable } from '@nestjs/common';
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
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-distributor-id': distributorId,
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });

    if (res.status === 204) return undefined as T;

    const data = await res.json();
    if (!res.ok) {
      const message = data?.message ?? `Request failed: ${res.status}`;
      const err = new Error(Array.isArray(message) ? message.join(', ') : message) as any;
      err.status = res.status;
      throw err;
    }
    return data as T;
  }

  get<T>(path: string, distributorId: string): Promise<T> {
    return this.request<T>('GET', path, distributorId);
  }

  post<T>(path: string, distributorId: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, distributorId, body);
  }

  patch<T>(path: string, distributorId: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, distributorId, body);
  }

  put<T>(path: string, distributorId: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, distributorId, body);
  }

  delete<T>(path: string, distributorId: string): Promise<T> {
    return this.request<T>('DELETE', path, distributorId);
  }
}
