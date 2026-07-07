import { buildProductSearchText, escapeLike, normalise } from './product-search.util';

describe('buildProductSearchText', () => {
  it('concatenates name, sku and description', () => {
    expect(
      buildProductSearchText({
        name: 'Sauvignon Blanc',
        sku: 'SB-001',
        description: 'Crisp and dry',
      }),
    ).toBe('Sauvignon Blanc SB-001 Crisp and dry');
  });

  it('skips null sku and description', () => {
    expect(buildProductSearchText({ name: 'Pinot Noir', sku: null, description: null })).toBe(
      'Pinot Noir',
    );
  });

  it('skips empty and whitespace-only parts', () => {
    expect(buildProductSearchText({ name: 'Pinot Noir', sku: '  ', description: '' })).toBe(
      'Pinot Noir',
    );
  });

  it('trims each part', () => {
    expect(buildProductSearchText({ name: ' Merlot ', sku: ' M-1 ', description: null })).toBe(
      'Merlot M-1',
    );
  });
});

describe('normalise', () => {
  it('lowercases', () => {
    expect(normalise('Sauvignon BLANC')).toBe('sauvignon blanc');
  });

  it('strips accents', () => {
    expect(normalise('Château Margaux Rosé')).toBe('chateau margaux rose');
  });

  it('collapses and trims whitespace', () => {
    expect(normalise('  Pinot   Noir\t2019 ')).toBe('pinot noir 2019');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(normalise('   ')).toBe('');
  });
});

describe('escapeLike', () => {
  it('escapes LIKE wildcards and backslashes', () => {
    expect(escapeLike('100%_pure\\wine')).toBe('100\\%\\_pure\\\\wine');
  });

  it('leaves plain text untouched', () => {
    expect(escapeLike('sauvignon')).toBe('sauvignon');
  });
});
