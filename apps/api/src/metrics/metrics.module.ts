import { Global, Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';

/**
 * Platform-operator business-activity telemetry (ADR-062). Global so any
 * feature can emit a StatsD counter without re-importing; registered once in
 * AppModule. Not wired into WorkerModule — the only emitter today is
 * OrdersService.submitOrder, which runs in the API process.
 */
@Global()
@Module({
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
