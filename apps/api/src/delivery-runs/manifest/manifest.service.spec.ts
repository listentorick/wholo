import { Test, TestingModule } from '@nestjs/testing';
import { ManifestService } from './manifest.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ManifestDataService } from './manifest-data.service';
import { ManifestLogoService } from './logo.service';
import { ManifestData } from './manifest-data.types';

jest.mock('./manifest-pdf.builder', () => ({
  buildManifestPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-fake')),
}));

const manifestData: ManifestData = {
  runId: 'run-1',
  runName: 'Yorkshire Wednesday',
  runReference: 'RUN-2026-08-26-ABC123',
  deliveryDate: '2026-08-26',
  driverName: 'Alex Turner',
  distributorName: 'Blackbird Wines',
  orders: [{
    orderId: 'order-1',
    orderNumber: '10428',
    stopNumber: 1,
    customerName: 'The Old Hall',
    address: {
      line1: '8 High Street', line2: null, city: 'Halifax', state: null, postcode: 'HX1 2AB', country: 'GB',
    },
    deliveryInstructions: null,
    customerReference: 'PO-5571',
    lines: [{ id: 'line-1', productName: 'Rioja Crianza', quantity: 3 }],
  }],
};

describe('ManifestService', () => {
  let service: ManifestService;
  let audit: { record: jest.Mock };
  let manifestDataService: { getManifestData: jest.Mock };
  let logoService: { getLogoPng: jest.Mock };

  beforeEach(async () => {
    audit = { record: jest.fn() };
    manifestDataService = { getManifestData: jest.fn().mockResolvedValue(manifestData) };
    logoService = { getLogoPng: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ManifestService,
        { provide: PrismaService, useValue: {} },
        { provide: AuditService, useValue: audit },
        { provide: ManifestDataService, useValue: manifestDataService },
        { provide: ManifestLogoService, useValue: logoService },
      ],
    }).compile();

    service = module.get(ManifestService);
  });

  it('returns a PDF buffer and a filename derived from the run reference', async () => {
    const result = await service.generate('dist-1', 'run-1', 'user-1');

    expect(result.buffer.toString()).toContain('%PDF');
    expect(result.filename).toBe('manifest-RUN-2026-08-26-ABC123.pdf');
  });

  it('records an audit log entry for the generation', async () => {
    await service.generate('dist-1', 'run-1', 'user-1');

    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      distributorId: 'dist-1',
      entityType: 'DELIVERY_RUN',
      entityId: 'run-1',
      action: 'DELIVERY_RUN_MANIFEST_GENERATED',
      actorUserId: 'user-1',
    }));
  });

  it('propagates errors from the data-gathering step (e.g. run not Ready) without generating a PDF', async () => {
    manifestDataService.getManifestData.mockRejectedValue(new Error('not ready'));

    await expect(service.generate('dist-1', 'run-1', 'user-1')).rejects.toThrow('not ready');
    expect(audit.record).not.toHaveBeenCalled();
  });
});
