import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { orderAsStorage } from '../common/order-as-context';

@Injectable()
export class ApiClientService {
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('CENTRAL_API_URL', 'http://wholo-api:3001');
  }

  private async request<T>(
    method: string,
    path: string,
    token?: string | null,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    const orderAsSession = orderAsStorage.getStore();
    if (orderAsSession) headers['X-Order-As-Session'] = orderAsSession;
    const res = await fetch(url, {
      method,
      headers,
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });

    if (res.status === 204) return undefined as T;

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      throw new HttpException(`Upstream error: ${res.status}`, HttpStatus.BAD_GATEWAY);
    }

    if (!res.ok) {
      const d = data as Record<string, unknown>;
      const message = d?.['message'] ?? `Request failed: ${res.status}`;
      throw new HttpException(
        Array.isArray(message) ? message.join(', ') : (message as string),
        res.status >= 400 && res.status < 600 ? res.status : HttpStatus.BAD_GATEWAY,
      );
    }

    return data as T;
  }

  get<T>(path: string, token?: string | null): Promise<T> {
    return this.request<T>('GET', path, token);
  }

  post<T>(path: string, token: string | null | undefined, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, token, body);
  }

  put<T>(path: string, token: string | null | undefined, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, token, body);
  }

  patch<T>(path: string, token: string | null | undefined, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, token, body);
  }
}
