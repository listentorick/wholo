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
      const d = data as { title?: unknown; detail?: unknown; message?: unknown } | undefined;
      const raw = d?.detail ?? d?.message ?? `Request failed: ${res.status}`;
      const message = Array.isArray(raw) ? raw.join(', ') : (raw as string);
      const title = typeof d?.title === 'string' ? d.title : undefined;
      throw new HttpException(title ? { message, error: title } : message, res.status);
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

  // Sibling to request<T>/parseResponse rather than folded into them —
  // parseResponse always does res.text() -> JSON.parse, which would corrupt
  // a binary body (e.g. the driver manifest PDF). Errors still go through
  // parseResponse for a consistent problem-detail error shape.
  async getBinary(
    path: string,
    token: string,
  ): Promise<{ buffer: Buffer; contentType: string; contentDisposition: string | null }> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      await this.parseResponse(res); // throws
    }
    const arrayBuffer = await res.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: res.headers.get('content-type') ?? 'application/octet-stream',
      contentDisposition: res.headers.get('content-disposition'),
    };
  }
}
