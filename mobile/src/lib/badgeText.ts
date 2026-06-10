import type { BadgeCatalogItem } from '../types/badges';

const FRIENDLY_CRITERIA_BY_BADGE_ID: Partial<Record<string, string>> = {
  'balanced-week': 'Durante 7 dias, cumple tus macros y tu meta de agua en al menos 6 dias.',
  'macro-goal-hit': 'Cumple tus macros durante 1 dia.',
  'macro-goal-7x': 'Cumple tus macros en 7 dias, aunque no sean seguidos.',
  'water-7-days': 'Registra tu agua durante 7 dias.',
  'water-consistent-14': 'Registra tu agua durante 14 dias. De media, al menos 2 vasos al dia.',
  'weigh-in-weekly-4': 'Registra tu peso en 4 semanas distintas.',
  'progress-review-7d': 'Consulta tu progreso al menos una vez al dia durante 7 dias.',
};

const FRIENDLY_DESCRIPTION_BY_BADGE_ID: Partial<Record<string, string>> = {
  'balanced-week': 'Has mantenido una semana muy equilibrada.',
  'macro-goal-7x': 'Llevas varios dias clavando tus macros.',
  'water-consistent-14': 'Ya tienes un habito constante de hidratacion.',
};

function normalizeBadgeText(raw: string): string {
  return raw
    .replace(/\u00C2/g, '')
    .replace(/â‰¥/g, 'al menos ')
    .replace(/\/d[ií]a/gi, ' al día')
    .replace(/≥/g, 'al menos ')
    .replace(/±\s*10%/g, 'con un margen del 10%')
    .replace(/\(prom\.\)/gi, '(de media)')
    .replace(/prom\./gi, 'de media')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getReadableBadgeCriteria(badge: Pick<BadgeCatalogItem, 'badge_id' | 'unlock_criteria_text'>): string {
  const mapped = FRIENDLY_CRITERIA_BY_BADGE_ID[badge.badge_id];
  if (mapped) return mapped;
  return normalizeBadgeText(badge.unlock_criteria_text);
}

export function getReadableBadgeDescription(badge: Pick<BadgeCatalogItem, 'badge_id' | 'description'>): string {
  const mapped = FRIENDLY_DESCRIPTION_BY_BADGE_ID[badge.badge_id];
  if (mapped) return mapped;
  return normalizeBadgeText(badge.description);
}
