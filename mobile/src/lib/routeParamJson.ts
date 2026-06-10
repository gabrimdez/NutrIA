function firstParamValue(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}

export function parseJsonRouteParam<T>(value: unknown, maxEncodedLength: number): T | null {
  const raw = firstParamValue(value);
  if (!raw || raw.length > maxEncodedLength) return null;
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.length > maxEncodedLength) return null;
    return JSON.parse(decoded) as T;
  } catch {
    return null;
  }
}

export function finiteNumber(value: unknown, fallback = 0, min?: number, max?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  let out = value;
  if (typeof min === 'number') out = Math.max(min, out);
  if (typeof max === 'number') out = Math.min(max, out);
  return out;
}
