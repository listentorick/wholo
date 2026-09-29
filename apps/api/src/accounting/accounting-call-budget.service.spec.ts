import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AccountingCallBudgetService, MAX_BUDGET_WAIT_MS } from './accounting-call-budget.service';
import { AccountingProviderError } from './adapters/accounting-provider.error';

const mockEval = jest.fn();

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ eval: mockEval, quit: jest.fn(), on: jest.fn() })),
}));

class TestBudget extends AccountingCallBudgetService {
  slept: number[] = [];
  protected sleep(ms: number): Promise<void> {
    this.slept.push(ms);
    return Promise.resolve();
  }
}

describe('AccountingCallBudgetService', () => {
  let budget: TestBudget;

  beforeEach(() => {
    jest.clearAllMocks();
    budget = new TestBudget({ get: (_k: string, fallback: string) => fallback } as unknown as ConfigService);
  });

  it('admits a call straight away while the organisation is under its limit', async () => {
    mockEval.mockResolvedValueOnce(0);

    await budget.acquire('XERO', 'tenant-1', 50);

    expect(budget.slept).toEqual([]);
    const [, , key, limit, windowMs] = mockEval.mock.calls[0];
    expect(key).toBe('wholo:accounting-call-budget:XERO:tenant-1');
    expect(limit).toBe(50);
    expect(windowMs).toBe(60_000);
  });

  it('waits for a slot to free up, then proceeds', async () => {
    mockEval.mockResolvedValueOnce(1_500).mockResolvedValueOnce(0);

    await budget.acquire('XERO', 'tenant-1', 50);

    expect(budget.slept).toHaveLength(1);
    expect(budget.slept[0]).toBeGreaterThanOrEqual(1_500);
  });

  it('gives the worker lane back with a transient error when the wait would be too long', async () => {
    mockEval.mockResolvedValue(MAX_BUDGET_WAIT_MS + 1);

    const err = await budget.acquire('XERO', 'tenant-1', 50).catch((e) => e);

    expect(err).toBeInstanceOf(AccountingProviderError);
    expect(err.transient).toBe(true);
    expect(err.code).toBe('CALL_BUDGET_EXHAUSTED');
    expect(err.retryAfterMs).toBe(MAX_BUDGET_WAIT_MS + 1);
  });

  it('fails open (and says so) when Redis is unavailable — a provider 429 is the backstop', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    mockEval.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(budget.acquire('XERO', 'tenant-1', 50)).resolves.toBeUndefined();

    expect(warn.mock.calls[0][0]).toMatchObject({
      event: 'accounting.call_budget.unavailable',
      provider: 'XERO',
      externalOrgId: 'tenant-1',
    });
    warn.mockRestore();
  });
});
