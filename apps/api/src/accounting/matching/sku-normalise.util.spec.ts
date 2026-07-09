import { normalizeSku } from './sku-normalise.util';

describe('normalizeSku', () => {
  it('lowercases', () => {
    expect(normalizeSku('CAB-SAUV-001')).toBe('cabsauv001');
  });

  it('strips whitespace, dashes and underscores', () => {
    expect(normalizeSku(' cab sauv_001 ')).toBe('cabsauv001');
    expect(normalizeSku('CAB-SAUV-001')).toBe(normalizeSku('cab_sauv 001'));
  });

  it('preserves genuinely different codes as different', () => {
    expect(normalizeSku('CAB-SAUV-001')).not.toBe(normalizeSku('CAB-SAV-001'));
    expect(normalizeSku('CHARD-2023')).not.toBe(normalizeSku('CHARD-2024'));
    expect(normalizeSku('MERLOT-CASE')).not.toBe(normalizeSku('MERLOT-BOTTLE'));
  });
});
