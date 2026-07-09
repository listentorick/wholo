// Dependency-free normalized string similarity (0-1) for fuzzy name
// matching. No fuzzy-matching library exists in this repo's dependency
// tree — not worth adding one for a single distance function.
function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const distances: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) distances[i][0] = i;
  for (let j = 0; j < cols; j += 1) distances[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      distances[i][j] = Math.min(
        distances[i - 1][j] + 1,
        distances[i][j - 1] + 1,
        distances[i - 1][j - 1] + cost,
      );
    }
  }

  return distances[rows - 1][cols - 1];
}

// 1 = identical (after normalizing case/punctuation/whitespace), 0 = nothing
// in common. Both empty is treated as identical; one empty is treated as
// completely dissimilar.
export function similarity(a: string, b: string): number {
  const normA = normalize(a);
  const normB = normalize(b);
  if (normA === '' && normB === '') return 1;
  if (normA === '' || normB === '') return 0;

  const distance = levenshteinDistance(normA, normB);
  const maxLength = Math.max(normA.length, normB.length);
  return 1 - distance / maxLength;
}
