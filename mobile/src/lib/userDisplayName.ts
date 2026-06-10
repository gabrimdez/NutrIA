/**
 * Primer nombre para saludos: display_name del perfil, o parte local del email.
 * No usa nombres de ejemplo: si no hay datos, devuelve null.
 */
export function greetingFirstName(
  displayName: string | null | undefined,
  email: string | null | undefined,
): string | null {
  const fromProfile = displayName?.trim().split(/\s+/).filter(Boolean)[0];
  if (fromProfile) return fromProfile;

  const local = email?.split('@')[0]?.trim();
  if (!local) return null;

  const segment = local.split(/[._+-]/)[0];
  if (!segment) return null;

  return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
}
