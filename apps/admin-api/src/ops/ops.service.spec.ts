import { OpsService } from './ops.service';

describe('OpsService', () => {
  const api = { get: jest.fn(), post: jest.fn(), delete: jest.fn() };
  const service = new OpsService(api as never);

  beforeEach(() => jest.clearAllMocks());

  it('passes the search and filter through as a query string', () => {
    service.distributors('tok', { q: 'vine & co', filter: 'attention' });
    service.distributors('tok', {});
    expect(api.get).toHaveBeenNthCalledWith(1, '/distributors?q=vine+%26+co&filter=attention', 'tok');
    expect(api.get).toHaveBeenNthCalledWith(2, '/distributors', 'tok');
  });

  it('opens access at the distributor for the given user', () => {
    service.openAccess('op-1', { distributorId: 'dist-1', reason: 'Price lists', durationMinutes: 60 }, 'tok');
    expect(api.post).toHaveBeenCalledWith('/distributors/dist-1/support-grants', 'tok', { userId: 'op-1', reason: 'Price lists', durationMinutes: 60 });
  });

  it('ends access at the distributor', () => {
    service.endAccess('dist-1', 'g-1', 'tok');
    expect(api.delete).toHaveBeenCalledWith('/distributors/dist-1/support-grants/g-1', 'tok');
  });

  it('reads the platform stats with the caller’s token', async () => {
    api.get.mockResolvedValue({ wholesalers: 3 });
    await expect(service.stats('tok')).resolves.toEqual({ wholesalers: 3 });
    expect(api.get).toHaveBeenCalledWith('/platform/stats', 'tok');
  });

  it('lists the grants of the given user', async () => {
    api.get.mockResolvedValue([{ id: 'g-1' }]);
    await expect(service.myGrants('op-1', 'tok')).resolves.toEqual([{ id: 'g-1' }]);
    expect(api.get).toHaveBeenCalledWith('/users/op-1/support-grants', 'tok');
  });

  it('encodes ids, so a crafted one cannot reach another resource', () => {
    service.myGrants('../admin', 'tok');
    service.endAccess('dist/1', 'g?x=1', 'tok');
    service.openAccess('op-1', { distributorId: '../x', reason: 'r', durationMinutes: 60 }, 'tok');
    expect(api.get).toHaveBeenCalledWith('/users/..%2Fadmin/support-grants', 'tok');
    expect(api.delete).toHaveBeenCalledWith('/distributors/dist%2F1/support-grants/g%3Fx%3D1', 'tok');
    expect(api.post).toHaveBeenCalledWith('/distributors/..%2Fx/support-grants', 'tok', expect.anything());
  });
});
