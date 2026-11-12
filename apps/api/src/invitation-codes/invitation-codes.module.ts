import { Module } from '@nestjs/common';
import { InvitationCodesService } from './invitation-codes.service';

// MailModule and PrismaModule are global.
@Module({
  providers: [InvitationCodesService],
  exports: [InvitationCodesService],
})
export class InvitationCodesModule {}
