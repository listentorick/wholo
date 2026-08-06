import { Test } from '@nestjs/testing';
import { AccountingChangeDetectionService } from './accounting-change-detection.service';
import { AdminNotificationsService } from '../admin-notifications/admin-notifications.service';

describe('AccountingChangeDetectionService', () => {
  let service: AccountingChangeDetectionService;
  let adminNotifications: { notifyOrganisationAdmins: jest.Mock };

  beforeEach(async () => {
    adminNotifications = { notifyOrganisationAdmins: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        AccountingChangeDetectionService,
        { provide: AdminNotificationsService, useValue: adminNotifications },
      ],
    }).compile();

    service = module.get(AccountingChangeDetectionService);
  });

  function baseParams(overrides: Partial<Parameters<AccountingChangeDetectionService['detectAndFlag']>[0]> = {}) {
    const markChanged = jest.fn().mockResolvedValue(undefined);
    return {
      distributorId: 'dist-1',
      hasActiveMapping: true,
      previous: { ratePercentage: '10.0000', isActive: true },
      current: { ratePercentage: '10.0000', isActive: true },
      fields: ['ratePercentage', 'isActive'] as (keyof { ratePercentage: string; isActive: boolean })[],
      markChanged,
      notification: { type: 'ACCOUNTING_TAX_TYPE_CHANGED', title: 'Tax rate changed', body: 'A synced tax rate changed.' },
      ...overrides,
    };
  }

  it('does nothing when there is no active mapping', async () => {
    const markChanged = jest.fn().mockResolvedValue(undefined);
    await service.detectAndFlag(
      baseParams({
        hasActiveMapping: false,
        current: { ratePercentage: '20.0000', isActive: true },
        markChanged,
      }),
    );
    expect(markChanged).not.toHaveBeenCalled();
    expect(adminNotifications.notifyOrganisationAdmins).not.toHaveBeenCalled();
  });

  it('does nothing when there is no previous row (first sync)', async () => {
    const markChanged = jest.fn().mockResolvedValue(undefined);
    await service.detectAndFlag(baseParams({ previous: null, markChanged }));
    expect(markChanged).not.toHaveBeenCalled();
    expect(adminNotifications.notifyOrganisationAdmins).not.toHaveBeenCalled();
  });

  it('does nothing when none of the watched fields differ', async () => {
    const markChanged = jest.fn().mockResolvedValue(undefined);
    await service.detectAndFlag(
      baseParams({
        previous: { ratePercentage: '10.0000', isActive: true },
        current: { ratePercentage: '10.0000', isActive: true },
        markChanged,
      }),
    );
    expect(markChanged).not.toHaveBeenCalled();
    expect(adminNotifications.notifyOrganisationAdmins).not.toHaveBeenCalled();
  });

  it('flags and notifies when a watched field differs', async () => {
    const markChanged = jest.fn().mockResolvedValue(undefined);
    const notification = { type: 'ACCOUNTING_TAX_TYPE_CHANGED', title: 'Tax rate changed', body: 'Rate changed from 10% to 20%.' };
    await service.detectAndFlag(
      baseParams({
        previous: { ratePercentage: '10.0000', isActive: true },
        current: { ratePercentage: '20.0000', isActive: true },
        markChanged,
        notification,
      }),
    );
    expect(markChanged).toHaveBeenCalledTimes(1);
    expect(adminNotifications.notifyOrganisationAdmins).toHaveBeenCalledWith('dist-1', notification);
  });

  it('ignores changes to fields not listed in `fields`', async () => {
    const markChanged = jest.fn().mockResolvedValue(undefined);
    await service.detectAndFlag(
      baseParams({
        previous: { ratePercentage: '10.0000', isActive: true, displayName: 'Old name' },
        current: { ratePercentage: '10.0000', isActive: true, displayName: 'New name' },
        fields: ['ratePercentage', 'isActive'],
        markChanged,
      }),
    );
    expect(markChanged).not.toHaveBeenCalled();
    expect(adminNotifications.notifyOrganisationAdmins).not.toHaveBeenCalled();
  });

  it('never mutates the previous or current objects it is given', async () => {
    const previous = { ratePercentage: '10.0000', isActive: true };
    const current = { ratePercentage: '20.0000', isActive: true };
    const previousSnapshot = { ...previous };
    const currentSnapshot = { ...current };

    await service.detectAndFlag(baseParams({ previous, current }));

    expect(previous).toEqual(previousSnapshot);
    expect(current).toEqual(currentSnapshot);
  });
});
