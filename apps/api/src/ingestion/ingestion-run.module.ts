import { Module } from '@nestjs/common';
import { IngestionRunService } from './ingestion-run.service';

// The generic ingestion-run tracking core. No accounting imports — a future
// non-accounting source (delivery, stock) consumes the same service.
// PrismaModule is @Global, so it needs no explicit import here.
@Module({
  providers: [IngestionRunService],
  exports: [IngestionRunService],
})
export class IngestionRunModule {}
