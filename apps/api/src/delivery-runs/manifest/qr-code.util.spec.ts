import { generateOrderQrPng } from './qr-code.util';

const PNG_MAGIC_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe('generateOrderQrPng', () => {
  it('returns a valid PNG buffer', async () => {
    const buffer = await generateOrderQrPng('https://driver.stocdup.com/d#order-1.sig1');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 4)).toEqual(PNG_MAGIC_BYTES);
  });

  it('encodes the delivery URL — different URLs produce different QR images', async () => {
    const a = await generateOrderQrPng('https://driver.stocdup.com/d#order-1.sig1');
    const b = await generateOrderQrPng('https://driver.stocdup.com/d#order-2.sig2');
    expect(a.equals(b)).toBe(false);
  });

  it('is deterministic for the same URL — a reprinted manifest reproduces an identical QR code', async () => {
    const a = await generateOrderQrPng('https://driver.stocdup.com/d#order-1.sig1');
    const b = await generateOrderQrPng('https://driver.stocdup.com/d#order-1.sig1');
    expect(a.equals(b)).toBe(true);
  });
});
