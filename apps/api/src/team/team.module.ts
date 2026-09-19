import { Module } from '@nestjs/common';
import { AdminNotificationsModule } from '../admin-notifications/admin-notifications.module';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { UsersModule } from '../users/users.module';
import { StaffInvitationAcceptController } from './staff-invitation-accept.controller';
import { StaffInvitationAcceptService } from './staff-invitation-accept.service';
import { StaffInvitationsController } from './staff-invitations.controller';
import { StaffInvitationsService } from './staff-invitations.service';
import { TeamMembersController } from './team-members.controller';
import { TeamMembersService } from './team-members.service';

@Module({
  imports: [AdminNotificationsModule, AuditModule, OutboxModule, UsersModule],
  controllers: [StaffInvitationsController, StaffInvitationAcceptController, TeamMembersController],
  providers: [StaffInvitationsService, StaffInvitationAcceptService, TeamMembersService],
  exports: [StaffInvitationsService],
})
export class TeamModule {}
