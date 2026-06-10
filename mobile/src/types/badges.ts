export type BadgeProgress = {
  current: number;
  target?: number | null;
  unit: string;
};

export type BadgeCatalogItem = {
  badge_id: string;
  name: string;
  description: string;
  unlock_criteria_text: string;
  image_url: string | null;
  rarity: string;
  category: string;
  is_active: boolean;
  unlocked: boolean;
  unlocked_at: string | null;
  revoked_at: string | null;
  progress: BadgeProgress | null;
  source: string | null;
};

export type FeaturedBadgeSlot = {
  position: number;
  badge_id: string | null;
  name: string | null;
  image_url: string | null;
};
