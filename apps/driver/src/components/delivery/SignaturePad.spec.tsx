import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { SignaturePad, SignaturePadHandle } from './SignaturePad';

// jsdom throws "Not implemented" from getContext and emits it to the console;
// give it a no-op 2D context so the real component mounts quietly.
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ scale: vi.fn() })) as never;
});

interface MockPad {
  opts: Record<string, unknown>;
  fireEndStroke: (empty: boolean) => void;
}

vi.mock('signature_pad', () => {
  class MockSignaturePad {
    listeners: Record<string, Array<() => void>> = {};
    empty = true;
    data: unknown[] = [];

    constructor(
      public canvas: HTMLCanvasElement,
      public opts: Record<string, unknown>,
    ) {
      (globalThis as Record<string, unknown>).__mockPad = this;
    }

    toData() {
      return this.data;
    }
    fromData(d: unknown[]) {
      this.data = d;
    }
    clear() {
      this.empty = true;
      this.data = [];
    }
    isEmpty() {
      return this.empty;
    }
    addEventListener(event: string, cb: () => void) {
      (this.listeners[event] ||= []).push(cb);
    }
    removeEventListener() {}
    off() {}

    fireEndStroke(empty: boolean) {
      this.empty = empty;
      this.data = empty ? [] : [{ points: [{ x: 1, y: 1 }] }];
      (this.listeners.endStroke ?? []).forEach((f) => f());
    }
  }
  return { default: MockSignaturePad };
});

const lastPad = () => (globalThis as Record<string, unknown>).__mockPad as MockPad;

beforeEach(() => {
  delete (globalThis as Record<string, unknown>).__mockPad;
});

describe('SignaturePad', () => {
  it('instantiates signature_pad against the canvas with a navy pen', () => {
    render(<SignaturePad />);

    expect(screen.getByRole('img', { name: 'Signature' })).toBeInTheDocument();
    expect(lastPad().opts.penColor).toBe('#0B1D3A');
  });

  it('reports the empty state to onChange after each stroke', () => {
    const onChange = vi.fn();
    render(<SignaturePad onChange={onChange} />);

    lastPad().fireEndStroke(false);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('exposes captured strokes and a clear() that also reports empty', () => {
    const ref = createRef<SignaturePadHandle>();
    const onChange = vi.fn();
    render(<SignaturePad ref={ref} onChange={onChange} />);

    expect(ref.current!.getData()).toBeNull();

    lastPad().fireEndStroke(false);
    const data = ref.current!.getData();
    expect(data).toMatchObject({ format: 'signature_pad', version: 5 });
    expect(data!.strokes).toHaveLength(1);

    ref.current!.clear();
    expect(onChange).toHaveBeenLastCalledWith(true);
    expect(ref.current!.getData()).toBeNull();
  });
});
