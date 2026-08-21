// eslint-disable-next-line @typescript-eslint/no-require-imports
import PDFDocument = require('pdfkit');
import { ManifestData, ManifestOrder, ManifestOrderLine } from './manifest-data.types';

export interface ManifestAssets {
  logoPng: Buffer | null;
  qrPngByOrderId: Map<string, Buffer>;
}

// A4 in points, laid out manually (zero PDFKit margins) so the strict
// pagination rules below (never split a product row, an order never shares
// a page, the next order always starts a fresh page) can be reasoned about
// as plain arithmetic against known y-coordinates.
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const CONTENT_LEFT = 48;
const CONTENT_RIGHT = 547;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;

const CHROME_TOP_TEXT_Y = 24;
const CHROME_TOP_RULE_Y = 38;
const CONTENT_TOP_Y = 50;
const CHROME_BOTTOM_RULE_Y = 800;
const CHROME_BOTTOM_TEXT_Y = 806;
// Last y a content block may start filling from — anything that would cross
// this line triggers a new page instead.
const CONTENT_BOTTOM_Y = 790;

const STOP_BOX_SIZE = 56;
const QR_BOX_HEIGHT = 100;
const QR_IMAGE_SIZE = 90;
const PRODUCT_HEADER_HEIGHT = 20;
const PRODUCT_ROW_HEIGHT = 22;
const PRODUCT_COL_QTY_WIDTH = 60;
const OVERVIEW_ROW_HEIGHT = 24;
const OVERVIEW_COL = { stop: 30, customer: 160, town: 110, postcode: 70 };

export async function buildManifestPdf(
  data: ManifestData,
  assets: ManifestAssets,
  generatedAt: Date,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: [PAGE_WIDTH, PAGE_HEIGHT],
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    bufferPages: true,
    autoFirstPage: false,
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.addPage();
  drawOverviewPage(doc, data, assets, generatedAt);

  // Every order unconditionally starts a fresh page — never conditional on
  // remaining space on the previous order's last page. This is the direct
  // implementation of "the next order always begins on a new page."
  for (const order of data.orders) {
    doc.addPage();
    drawOrderFirstPage(doc, order, assets);
  }

  stampChrome(doc, data, generatedAt);

  doc.end();
  return finished;
}

function ensureSpace(
  doc: PDFKit.PDFDocument,
  y: number,
  height: number,
  onNewPage: () => number,
): number {
  if (y + height > CONTENT_BOTTOM_Y) {
    doc.addPage();
    return onNewPage();
  }
  return y;
}

// ─── page 1: header + run overview ─────────────────────────────────────────

function drawOverviewPage(
  doc: PDFKit.PDFDocument,
  data: ManifestData,
  assets: ManifestAssets,
  generatedAt: Date,
): void {
  let y = drawManifestHeaderBlock(doc, data, assets, generatedAt);
  y = drawInstructionsBox(doc, y);

  doc.font('Helvetica-Bold').fontSize(11).text('STOPS', CONTENT_LEFT, y, { characterSpacing: 0.5 });
  y += 18;
  y = drawOverviewTableHeader(doc, y);

  for (const order of data.orders) {
    y = ensureSpace(doc, y, OVERVIEW_ROW_HEIGHT, () => drawOverviewTableHeader(doc, CONTENT_TOP_Y));
    drawOverviewRow(doc, y, order);
    y += OVERVIEW_ROW_HEIGHT;
  }
}

function drawManifestHeaderBlock(
  doc: PDFKit.PDFDocument,
  data: ManifestData,
  assets: ManifestAssets,
  generatedAt: Date,
): number {
  const y = CONTENT_TOP_Y;
  const logoW = 90;
  const logoH = 45;
  let titleX = CONTENT_LEFT;

  if (assets.logoPng) {
    doc.image(assets.logoPng, CONTENT_LEFT, y, { fit: [logoW, logoH] });
    titleX = CONTENT_LEFT + logoW + 16;
  }

  doc.font('Helvetica-Bold').fontSize(20).text('DRIVER MANIFEST', titleX, y, { characterSpacing: 0.5 });
  doc.font('Helvetica-Bold').fontSize(14).text(data.runName, titleX, y + 26);

  let cursorY = y + Math.max(logoH, 46) + 16;
  const col2X = CONTENT_LEFT + CONTENT_WIDTH / 2;

  drawMetaField(doc, CONTENT_LEFT, cursorY, 'RUN REFERENCE', data.runReference);
  drawMetaField(doc, col2X, cursorY, 'DRIVER', data.driverName ?? 'Unassigned');
  cursorY += 30;
  drawMetaField(doc, CONTENT_LEFT, cursorY, 'DELIVERY DATE', formatLongDate(data.deliveryDate));
  drawMetaField(doc, col2X, cursorY, 'GENERATED', formatDateTime(generatedAt));
  cursorY += 34;

  return cursorY;
}

function drawMetaField(doc: PDFKit.PDFDocument, x: number, y: number, label: string, value: string): void {
  doc.font('Helvetica').fontSize(8).fillColor('#444')
    .text(label, x, y, { characterSpacing: 0.4 });
  doc.fillColor('#000').font('Helvetica-Bold').fontSize(10.5)
    .text(value, x, y + 11);
}

function drawInstructionsBox(doc: PDFKit.PDFDocument, y: number): number {
  const boxH = 40;
  doc.lineWidth(0.75).rect(CONTENT_LEFT, y, CONTENT_WIDTH, boxH).stroke();
  doc.font('Helvetica-Bold').fontSize(9)
    .text('RUN INSTRUCTIONS', CONTENT_LEFT + 8, y + 6, { characterSpacing: 0.3 });
  doc.font('Helvetica-Oblique').fontSize(9).fillColor('#555')
    .text('No run-level instructions for this run.', CONTENT_LEFT + 8, y + 20);
  doc.fillColor('#000');
  return y + boxH + 16;
}

function drawOverviewTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  const cols = overviewColumnPositions();
  doc.font('Helvetica-Bold').fontSize(9);
  doc.text('STOP', cols.stop, y, { width: OVERVIEW_COL.stop, characterSpacing: 0.3 });
  doc.text('CUSTOMER / LOCATION', cols.customer, y, { width: OVERVIEW_COL.customer, characterSpacing: 0.3 });
  doc.text('TOWN', cols.town, y, { width: OVERVIEW_COL.town, characterSpacing: 0.3 });
  doc.text('POSTCODE', cols.postcode, y, { width: OVERVIEW_COL.postcode, characterSpacing: 0.3 });
  doc.text('ORDER', cols.order, y, { width: CONTENT_RIGHT - cols.order, characterSpacing: 0.3 });
  const ruleY = y + 14;
  doc.lineWidth(1).moveTo(CONTENT_LEFT, ruleY).lineTo(CONTENT_RIGHT, ruleY).stroke();
  return y + 20;
}

function drawOverviewRow(doc: PDFKit.PDFDocument, y: number, order: ManifestOrder): void {
  const cols = overviewColumnPositions();
  doc.font('Helvetica-Bold').fontSize(12).text(String(order.stopNumber), cols.stop, y, { width: OVERVIEW_COL.stop });
  doc.font('Helvetica-Bold').fontSize(10).text(order.customerName, cols.customer, y, { width: OVERVIEW_COL.customer, lineBreak: false, ellipsis: true });
  doc.font('Helvetica').fontSize(10).text(order.address.city ?? '—', cols.town, y, { width: OVERVIEW_COL.town, lineBreak: false, ellipsis: true });
  doc.font('Helvetica-Bold').fontSize(10).text(order.address.postcode ?? '—', cols.postcode, y, { width: OVERVIEW_COL.postcode });
  doc.font('Helvetica').fontSize(10).text(`#${order.orderNumber}`, cols.order, y, { width: CONTENT_RIGHT - cols.order });
  const ruleY = y + OVERVIEW_ROW_HEIGHT - 6;
  doc.lineWidth(0.5).strokeColor('#999').moveTo(CONTENT_LEFT, ruleY).lineTo(CONTENT_RIGHT, ruleY).stroke();
  doc.strokeColor('#000');
}

function overviewColumnPositions() {
  const stop = CONTENT_LEFT;
  const customer = stop + OVERVIEW_COL.stop;
  const town = customer + OVERVIEW_COL.customer;
  const postcode = town + OVERVIEW_COL.town;
  const order = postcode + OVERVIEW_COL.postcode;
  return { stop, customer, town, postcode, order };
}

// ─── order pages ────────────────────────────────────────────────────────────

function drawOrderFirstPage(doc: PDFKit.PDFDocument, order: ManifestOrder, assets: ManifestAssets): void {
  let y = drawStopHeaderBlock(doc, order, CONTENT_TOP_Y);

  if (order.deliveryInstructions) {
    y = drawDeliveryInstructionsBox(doc, y, order.deliveryInstructions);
  }

  // Drawn unconditionally right after the stop header, before any product
  // rows — guarantees the order-number+QR block always has a full page's
  // headroom and can never itself become a page-break candidate. The QR
  // appears exactly once per order, only on this first page.
  y = drawOrderQrBox(doc, y, order, assets);

  drawProductTable(doc, order, y);
}

function drawStopHeaderBlock(doc: PDFKit.PDFDocument, order: ManifestOrder, y: number): number {
  doc.lineWidth(1.25).rect(CONTENT_LEFT, y, STOP_BOX_SIZE, STOP_BOX_SIZE).stroke();
  doc.font('Helvetica-Bold').fontSize(24)
    .text(String(order.stopNumber), CONTENT_LEFT, y + (STOP_BOX_SIZE - 24) / 2, { width: STOP_BOX_SIZE, align: 'center' });

  const textX = CONTENT_LEFT + STOP_BOX_SIZE + 16;
  const textWidth = CONTENT_RIGHT - textX;
  doc.font('Helvetica-Bold').fontSize(16).text(order.customerName, textX, y, { width: textWidth, lineBreak: false, ellipsis: true });

  const addressLine = [order.address.line1, order.address.line2, order.address.city]
    .filter((part): part is string => !!part)
    .join(', ');
  doc.font('Helvetica').fontSize(10.5).text(addressLine || '—', textX, y + 22, { width: textWidth, lineBreak: false, ellipsis: true });

  if (order.address.postcode) {
    doc.font('Helvetica-Bold').fontSize(14).text(order.address.postcode, textX, y + 40, { width: textWidth });
  }

  return y + STOP_BOX_SIZE + 16;
}

function drawDeliveryInstructionsBox(doc: PDFKit.PDFDocument, y: number, text: string): number {
  const padding = 8;
  const textWidth = CONTENT_WIDTH - padding * 2;
  doc.font('Helvetica').fontSize(10.5);
  const textHeight = doc.heightOfString(text, { width: textWidth });
  const boxH = textHeight + 30;

  doc.lineWidth(0.75).rect(CONTENT_LEFT, y, CONTENT_WIDTH, boxH).stroke();
  doc.font('Helvetica-Bold').fontSize(9)
    .text('DELIVERY INSTRUCTIONS', CONTENT_LEFT + padding, y + 6, { characterSpacing: 0.3 });
  doc.font('Helvetica').fontSize(10.5)
    .text(text, CONTENT_LEFT + padding, y + 20, { width: textWidth });

  return y + boxH + 16;
}

function drawOrderQrBox(doc: PDFKit.PDFDocument, y: number, order: ManifestOrder, assets: ManifestAssets): number {
  const padding = 12;
  doc.lineWidth(1.25).rect(CONTENT_LEFT, y, CONTENT_WIDTH, QR_BOX_HEIGHT).stroke();

  doc.font('Helvetica-Bold').fontSize(14).text(`Order ${order.orderNumber}`, CONTENT_LEFT + padding, y + padding);
  if (order.customerReference) {
    doc.font('Helvetica').fontSize(10).fillColor('#333')
      .text(`PO ref: ${order.customerReference}`, CONTENT_LEFT + padding, y + padding + 20);
    doc.fillColor('#000');
  }

  const qrPng = assets.qrPngByOrderId.get(order.orderId);
  if (qrPng) {
    const qrX = CONTENT_RIGHT - padding - QR_IMAGE_SIZE;
    const qrY = y + (QR_BOX_HEIGHT - QR_IMAGE_SIZE) / 2;
    doc.image(qrPng, qrX, qrY, { width: QR_IMAGE_SIZE, height: QR_IMAGE_SIZE });
  }

  return y + QR_BOX_HEIGHT + 16;
}

function drawProductTable(doc: PDFKit.PDFDocument, order: ManifestOrder, startY: number): void {
  let y = startY;
  doc.font('Helvetica-Bold').fontSize(11).text('PRODUCTS', CONTENT_LEFT, y, { characterSpacing: 0.5 });
  y += 18;
  y = drawProductTableHeader(doc, y);

  for (const line of order.lines) {
    y = ensureSpace(doc, y, PRODUCT_ROW_HEIGHT, () => drawContinuationHeader(doc, order));
    drawProductRow(doc, y, line);
    y += PRODUCT_ROW_HEIGHT;
  }
}

// Redrawn at the top of every page an order's product lines continue onto —
// repeats the stop/customer/order-number block, labels the page as a
// continuation, and repeats the product table's column headings, per the
// requirement that a continuation page stay understandable on its own if
// pages get separated. Never draws the QR box (it only ever appears once,
// on the order's first page).
function drawContinuationHeader(doc: PDFKit.PDFDocument, order: ManifestOrder): number {
  let y = drawStopHeaderBlock(doc, order, CONTENT_TOP_Y);
  doc.font('Helvetica-Bold').fontSize(10)
    .text(`ORDER ${order.orderNumber} — CONTINUED`, CONTENT_LEFT, y, { underline: true, characterSpacing: 0.3 });
  y += 20;
  return drawProductTableHeader(doc, y);
}

function drawProductTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  doc.font('Helvetica-Bold').fontSize(9);
  doc.text('PRODUCT', CONTENT_LEFT, y, { characterSpacing: 0.3 });
  doc.text('QTY', CONTENT_RIGHT - PRODUCT_COL_QTY_WIDTH, y, { width: PRODUCT_COL_QTY_WIDTH, align: 'right', characterSpacing: 0.3 });
  const ruleY = y + 14;
  doc.lineWidth(1).moveTo(CONTENT_LEFT, ruleY).lineTo(CONTENT_RIGHT, ruleY).stroke();
  return y + PRODUCT_HEADER_HEIGHT;
}

function drawProductRow(doc: PDFKit.PDFDocument, y: number, line: ManifestOrderLine): void {
  const nameWidth = CONTENT_WIDTH - PRODUCT_COL_QTY_WIDTH - 8;
  doc.font('Helvetica').fontSize(10.5)
    .text(line.productName, CONTENT_LEFT, y, { width: nameWidth, lineBreak: false, ellipsis: true });
  doc.font('Helvetica-Bold').fontSize(11)
    .text(String(line.quantity), CONTENT_RIGHT - PRODUCT_COL_QTY_WIDTH, y, { width: PRODUCT_COL_QTY_WIDTH, align: 'right' });
  const ruleY = y + PRODUCT_ROW_HEIGHT - 6;
  doc.lineWidth(0.25).strokeColor('#999').moveTo(CONTENT_LEFT, ruleY).lineTo(CONTENT_RIGHT, ruleY).stroke();
  doc.strokeColor('#000');
}

// ─── repeating chrome (every page, stamped last) ──────────────────────────

// Run in a final pass, after every page exists, via PDFDocument's
// bufferPages mode — "Page N of M" can't be known until the whole document
// has been laid out, so the chrome is stamped onto each already-drawn page
// rather than drawn inline as pages are added.
function stampChrome(doc: PDFKit.PDFDocument, data: ManifestData, generatedAt: Date): void {
  const range = doc.bufferedPageRange();
  const leftText = `${data.runName} · ${formatShortDate(data.deliveryDate)}`;
  const generatedText = `Generated ${formatDateTime(generatedAt)}`;

  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    const pageLabel = `Page ${i + 1} of ${range.count}`;

    doc.lineWidth(0.5).moveTo(CONTENT_LEFT, CHROME_TOP_RULE_Y).lineTo(CONTENT_RIGHT, CHROME_TOP_RULE_Y).stroke();
    doc.font('Helvetica').fontSize(8);
    doc.text(leftText, CONTENT_LEFT, CHROME_TOP_TEXT_Y, { lineBreak: false });
    doc.text(`${generatedText} · ${pageLabel}`, CONTENT_LEFT, CHROME_TOP_TEXT_Y, { width: CONTENT_WIDTH, align: 'right', lineBreak: false });

    doc.lineWidth(0.5).moveTo(CONTENT_LEFT, CHROME_BOTTOM_RULE_Y).lineTo(CONTENT_RIGHT, CHROME_BOTTOM_RULE_Y).stroke();
    doc.font('Helvetica').fontSize(8);
    doc.text(leftText, CONTENT_LEFT, CHROME_BOTTOM_TEXT_Y, { lineBreak: false });
    doc.text(pageLabel, CONTENT_LEFT, CHROME_BOTTOM_TEXT_Y, { width: CONTENT_WIDTH, align: 'right', lineBreak: false });
  }
}

// ─── formatting ─────────────────────────────────────────────────────────────

function formatLongDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  return d.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

function formatShortDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function formatDateTime(d: Date): string {
  const datePart = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timePart = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${datePart} at ${timePart}`;
}
