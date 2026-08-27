import * as QRCode from 'qrcode';

// Encodes the driver delivery URL for this order (a durable, HMAC-signed
// pointer to Order.id — see DeliveryTokenSigner). The same URL is produced
// every time for the same order, so reprinting a manifest reproduces an
// identical QR code.
export async function generateOrderQrPng(deliveryUrl: string): Promise<Buffer> {
  return QRCode.toBuffer(deliveryUrl, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 4,
    color: { dark: '#000000', light: '#FFFFFFFF' },
    width: 200,
  });
}
