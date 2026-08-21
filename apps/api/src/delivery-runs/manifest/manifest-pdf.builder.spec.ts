import { buildManifestPdf } from './manifest-pdf.builder';
import { generateOrderQrPng } from './qr-code.util';
import { ManifestData, ManifestOrder, ManifestOrderLine } from './manifest-data.types';

const PDF_MAGIC = Buffer.from('%PDF');
const GENERATED_AT = new Date('2026-08-25T16:42:00.000Z');

// These row/page counts are derived by hand from manifest-pdf.builder.ts's
// own layout constants (CONTENT_TOP_Y, STOP_BOX_SIZE, QR_BOX_HEIGHT,
// PRODUCT_ROW_HEIGHT, CONTENT_BOTTOM_Y) — 23 product rows fit on an order's
// first page, 28 fit on a continuation page. Update these if that layout
// geometry changes.
const ROWS_PER_FIRST_PAGE = 23;
const ROWS_PER_CONTINUATION_PAGE = 28;

function makeLines(count: number): ManifestOrderLine[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `line-${i}`,
    productName: `Product ${i}`,
    quantity: i + 1,
  }));
}

function makeOrder(overrides: Partial<ManifestOrder> = {}): ManifestOrder {
  return {
    orderId: 'order-1',
    orderNumber: '10428',
    stopNumber: 1,
    customerName: 'The Old Hall',
    address: {
      line1: '8 High Street', line2: null, city: 'Halifax', state: null, postcode: 'HX1 2AB', country: 'GB',
    },
    deliveryInstructions: null,
    customerReference: 'PO-5571',
    lines: makeLines(3),
    ...overrides,
  };
}

function makeData(orders: ManifestOrder[]): ManifestData {
  return {
    runId: 'run-1',
    runName: 'Yorkshire Wednesday',
    runReference: 'RUN-2026-08-26-ABC123',
    deliveryDate: '2026-08-26',
    driverName: 'Alex Turner',
    distributorName: 'Blackbird Wines',
    orders,
  };
}

const emptyAssets = { logoPng: null, qrPngByOrderId: new Map<string, Buffer>() };

function countPages(buffer: Buffer): number {
  const text = buffer.toString('latin1');
  const matches = text.match(/\/Type\s*\/Page(?!s)/g);
  return matches ? matches.length : 0;
}

describe('buildManifestPdf', () => {
  it('produces a valid PDF buffer', async () => {
    const buffer = await buildManifestPdf(makeData([makeOrder()]), emptyAssets, GENERATED_AT);
    expect(buffer.subarray(0, 4)).toEqual(PDF_MAGIC);
  });

  it('builds successfully without a logo', async () => {
    const buffer = await buildManifestPdf(makeData([makeOrder()]), emptyAssets, GENERATED_AT);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('gives a single order with few lines exactly one overview page + one order page', async () => {
    const buffer = await buildManifestPdf(makeData([makeOrder({ lines: makeLines(3) })]), emptyAssets, GENERATED_AT);
    expect(countPages(buffer)).toBe(2);
  });

  it('never puts two orders on the same page: N orders with few lines each produce 1 overview page + N order pages', async () => {
    const orders = [
      makeOrder({ orderId: 'order-1', orderNumber: '10420', stopNumber: 1, lines: makeLines(2) }),
      makeOrder({ orderId: 'order-2', orderNumber: '10428', stopNumber: 2, lines: makeLines(3) }),
      makeOrder({ orderId: 'order-3', orderNumber: '10435', stopNumber: 3, lines: makeLines(1) }),
    ];
    const buffer = await buildManifestPdf(makeData(orders), emptyAssets, GENERATED_AT);
    expect(countPages(buffer)).toBe(1 + orders.length);
  });

  it('keeps an order whose lines exactly fill the first page to a single page (no wasted continuation)', async () => {
    const order = makeOrder({ lines: makeLines(ROWS_PER_FIRST_PAGE) });
    const buffer = await buildManifestPdf(makeData([order]), emptyAssets, GENERATED_AT);
    expect(countPages(buffer)).toBe(2); // overview + order's single page
  });

  it('continues an order onto a second page once its lines exceed the first page\'s capacity', async () => {
    const order = makeOrder({ lines: makeLines(ROWS_PER_FIRST_PAGE + 1) });
    const buffer = await buildManifestPdf(makeData([order]), emptyAssets, GENERATED_AT);
    expect(countPages(buffer)).toBe(3); // overview + order first page + one continuation page
  });

  it('spans multiple continuation pages for a very large order, with no other order sharing them', async () => {
    const lineCount = ROWS_PER_FIRST_PAGE + ROWS_PER_CONTINUATION_PAGE + 5;
    const order = makeOrder({ lines: makeLines(lineCount) });
    const buffer = await buildManifestPdf(makeData([order]), emptyAssets, GENERATED_AT);
    // overview + first page + 2 continuation pages (28-capacity, then the remaining 5)
    expect(countPages(buffer)).toBe(4);
  });

  it('renders a QR image for an order when one is provided in assets', async () => {
    const qrPng = await generateOrderQrPng('10428');
    const assets = { logoPng: null, qrPngByOrderId: new Map([['order-1', qrPng]]) };
    const buffer = await buildManifestPdf(makeData([makeOrder()]), assets, GENERATED_AT);
    expect(buffer.subarray(0, 4)).toEqual(PDF_MAGIC);
  });
});
