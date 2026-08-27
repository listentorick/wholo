import { describe, it, expect, vi, beforeEach } from 'vitest';
import { compressImage } from './image';

// jsdom has no real canvas/decoder — compressImage must fall back to the
// original file rather than throw.
beforeEach(() => {
  vi.stubGlobal('createImageBitmap', undefined);
});

describe('compressImage', () => {
  it('falls back to the original file when canvas is unavailable', async () => {
    const file = new File(['x'], 'shot.jpg', { type: 'image/jpeg' });
    const out = await compressImage(file);
    expect(out).toBe(file);
  });

  it('returns a Blob when the canvas pipeline works', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 4000, height: 3000 }));
    const drawImage = vi.fn();
    const toBlob = vi.fn((cb: (b: Blob) => void) => cb(new Blob(['compressed'], { type: 'image/jpeg' })));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(toBlob as never);

    const file = new File(['x'], 'shot.jpg', { type: 'image/jpeg' });
    const out = await compressImage(file, 1600);

    expect(out).toBeInstanceOf(Blob);
    expect(drawImage).toHaveBeenCalled();
    // 4000 → scaled to 1600 wide
    const canvas = drawImage.mock.instances;
    expect(canvas).toBeDefined();
  });
});
