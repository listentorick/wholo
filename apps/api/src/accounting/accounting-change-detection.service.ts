import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminNotificationsService } from '../admin-notifications/admin-notifications.service';

interface DetectAndFlagParams<T extends Record<string, unknown>> {
  distributorId: string;
  hasActiveMapping: boolean;
  previous: T | null;
  current: T;
  fields: (keyof T)[];
  markChanged: () => Promise<void>;
  notification: {
    type: string;
    title: string;
    body: string;
    linkPath?: string;
    payload?: Prisma.InputJsonValue;
  };
}

// Shared by every AccountingSyncProcessorBase subclass (injected via the base
// class's constructor) so a mapped cache row's drift is detected and
// surfaced the same way everywhere — products, contacts, tax types — rather
// than each sync pipeline growing its own ad hoc version.
//
// Never mutates anything on the Wholo side of a mapping: only flags the
// cache row (via the caller-supplied markChanged callback) and raises an
// admin notification. The rate/value itself is never auto-applied — matches
// the existing, deliberate "post-link syncs only refresh the cache row"
// precedent in accounting-product-sync.processor.ts.
@Injectable()
export class AccountingChangeDetectionService {
  constructor(private readonly adminNotifications: AdminNotificationsService) {}

  async detectAndFlag<T extends Record<string, unknown>>(params: DetectAndFlagParams<T>): Promise<void> {
    // Only matters once a record is actually linked to a Wholo entity — an
    // unmapped row's values are still fair game for the sync to overwrite
    // freely (that's the whole point of syncing), and there's no previous
    // row to compare against for a record seen for the first time.
    if (!params.hasActiveMapping || !params.previous) return;

    const changed = params.fields.some(
      (field) => String(params.previous![field]) !== String(params.current[field]),
    );
    if (!changed) return;

    await params.markChanged();
    await this.adminNotifications.notifyOrganisationAdmins(params.distributorId, params.notification);
  }
}
