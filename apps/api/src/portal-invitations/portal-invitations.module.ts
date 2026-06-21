import { Module } from '@nestjs/common';
import { PortalInvitationsController } from './portal-invitations.controller';
import { PortalInvitationsService } from './portal-invitations.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [PortalInvitationsController],
  providers: [PortalInvitationsService],
})
export class PortalInvitationsModule {}
