import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { KEYCLOAK_USER_QUEUE } from '../queues/queue.constants';
import { KeycloakAdminService } from './keycloak-admin.service';
import { StaffKeycloakDisableProcessor } from './staff-keycloak-disable.processor';

// Worker-only, like the other queue consumers: imported by WorkerModule, never
// AppModule (the HTTP API process has no BullMQ wiring by deliberate rule).
@Module({
  imports: [BullModule.registerQueue({ name: KEYCLOAK_USER_QUEUE })],
  providers: [KeycloakAdminService, StaffKeycloakDisableProcessor],
})
export class KeycloakAdminWorkerModule {}
