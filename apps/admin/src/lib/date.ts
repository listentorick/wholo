// Local-time-safe date formatter — uses local getters, not toISOString(),
// which would UTC-shift and land on the wrong day west of GMT near
// midnight or across a DST boundary.
export function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
