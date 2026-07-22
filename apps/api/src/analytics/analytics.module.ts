import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

// HTTP-facing — imported by AppModule (the API process), unlike
// analytics-facts (worker-only). Reads the fact layer that module populates;
// never writes to it.
@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
