import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SupportGrantsController, UserSupportGrantsController } from './support-grants.controller';
import { SupportGrantsService } from './support-grants.service';

@Module({
  imports: [AuditModule],
  controllers: [SupportGrantsController, UserSupportGrantsController],
  providers: [SupportGrantsService],
})
export class SupportGrantsModule {}
