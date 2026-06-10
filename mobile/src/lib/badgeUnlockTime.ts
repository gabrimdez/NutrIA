const EXPLICIT_TIMEZONE_SUFFIX = /(?:Z|[+-]\d{2}:?\d{2})$/i;

function normalizeBadgeUnlockIso(iso: string): string {
  const trimmed = iso.trim();
  if (!trimmed) return trimmed;
  return EXPLICIT_TIMEZONE_SUFFIX.test(trimmed) ? trimmed : `${trimmed}Z`;
}

export function parseBadgeUnlockTimeMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(normalizeBadgeUnlockIso(iso));
  return Number.isNaN(t) ? null : t;
}

export function nextBadgeCursorIso(maxUnlockTimeMs: number): string {
  return new Date(maxUnlockTimeMs + 1).toISOString();
}
