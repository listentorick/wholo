import { InvitationLookupThrottlerGuard } from './invitation-lookup-throttler.guard';

describe('InvitationLookupThrottlerGuard', () => {
  const tracker = (req: Record<string, unknown>) =>
    (InvitationLookupThrottlerGuard.prototype as unknown as { getTracker(r: Record<string, unknown>): Promise<string> }).getTracker.call({}, req);

  it('counts each invitation token separately, not the BFF address every request comes from', async () => {
    await expect(tracker({ body: { token: 'abc' }, ip: '10.0.0.1' })).resolves.toBe('invitation-lookup:abc');
    await expect(tracker({ body: { token: 'def' }, ip: '10.0.0.1' })).resolves.toBe('invitation-lookup:def');
  });

  it('falls back to the caller address without a token', async () => {
    await expect(tracker({ body: {}, ip: '10.0.0.1' })).resolves.toBe('10.0.0.1');
  });
});
