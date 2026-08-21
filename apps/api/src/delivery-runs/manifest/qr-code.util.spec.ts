import { generateOrderQrPng } from './qr-code.util';

const PNG_MAGIC_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe('generateOrderQrPng', () => {
  it('returns a valid PNG buffer', async () => {
    const buffer = await generateOrderQrPng('10428');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 4)).toEqual(PNG_MAGIC_BYTES);
  });

  it('encodes the plain order number, not a URL or token — different order numbers produce different QR images', async () => {
    const a = await generateOrderQrPng('10428');
    const b = await generateOrderQrPng('10431');
    expect(a.equals(b)).toBe(false);
  });

  it('is deterministic for the same order number', async () => {
    const a = await generateOrderQrPng('10428');
    const b = await generateOrderQrPng('10428');
    expect(a.equals(b)).toBe(true);
  });
});
