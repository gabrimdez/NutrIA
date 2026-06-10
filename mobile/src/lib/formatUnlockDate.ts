/**
 * Muestra la fecha ISO de `unlocked_at` en local (`es-ES`, long year).
 * Si no es parseable, devuelve el string bruto o em dash.
 */
export function formatUnlockDate(iso: string | null | undefined): string {
  if (!iso?.trim()) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
}
