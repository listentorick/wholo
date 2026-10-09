import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SignatureDto } from '../delivery-links/dto/submit-outcome.dto';
import { PROOF_PHOTOS, SIGNATURE_HEIGHT, SIGNATURE_WIDTH, buildSignature, deliveryEvidence, recipientsFor } from './demo-delivery-evidence.plan';

const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_DAY = Date.UTC(2026, 3, 1);

/** Half a year of drops for sixty customers, each in a town the plan knows. */
const drops = Array.from({ length: 60 }, (_, customerIndex) => customerIndex).flatMap((customerIndex) =>
  Array.from({ length: 60 }, (_, n) => {
    const deliveryDate = new Date(FIRST_DAY + n * 3 * DAY_MS);
    const recordedAt = new Date(deliveryDate.getTime() + 9 * 60 * 60 * 1000);
    return { input: { customerIndex, deliveryDate, recordedAt, city: 'Leeds' }, evidence: deliveryEvidence({ customerIndex, deliveryDate, recordedAt, city: 'Leeds' }) };
  }),
);
const handed = drops.filter((d) => d.evidence.dropMethod === 'HANDED_TO_PERSON');
const left = drops.filter((d) => d.evidence.dropMethod === 'LEFT_IN_SAFE_LOCATION');
const photoNamed = (name: string) => PROOF_PHOTOS.find((p) => p.name === name);

describe('deliveryEvidence', () => {
  it('gives the same drop the same evidence every time', () => {
    const { input, evidence } = drops[123];
    expect(deliveryEvidence({ ...input })).toEqual(evidence);
  });

  it('has most orders signed for and the rest left in a safe place', () => {
    const share = handed.length / drops.length;
    expect(share).toBeGreaterThan(0.7);
    expect(share).toBeLessThan(0.9);
    expect(left.length).toBeGreaterThan(0);
  });

  it('records who took in a handed-over order, with their signature', () => {
    for (const { input, evidence } of handed) {
      expect(recipientsFor(input.customerIndex)).toContain(evidence.recipientName);
      expect(evidence.signature).not.toBeNull();
    }
  });

  it('records where an unattended order was left, with no recipient or signature', () => {
    for (const { evidence } of left) {
      expect(evidence.recipientName).toBeNull();
      expect(evidence.signature).toBeNull();
      expect(evidence.notes).toBeTruthy();
    }
  });

  it('backs every drop with a photo of that kind of drop', () => {
    for (const { evidence } of drops) expect(photoNamed(evidence.photo)?.dropMethod).toBe(evidence.dropMethod);
    for (const photo of PROOF_PHOTOS) expect(drops.some((d) => d.evidence.photo === photo.name)).toBe(true);
  });

  it('places the driver at the same premises on every visit to a customer, usually with a fix', () => {
    const fixes = drops.filter((d) => d.input.customerIndex === 7 && d.evidence.location).map((d) => d.evidence.location!);
    expect(fixes.length).toBeGreaterThan(40);
    for (const fix of fixes) {
      // Within a few tens of metres of the first fix, and inside Leeds.
      expect(Math.abs(fix.latitude - fixes[0].latitude)).toBeLessThan(0.0005);
      expect(Math.abs(fix.longitude - fixes[0].longitude)).toBeLessThan(0.001);
      expect(Math.abs(fix.latitude - 53.7997)).toBeLessThan(0.01);
      expect(fix.accuracyM).toBeGreaterThan(0);
    }
    expect(drops.some((d) => d.evidence.location === null)).toBe(true);
  });

  it('has no location for an address in a town it does not know', () => {
    const { input } = drops[0];
    expect(deliveryEvidence({ ...input, city: 'Atlantis' }).location).toBeNull();
    expect(deliveryEvidence({ ...input, city: null }).location).toBeNull();
  });
});

describe('buildSignature', () => {
  const signedAt = new Date('2026-10-07T09:30:00.000Z');
  const signature = buildSignature('Hannah Whitaker', 1, signedAt);
  const points = signature.strokes.flatMap((s) => s.points);

  it('is a signature the delivery endpoint accepts', async () => {
    for (const { evidence } of handed.slice(0, 200)) {
      expect(await validate(plainToInstance(SignatureDto, evidence.signature))).toEqual([]);
      // The service's cap on the stored blob (delivery-links.service.ts MAX_SIGNATURE_BYTES).
      expect(JSON.stringify(evidence.signature).length).toBeLessThan(90_000);
    }
  });

  it('stays on the driver app\'s signature canvas', () => {
    expect(signature.width).toBe(SIGNATURE_WIDTH);
    expect(signature.height).toBe(SIGNATURE_HEIGHT);
    for (const { evidence } of handed) {
      for (const point of evidence.signature!.strokes.flatMap((s) => s.points)) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(SIGNATURE_WIDTH);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(SIGNATURE_HEIGHT);
      }
    }
  });

  it('is written as a stroke per word and an underline, pen moving forward in time until just before it was recorded', () => {
    expect(signature.strokes).toHaveLength(3);
    for (const stroke of signature.strokes) expect(stroke.points.length).toBeGreaterThan(5);
    for (let n = 1; n < points.length; n++) expect(points[n].time).toBeGreaterThan(points[n - 1].time);
    expect(points[points.length - 1].time).toBeLessThan(signedAt.getTime());
  });

  it('keeps a person\'s signature the same shape from one day to the next, and different from someone else\'s', () => {
    const shape = (name: string, variation: number) => {
      const all = buildSignature(name, variation, signedAt).strokes.flatMap((s) => s.points);
      const xs = all.map((p) => p.x);
      const ys = all.map((p) => p.y);
      return { count: all.length, width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    };
    const monday = shape('Hannah Whitaker', 1);
    const tuesday = shape('Hannah Whitaker', 2);
    expect(tuesday.count).toBe(monday.count);
    expect(Math.abs(tuesday.width - monday.width) / monday.width).toBeLessThan(0.15);
    expect(Math.abs(tuesday.height - monday.height) / monday.height).toBeLessThan(0.15);
    expect(buildSignature('Hannah Whitaker', 2, signedAt)).not.toEqual(buildSignature('Hannah Whitaker', 1, signedAt));
    expect(shape('Tom Ellis', 1).count).not.toBe(monday.count);
  });
});
