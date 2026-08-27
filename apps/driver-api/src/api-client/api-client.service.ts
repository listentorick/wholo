import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
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
    headers?: Record<string, string>,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });

    if (res.status === 204) return undefined as T;

    // Text-then-parse rather than res.json(): a void upstream action can
    // legitimately respond 2xx with an empty body, and res.json() on an
    // empty body throws — previously surfacing a success as a 502 after the
    // upstream side effect already committed. A NON-empty body that isn't
    // JSON is still a genuine upstream fault → 502.
    const text = await res.text();
    let data: unknown;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new HttpException(`Upstream error: ${res.status}`, HttpStatus.BAD_GATEWAY);
      }
    }

    if (!res.ok) {
      const d = data as Record<string, unknown> | undefined;
      const message = d?.['detail'] ?? d?.['message'] ?? `Request failed: ${res.status}`;
      throw new HttpException(
        Array.isArray(message) ? message.join(', ') : (message as string),
        res.status >= 400 && res.status < 600 ? res.status : HttpStatus.BAD_GATEWAY,
      );
    }

    return data as T;
  }

  get<T>(path: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('GET', path, headers);
  }

  post<T>(path: string, headers: Record<string, string> | undefined, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, headers, body);
  }
}
