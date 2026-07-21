import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from './prisma/prisma.service';
import { RedisHealthService } from './health/redis-health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private prisma: PrismaService,
    private redisHealth: RedisHealthService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness check — is the process up' })
  @ApiOkResponse({ description: 'Process is up' })
  check() {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness check — can this instance serve traffic' })
  @ApiOkResponse({ description: 'Dependencies are reachable' })
  @ApiServiceUnavailableResponse({ description: 'A dependency is unreachable' })
  async ready() {
    const [db, redis] = await Promise.allSettled([this.prisma.$queryRaw`SELECT 1`, this.redisHealth.ping()]);

    if (db.status === 'rejected' || redis.status === 'rejected') {
      throw new ServiceUnavailableException({
        status: 'error',
        checks: {
          db: db.status === 'rejected' ? 'error' : 'ok',
          redis: redis.status === 'rejected' ? 'error' : 'ok',
        },
      });
    }

    return { status: 'ok', checks: { db: 'ok', redis: 'ok' } };
  }
}
