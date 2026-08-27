import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('health')
export class HealthController {
  private readonly centralApiUrl: string;

  constructor(config: ConfigService) {
    this.centralApiUrl = config.get<string>('CENTRAL_API_URL', 'http://wholo-api:3001');
  }

  @Get()
  check() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    try {
      const res = await fetch(`${this.centralApiUrl}/api/v1/health`, { signal: AbortSignal.timeout(2000) });
      if (!res.ok) throw new Error(`upstream returned ${res.status}`);
    } catch (err) {
      throw new ServiceUnavailableException({
        status: 'error',
        checks: { api: 'error' },
        detail: err instanceof Error ? err.message : 'unreachable',
      });
    }
    return { status: 'ok', checks: { api: 'ok' } };
  }
}
