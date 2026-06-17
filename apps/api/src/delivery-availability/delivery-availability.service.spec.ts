import { Test, TestingModule } from '@nestjs/testing';
import { WholoRuleBasedDeliveryAvailabilityProvider } from './wholo-rule-based.provider';
import { PrismaService } from '../prisma/prisma.service';

// Fixed "now" for deterministic tests: Monday 10 June 2024, 09:00 UTC
const FIXED_NOW = new Date('2024-06-10T09:00:00.000Z'); // Monday

function buildProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'profile-1',
    defaultWeekdays: [1, 3, 5], // Mon, Wed, Fri
    defaultCutoffTime: '17:00',
    defaultCutoffProcessingDays: 1,
    speciallyEnabledDates: [],
    speciallyDisabledDates: [],
    cutoffRules: [],
    ...overrides,
  };
}

describe('WholoRuleBasedDeliveryAvailabilityProvider', () => {
  let provider: WholoRuleBasedDeliveryAvailabilityProvider;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);

    const mockPrisma = {
      traderCustomerSettings: { findUnique: jest.fn() },
      distributorSettings: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WholoRuleBasedDeliveryAvailabilityProvider,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    provider = module.get(WholoRuleBasedDeliveryAvailabilityProvider);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns empty dates when no delivery profile is assigned', async () => {
    (prisma.traderCustomerSettings.findUnique as jest.Mock).mockResolvedValue(null);
    const result = await provider.getAvailableDates('dist-1', 'cust-1');
    expect(result).toEqual({ dates: [], profileId: null });
  });

  it('returns empty dates when deliveryProfileId is null', async () => {
    (prisma.traderCustomerSettings.findUnique as jest.Mock).mockResolvedValue({
      deliveryProfileId: null,
      deliveryProfile: null,
    });
    const result = await provider.getAvailableDates('dist-1', 'cust-1');
    expect(result).toEqual({ dates: [], profileId: null });
  });

  it('returns available weekday dates with correct cutoff deadline', async () => {
    // Now = Monday 10 June 2024 09:00 UTC
    // Profile: Mon/Wed/Fri, cutoff 17:00 1 processing day before
    // Processing days: Mon-Fri
    // Tomorrow = Tuesday (not in profile) → skip
    // Wednesday 12 June: cutoff = 1 processing day before = Tuesday 11 June 17:00 → valid (17:00 > now)
    (prisma.traderCustomerSettings.findUnique as jest.Mock).mockResolvedValue({
      deliveryProfileId: 'profile-1',
      deliveryProfile: buildProfile(),
    });
    (prisma.distributorSettings.findUnique as jest.Mock).mockResolvedValue({
      processingDays: [1, 2, 3, 4, 5],
    });

    const result = await provider.getAvailableDates('dist-1', 'cust-1');

    expect(result.profileId).toBe('profile-1');
    expect(result.dates.length).toBeGreaterThan(0);

    // First available date should be Wednesday 12 June
    expect(result.dates[0].date).toBe('2024-06-12');
    // Cutoff: 1 processing day before Wed = Tue 11 June at 17:00 UTC
    expect(result.dates[0].cutoffDeadline).toBe('2024-06-11T17:00:00.000Z');
  });

  it('skips specially disabled dates', async () => {
    // Disable Wednesday 12 June
    (prisma.traderCustomerSettings.findUnique as jest.Mock).mockResolvedValue({
      deliveryProfileId: 'profile-1',
      deliveryProfile: buildProfile({
        speciallyDisabledDates: [new Date('2024-06-12T00:00:00.000Z')],
      }),
    });
    (prisma.distributorSettings.findUnique as jest.Mock).mockResolvedValue({
      processingDays: [1, 2, 3, 4, 5],
    });

    const result = await provider.getAvailableDates('dist-1', 'cust-1');
    expect(result.dates.find((d: { date: string }) => d.date === '2024-06-12')).toBeUndefined();
  });

  it('includes specially enabled dates outside normal weekdays', async () => {
    // Enable Sunday 16 June (not in Mon/Wed/Fri profile)
    (prisma.traderCustomerSettings.findUnique as jest.Mock).mockResolvedValue({
      deliveryProfileId: 'profile-1',
      deliveryProfile: buildProfile({
        speciallyEnabledDates: [new Date('2024-06-16T00:00:00.000Z')],
      }),
    });
    (prisma.distributorSettings.findUnique as jest.Mock).mockResolvedValue({
      processingDays: [1, 2, 3, 4, 5],
    });

    const result = await provider.getAvailableDates('dist-1', 'cust-1');
    expect(result.dates.find((d: { date: string }) => d.date === '2024-06-16')).toBeDefined();
  });

  it('skips dates whose cut-off has already passed', async () => {
    // Now = Monday 10 June 09:00 UTC
    // Monday 10 June is today — skip (starts from tomorrow)
    // But: if cutoff for a future date has passed (cutoff < now), it should be excluded
    // Set processing days to empty so cutoff ends up being the delivery date itself,
    // making it impossible to calculate a future cutoff — instead use 0 processing days
    (prisma.traderCustomerSettings.findUnique as jest.Mock).mockResolvedValue({
      deliveryProfileId: 'profile-1',
      deliveryProfile: buildProfile({
        defaultWeekdays: [2], // Tuesday only
        defaultCutoffTime: '08:00', // 08:00 UTC
        defaultCutoffProcessingDays: 1,
      }),
    });
    (prisma.distributorSettings.findUnique as jest.Mock).mockResolvedValue({
      processingDays: [1, 2, 3, 4, 5],
    });

    // Tuesday 11 June: cutoff = 1 processing day before = Monday 10 June 08:00 UTC
    // Now is 09:00 UTC → cutoff has passed → should be excluded
    const result = await provider.getAvailableDates('dist-1', 'cust-1');
    expect(result.dates.find((d: { date: string }) => d.date === '2024-06-11')).toBeUndefined();
  });

  it('correctly counts N processing days backward skipping non-processing days', async () => {
    // Profile: Friday delivery, 2 processing days before, Mon-Fri
    // From Friday 14 June: back 2 days = Thursday 13, Wednesday 12
    // Cutoff = Wednesday 12 June at 17:00 UTC
    (prisma.traderCustomerSettings.findUnique as jest.Mock).mockResolvedValue({
      deliveryProfileId: 'profile-1',
      deliveryProfile: buildProfile({
        defaultWeekdays: [5], // Friday only
        defaultCutoffTime: '17:00',
        defaultCutoffProcessingDays: 2,
      }),
    });
    (prisma.distributorSettings.findUnique as jest.Mock).mockResolvedValue({
      processingDays: [1, 2, 3, 4, 5],
    });

    const result = await provider.getAvailableDates('dist-1', 'cust-1');
    const fridayEntry = result.dates.find((d: { date: string }) => d.date === '2024-06-14');
    expect(fridayEntry).toBeDefined();
    expect(fridayEntry!.cutoffDeadline).toBe('2024-06-12T17:00:00.000Z');
  });

  it('uses per-weekday cutoff rule override instead of profile default', async () => {
    // Profile default: 1 processing day, 17:00
    // Friday override: 2 processing days, 15:00
    (prisma.traderCustomerSettings.findUnique as jest.Mock).mockResolvedValue({
      deliveryProfileId: 'profile-1',
      deliveryProfile: buildProfile({
        defaultWeekdays: [5],
        cutoffRules: [
          { weekday: 5, cutoffTime: '15:00', processingDaysBeforeDelivery: 2 },
        ],
      }),
    });
    (prisma.distributorSettings.findUnique as jest.Mock).mockResolvedValue({
      processingDays: [1, 2, 3, 4, 5],
    });

    const result = await provider.getAvailableDates('dist-1', 'cust-1');
    const fridayEntry = result.dates.find((d: { date: string }) => d.date === '2024-06-14');
    expect(fridayEntry).toBeDefined();
    // 2 days before Friday = Wednesday at 15:00
    expect(fridayEntry!.cutoffDeadline).toBe('2024-06-12T15:00:00.000Z');
  });

  it('returns at most 8 dates', async () => {
    // Profile has every day enabled
    (prisma.traderCustomerSettings.findUnique as jest.Mock).mockResolvedValue({
      deliveryProfileId: 'profile-1',
      deliveryProfile: buildProfile({
        defaultWeekdays: [0, 1, 2, 3, 4, 5, 6],
        defaultCutoffProcessingDays: 0,
        defaultCutoffTime: '23:59',
      }),
    });
    (prisma.distributorSettings.findUnique as jest.Mock).mockResolvedValue({
      processingDays: [1, 2, 3, 4, 5],
    });

    const result = await provider.getAvailableDates('dist-1', 'cust-1');
    expect(result.dates.length).toBeLessThanOrEqual(8);
  });

  it('uses default processing days Mon-Fri when distributor settings not found', async () => {
    (prisma.traderCustomerSettings.findUnique as jest.Mock).mockResolvedValue({
      deliveryProfileId: 'profile-1',
      deliveryProfile: buildProfile({ defaultWeekdays: [5] }),
    });
    (prisma.distributorSettings.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await provider.getAvailableDates('dist-1', 'cust-1');
    // Should still work — defaults to Mon-Fri processing
    expect(result.profileId).toBe('profile-1');
  });
});
