import { DeliveryLinkThrottlerGuard } from './delivery-link-throttler.guard';

// getTracker is the only behaviour this subclass adds; the counting itself
// is @nestjs/throttler's (exercised end to end in the integration spec).
class Exposed extends DeliveryLinkThrottlerGuard {
  track(req: Record<string, unknown>) {
    return this.getTracker(req);
  }
}

describe('DeliveryLinkThrottlerGuard', () => {
  const guard = Object.create(Exposed.prototype) as Exposed;

  it('counts each delivery link separately, whoever forwards it', async () => {
    const a = await guard.track({ ip: '10.0.0.5', headers: { 'x-delivery-token': 'link-a' } });
    const b = await guard.track({ ip: '10.0.0.5', headers: { 'x-delivery-token': 'link-b' } });
    expect(a).not.toBe(b);
  });

  it('counts the same link as one, from any address', async () => {
    const first = await guard.track({ ip: '10.0.0.5', headers: { 'x-delivery-token': 'link-a' } });
    const second = await guard.track({ ip: '10.0.0.9', headers: { 'x-delivery-token': 'link-a' } });
    expect(first).toBe(second);
  });

  it('falls back to the caller address when there is no token', async () => {
    await expect(guard.track({ ip: '10.0.0.5', headers: {} })).resolves.toBe('10.0.0.5');
  });
});
