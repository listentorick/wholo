import { Test, TestingModule } from '@nestjs/testing';
import { AccountingContactController } from './accounting-contact.controller';
import { AccountingContactService } from './accounting-contact.service';

const mockService = {
  listContacts: jest.fn(),
  countNeedsAttention: jest.fn(),
  requestManualSync: jest.fn(),
  importAsNewCustomer: jest.fn(),
  confirmSuggestion: jest.fn(),
  matchToExistingCustomer: jest.fn(),
  ignore: jest.fn(),
  unlink: jest.fn(),
};

const req = { user: { sub: 'user-1', organisationId: 'dist-1' } } as never;

describe('AccountingContactController', () => {
  let controller: AccountingContactController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountingContactController],
      providers: [{ provide: AccountingContactService, useValue: mockService }],
    }).compile();
    controller = module.get(AccountingContactController);
  });

  it('listContacts delegates to the service', async () => {
    mockService.listContacts.mockResolvedValue({ data: [], pagination: { nextCursor: null, hasMore: false } });
    const query = { limit: 20 } as never;

    const result = await controller.listContacts('dist-1', query);

    expect(mockService.listContacts).toHaveBeenCalledWith('dist-1', query);
    expect(result).toEqual({ data: [], pagination: { nextCursor: null, hasMore: false } });
  });

  it('countNeedsAttention wraps the service count in a {count} envelope', async () => {
    mockService.countNeedsAttention.mockResolvedValue(4);
    const result = await controller.countNeedsAttention('dist-1');
    expect(result).toEqual({ count: 4 });
  });

  it('requestManualSync delegates to the service, never running sync inline', async () => {
    mockService.requestManualSync.mockResolvedValue({ queued: true });
    const result = await controller.requestManualSync('dist-1');
    expect(mockService.requestManualSync).toHaveBeenCalledWith('dist-1');
    expect(result).toEqual({ queued: true });
  });

  it('importAsNewCustomer passes the caller sub as the importing user', async () => {
    const dto = { name: 'Blackbird Vine & Co' } as never;
    await controller.importAsNewCustomer('dist-1', 'contact-1', dto, req);
    expect(mockService.importAsNewCustomer).toHaveBeenCalledWith('dist-1', 'user-1', 'contact-1', dto);
  });

  it('confirmSuggestion passes the caller sub as the confirming user', async () => {
    await controller.confirmSuggestion('dist-1', 'sugg-1', req);
    expect(mockService.confirmSuggestion).toHaveBeenCalledWith('dist-1', 'user-1', 'sugg-1');
  });

  it('matchToExistingCustomer unpacks tradeRelationshipId from the body', async () => {
    await controller.matchToExistingCustomer('dist-1', 'contact-1', { tradeRelationshipId: 'tr-1' }, req);
    expect(mockService.matchToExistingCustomer).toHaveBeenCalledWith('dist-1', 'user-1', 'contact-1', 'tr-1');
  });

  it('ignore passes the caller sub', async () => {
    await controller.ignore('dist-1', 'contact-1', req);
    expect(mockService.ignore).toHaveBeenCalledWith('dist-1', 'user-1', 'contact-1');
  });

  it('unlink delegates to the service', async () => {
    await controller.unlink('dist-1', 'mapping-1');
    expect(mockService.unlink).toHaveBeenCalledWith('dist-1', 'mapping-1');
  });
});
