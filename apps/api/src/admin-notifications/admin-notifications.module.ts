import { Module } from '@nestjs/common';
import { AdminNotificationsController } from './admin-notifications.controller';
import { AdminNotificationsService } from './admin-notifications.service';

// Imported by BOTH AppModule (serves the HTTP list/unread-count/mark-read
// routes) and WorkerModule (AccountingBulkImportProcessor calls create()
// directly) — a deliberate exception to the usual worker-only/HTTP-only
// module split, since AdminNotificationsService is a plain DB write needed
// from both processes, with no queue/BullMQ wiring of its own.
@Module({
  controllers: [AdminNotificationsController],
  providers: [AdminNotificationsService],
  exports: [AdminNotificationsService],
})
export class AdminNotificationsModule {}
