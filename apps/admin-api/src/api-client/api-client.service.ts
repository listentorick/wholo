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
    return this.parseResponse<T>(res);
  }

  // Text-then-parse rather than res.json(): a void upstream action (e.g. the
  // accounting confirm/ignore/unlink endpoints) legitimately responds 201
  // with an empty body, and res.json() on an empty body throws — turning a
  // success into a 500 after the upstream side effect already committed.
  private async parseResponse<T>(res: Response): Promise<T> {
    if (res.status === 204) return undefined as T;

    const text = await res.text();
    let data: unknown;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = undefined;
      }
    }

    if (!res.ok) {
      const d = data as { detail?: unknown; message?: unknown } | undefined;
      const raw = d?.detail ?? d?.message ?? `Request failed: ${res.status}`;
      throw new HttpException(Array.isArray(raw) ? raw.join(', ') : (raw as string), res.status);
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
    return this.parseResponse<T>(res);
  }

  async postAnonymous<T>(path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    return this.parseResponse<T>(res);
  }
}
