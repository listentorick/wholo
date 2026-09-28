import { Module } from '@nestjs/common';
import { PortalInvitationsController } from './portal-invitations.controller';
import { PortalInvitationsService } from './portal-invitations.service';
import { UsersModule } from '../users/users.module';
import { OutboxModule } from '../outbox/outbox.module';

@Module({
  imports: [UsersModule, OutboxModule],
  controllers: [PortalInvitationsController],
  providers: [PortalInvitationsService],
})
export class PortalInvitationsModule {}
