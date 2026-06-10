import { format, isBefore, isSameDay, startOfDay, subDays } from 'date-fns';

/** Debe coincidir con la retención del backend (días de calendario hacia atrás). */
export const DIARY_RETENTION_DAYS = 30;

/** Fecha local como `yyyy-MM-dd` (evita desfase UTC de `toISOString`). */
export function toLocalYmd(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/** Interpreta `yyyy-MM-dd` en hora local (mediodía evita saltos DST). */
export function parseLocalYmd(ymd: string): Date {
  const [y, m, day] = ymd.split('-').map(Number);
  return new Date(y, m - 1, day, 12, 0, 0, 0);
}

export function startOfLocalDay(d: Date): Date {
  return startOfDay(d);
}

/** Primer día que aún puede tener datos / permitir registro (hoy − N). */
export function minDiarySelectableDate(now = new Date()): Date {
  return startOfDay(subDays(now, DIARY_RETENTION_DAYS));
}

export function isDiaryDateBeforeMin(d: Date, now = new Date()): boolean {
  return isBefore(startOfLocalDay(d), minDiarySelectableDate(now));
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return isSameDay(a, b);
}

export function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseLocalYmd(s);
  return !Number.isNaN(d.getTime()) && toLocalYmd(d) === s;
}

/** Params de ruta pueden venir como string o array (Expo Router). */
export function resolvedDiaryYmd(dateParam: string | string[] | undefined): string {
  const raw = Array.isArray(dateParam) ? dateParam[0] : dateParam;
  if (raw && isValidYmd(raw)) return raw;
  return toLocalYmd(new Date());
}
