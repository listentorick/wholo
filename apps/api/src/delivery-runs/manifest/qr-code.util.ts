import * as QRCode from 'qrcode';

// Encodes the plain-text Stocdup order number — not a URL or token. The
// digital-delivery destination this QR will eventually point to is out of
// scope for the driver-manifest PBI; when that workflow is built, this is
// the one place that needs to change.
export async function generateOrderQrPng(orderNumber: string): Promise<Buffer> {
  return QRCode.toBuffer(orderNumber, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 4,
    color: { dark: '#000000', light: '#FFFFFFFF' },
    width: 200,
  });
}
