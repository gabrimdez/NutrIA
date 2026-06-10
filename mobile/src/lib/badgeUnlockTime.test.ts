import { describe, expect, it } from 'vitest';

import { nextBadgeCursorIso, parseBadgeUnlockTimeMs } from './badgeUnlockTime';

describe('parseBadgeUnlockTimeMs', () => {
  it('treats backend naive timestamps as UTC', () => {
    expect(parseBadgeUnlockTimeMs('2026-04-27T10:30:00')).toBe(
      Date.parse('2026-04-27T10:30:00Z'),
    );
  });

  it('preserves timestamps with an explicit timezone', () => {
    expect(parseBadgeUnlockTimeMs('2026-04-27T10:30:00Z')).toBe(
      Date.parse('2026-04-27T10:30:00Z'),
    );
    expect(parseBadgeUnlockTimeMs('2026-04-27T10:30:00+02:00')).toBe(
      Date.parse('2026-04-27T10:30:00+02:00'),
    );
  });

  it('returns null for empty or invalid values', () => {
    expect(parseBadgeUnlockTimeMs(null)).toBeNull();
    expect(parseBadgeUnlockTimeMs('')).toBeNull();
    expect(parseBadgeUnlockTimeMs('not-a-date')).toBeNull();
  });

  it('advances the recent-badge cursor past the visible unlock millisecond', () => {
    const maxUnlockTimeMs = Date.parse('2026-04-27T10:30:00.123Z');

    expect(nextBadgeCursorIso(maxUnlockTimeMs)).toBe('2026-04-27T10:30:00.124Z');
  });
});
