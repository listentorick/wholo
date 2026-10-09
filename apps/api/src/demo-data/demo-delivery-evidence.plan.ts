// What the driver captured at the door for each delivered order in the demo
// story (demo-story.plan.ts): who took it in and their signature, or where it
// was left; a proof photo; and the device's location.
//
// Pure and I/O-free like the story itself: everything comes from a hash of the
// customer and the delivery day, so the same drop gets the same evidence on
// every run. The photos themselves are the files in scripts/demo-proof-photos;
// scripts/seed-demo-dashboards.ts uploads them and writes the rows.

import { rand } from './demo-story.plan';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The driver app's signature canvas on a phone (SignaturePad.tsx: full width, h-64), in CSS pixels. */
export const SIGNATURE_WIDTH = 358;
export const SIGNATURE_HEIGHT = 256;

export type DemoDropMethod = 'HANDED_TO_PERSON' | 'LEFT_IN_SAFE_LOCATION';

export interface DemoProofPhoto {
  /** File name (without extension) in scripts/demo-proof-photos. */
  name: string;
  dropMethod: DemoDropMethod;
  /** What the driver wrote when the photo shows where the order was left. */
  note: string | null;
}

/** The pool every delivery's proof photo is drawn from — a photo only ever backs the kind of drop it shows. */
export const PROOF_PHOTOS: DemoProofPhoto[] = [
  { name: 'handed-wine-box', dropMethod: 'HANDED_TO_PERSON', note: null },
  { name: 'handed-carton', dropMethod: 'HANDED_TO_PERSON', note: null },
  { name: 'left-front-door', dropMethod: 'LEFT_IN_SAFE_LOCATION', note: 'Nobody front of house yet — left inside the side door as agreed with the manager.' },
  { name: 'left-cases-stacked', dropMethod: 'LEFT_IN_SAFE_LOCATION', note: 'Stacked in the back store as agreed.' },
  { name: 'left-cellar', dropMethod: 'LEFT_IN_SAFE_LOCATION', note: 'Taken down to the cellar and left with the rest of the stock.' },
];

const HANDED_NOTES = ['Checked off against the delivery note.', 'Carried through to the bar.', 'Empties collected.'];

const FIRST_NAMES = [
  'Hannah', 'Tom', 'Priya', 'Callum', 'Sophie', 'Marek', 'Aisha', 'Ben', 'Lucy', 'Darren', 'Megan', 'Josh',
  'Elena', 'Craig', 'Niamh', 'Ravi', 'Kate', 'Liam', 'Zofia', 'Sam', 'Holly', 'Imran', 'Beth', 'Owen',
];
const LAST_NAMES = [
  'Whitaker', 'Ellis', 'Sharma', 'Booth', 'Hargreaves', 'Nowak', 'Khan', 'Atkinson', 'Firth', 'Pickles', 'Dobson', 'Marsden',
  'Rossi', 'Sykes', 'Byrne', 'Patel', 'Holroyd', 'Kaye', 'Kowalski', 'Thackray', 'Lister', 'Hussain', 'Crowther', 'Metcalfe',
];

/** Town centres the demo customers' addresses name. A customer's premises sit a few hundred metres from one. */
const TOWN_CENTRES: Record<string, { latitude: number; longitude: number }> = {
  Leeds: { latitude: 53.7997, longitude: -1.5492 },
  York: { latitude: 53.96, longitude: -1.0873 },
  Harrogate: { latitude: 53.9921, longitude: -1.5418 },
  Skipton: { latitude: 53.962, longitude: -2.017 },
  Ilkley: { latitude: 53.925, longitude: -1.822 },
  Wetherby: { latitude: 53.928, longitude: -1.387 },
  Ripon: { latitude: 54.138, longitude: -1.524 },
  Malton: { latitude: 54.136, longitude: -0.798 },
  Wakefield: { latitude: 53.6833, longitude: -1.4977 },
  Manchester: { latitude: 53.4808, longitude: -2.2426 },
  Birmingham: { latitude: 52.4862, longitude: -1.8904 },
  Bristol: { latitude: 51.4545, longitude: -2.5879 },
};

export interface DemoSignaturePoint {
  x: number;
  y: number;
  pressure: number;
  time: number;
}

/** One pen stroke, as signature_pad v5's toData() gives it. */
export interface DemoSignatureStroke {
  penColor: string;
  dotSize: number;
  minWidth: number;
  maxWidth: number;
  velocityFilterWeight: number;
  compositeOperation: 'source-over';
  points: DemoSignaturePoint[];
}

/** The stroke-vector blob the driver app submits and order_delivery_outcomes.signature stores. */
export interface DemoSignature {
  format: 'signature_pad';
  version: 5;
  width: number;
  height: number;
  strokes: DemoSignatureStroke[];
}

export interface DemoLocation {
  latitude: number;
  longitude: number;
  accuracyM: number;
}

export interface DemoEvidence {
  dropMethod: DemoDropMethod;
  recipientName: string | null;
  notes: string | null;
  signature: DemoSignature | null;
  /** A PROOF_PHOTOS name. */
  photo: string;
  /** Null when the device got no fix. */
  location: DemoLocation | null;
}

export interface DemoEvidenceInput {
  customerIndex: number;
  deliveryDate: Date;
  /** When the drop was recorded: the signature's pen times lead up to it. */
  recordedAt: Date;
  /** The delivery address's town. An unrecognised one gives no location. */
  city: string | null;
}

const pick = <T>(options: T[], roll: number): T => options[Math.floor(roll * options.length)];
const round1 = (value: number): number => Math.round(value * 10) / 10;
const nameKey = (name: string): number => [...name].reduce((key, char) => (Math.imul(key, 31) + char.charCodeAt(0)) | 0, 7);

/** The two people at a venue who take deliveries in; the first signs for most of them. */
export function recipientsFor(customerIndex: number): [string, string] {
  const first = Math.floor(rand(customerIndex, 21) * FIRST_NAMES.length);
  const last = Math.floor(rand(customerIndex, 22) * LAST_NAMES.length);
  const name = (offset: number): string => `${FIRST_NAMES[(first + offset) % FIRST_NAMES.length]} ${LAST_NAMES[(last + offset * 5) % LAST_NAMES.length]}`;
  return [name(0), name(7)];
}

const ASCENDERS = 'bdfhklt';
const DESCENDERS = 'gjpqy';

/**
 * A handwritten-looking signature for a name: a joined-up run of loops per word, tall for the capital
 * and the ascenders and dipping below the line for the descenders, then an underline. The name fixes
 * the shape, so a person's signature is recognisably theirs each time; `variation` only nudges its
 * size and position the way a hand does from one day to the next.
 */
export function buildSignature(name: string, variation: number, signedAt: Date): DemoSignature {
  const key = nameKey(name);
  const words = name.split(/\s+/).filter(Boolean);
  const letters = words.reduce((total, word) => total + word.length, 0);

  const scale = 0.94 + 0.12 * rand(key, variation, 1);
  const left = 34 + 14 * rand(key, variation, 2);
  const baseline = 146 + 14 * rand(key, variation, 3);
  const rise = 0.04 + 0.07 * rand(key, 4);
  const slant = 0.18 + 0.2 * rand(key, 5);
  const wordGap = 16 * scale;
  const letterWidth = Math.min(20, (SIGNATURE_WIDTH - 96 - wordGap * (words.length - 1)) / letters) * scale;

  let time = signedAt.getTime() - 9000;
  const stroke = (points: DemoSignaturePoint[]): DemoSignatureStroke => ({
    penColor: '#0B1D3A', dotSize: 0, minWidth: 0.5, maxWidth: 2.5, velocityFilterWeight: 0.7, compositeOperation: 'source-over', points,
  });
  const point = (x: number, y: number, pause: number): DemoSignaturePoint => {
    time += pause;
    return {
      x: round1(Math.min(SIGNATURE_WIDTH - 4, Math.max(4, x))),
      y: round1(Math.min(SIGNATURE_HEIGHT - 4, Math.max(4, y))),
      pressure: 0.5,
      time,
    };
  };

  const strokes: DemoSignatureStroke[] = [];
  let cursor = left;
  words.forEach((word, wordIndex) => {
    const points: DemoSignaturePoint[] = [];
    const steps = 9;
    [...word.toLowerCase()].forEach((char, n) => {
      const quirk = rand(key, wordIndex, n, 6);
      const tall = n === 0 || ASCENDERS.includes(char);
      const dips = n > 0 && DESCENDERS.includes(char);
      // Past the first few letters a signature trails off into a squiggle.
      const fade = Math.max(0.5, 1 - 0.1 * Math.max(0, n - 2));
      const height = (n === 0 ? 56 + 14 * quirk : tall ? 34 + 12 * quirk : dips ? 30 + 10 * quirk : (9 + 9 * quirk) * fade) * scale;
      const width = letterWidth * (n === 0 ? 1.25 : 0.8 + 0.4 * rand(key, wordIndex, n, 9));
      // Tall letters and tails loop back on themselves; short ones are plain humps.
      const loop = (tall || dips ? 0.42 : 0.12) * width;
      for (let step = n === 0 ? 0 : 1; step <= steps; step++) {
        const t = step / steps;
        const phase = 2 * Math.PI * t;
        const lift = ((dips ? -1 : 1) * height * (1 - Math.cos(phase))) / 2;
        const x = cursor + width * t + loop * Math.sin(phase) + slant * lift;
        const y = baseline - rise * (x - left) - lift + 1.5 * Math.sin(phase * 2 + quirk * 6);
        // The pen slows over the tall letters and hurries along the joins.
        points.push(point(x, y, points.length === 0 ? 260 : (tall || dips ? 11 : 7) + Math.round(6 * rand(key, wordIndex, n * steps + step, 7))));
      }
      cursor += width;
    });
    strokes.push(stroke(points));
    cursor += wordGap;
  });

  // The underline: back along the name, quickly, sagging a little in the middle.
  const right = cursor - wordGap;
  const underline: DemoSignaturePoint[] = [];
  for (let step = 0; step <= 10; step++) {
    const t = step / 10;
    const x = right + 6 - (right - left + 14) * t * (0.7 + 0.25 * rand(key, 8));
    const y = baseline + 30 * scale - rise * (x - left) + 7 * Math.sin(Math.PI * t);
    underline.push(point(x, y, step === 0 ? 220 : 7));
  }
  strokes.push(stroke(underline));

  return { format: 'signature_pad', version: 5, width: SIGNATURE_WIDTH, height: SIGNATURE_HEIGHT, strokes };
}

/** Where the driver's phone said it was: at the customer's premises, give or take, or nowhere if it got no fix. */
function locationFor(customerIndex: number, epochDay: number, city: string | null): DemoLocation | null {
  const centre = city ? TOWN_CENTRES[city] : undefined;
  if (!centre || rand(customerIndex, epochDay, 26) < 0.07) return null;
  const premises = {
    latitude: centre.latitude + (rand(customerIndex, 27) - 0.5) * 0.012,
    longitude: centre.longitude + (rand(customerIndex, 28) - 0.5) * 0.02,
  };
  return {
    latitude: Number((premises.latitude + (rand(customerIndex, epochDay, 29) - 0.5) * 0.0003).toFixed(6)),
    longitude: Number((premises.longitude + (rand(customerIndex, epochDay, 30) - 0.5) * 0.0005).toFixed(6)),
    accuracyM: Math.round(4 + 24 * rand(customerIndex, epochDay, 31)),
  };
}

/** The evidence for one delivered order: four in five are signed for, the rest left where the customer has agreed. */
export function deliveryEvidence(input: DemoEvidenceInput): DemoEvidence {
  const { customerIndex, recordedAt, city } = input;
  const epochDay = Math.round(input.deliveryDate.getTime() / DAY_MS);
  const location = locationFor(customerIndex, epochDay, city);

  if (rand(customerIndex, epochDay, 23) < 0.2) {
    const photo = pick(PROOF_PHOTOS.filter((p) => p.dropMethod === 'LEFT_IN_SAFE_LOCATION'), rand(customerIndex, epochDay, 24));
    return { dropMethod: 'LEFT_IN_SAFE_LOCATION', recipientName: null, notes: photo.note, signature: null, photo: photo.name, location };
  }

  const [usual, cover] = recipientsFor(customerIndex);
  const recipientName = rand(customerIndex, epochDay, 25) < 0.75 ? usual : cover;
  const photo = pick(PROOF_PHOTOS.filter((p) => p.dropMethod === 'HANDED_TO_PERSON'), rand(customerIndex, epochDay, 24));
  const noteRoll = rand(customerIndex, epochDay, 32);
  return {
    dropMethod: 'HANDED_TO_PERSON',
    recipientName,
    notes: noteRoll < 0.3 ? pick(HANDED_NOTES, noteRoll / 0.3) : null,
    signature: buildSignature(recipientName, epochDay, recordedAt),
    photo: photo.name,
    location,
  };
}
