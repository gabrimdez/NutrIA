import type { ImageSourcePropType } from 'react-native';
import type { MealEntry, MealItem } from '../types';

/** Asset para filas / héroe cuando el nombre coincide con pipas o semillas de girasol. */
export const MEAL_ITEM_SEMILLA_GIRASOL_ASSET: ImageSourcePropType = require('../../assets/images/semilla-de-girasol.png');

const MEAL_ITEM_IMAGE_RULES: [RegExp, ImageSourcePropType][] = [
  [
    /pipas?|semillas?\s+de\s+girasol|semilla\s+de\s+girasol|pipa\s+de\s+girasol|girasol\s+tostad|sunflower(\s+seed)?s?/i,
    MEAL_ITEM_SEMILLA_GIRASOL_ASSET,
  ],
];

export type MealItemVisualIcon =
  | { kind: 'emoji'; emoji: string }
  | { kind: 'image'; source: ImageSourcePropType };

function mealItemImageForLookupLower(n: string): ImageSourcePropType | undefined {
  for (const [re, src] of MEAL_ITEM_IMAGE_RULES) {
    if (re.test(n)) return src;
  }
  return undefined;
}

/**
 * Primera letra en mayúscula (es-ES); el resto se deja igual.
 * Salta espacios iniciales y respeta un primer carácter Unicode (p. ej. surrogate pairs).
 */
export function capitalizeFirstChar(s: string): string {
  const str = s ?? '';
  if (!str) return str;
  let i = 0;
  while (i < str.length && /\s/.test(str[i] as string)) i += 1;
  if (i >= str.length) return str;
  const cp = str.codePointAt(i);
  if (cp === undefined) return str;
  const ch = String.fromCodePoint(cp);
  const up = ch.toLocaleUpperCase('es-ES');
  return str.slice(0, i) + up + str.slice(i + ch.length);
}

/**
 * Título + subtítulo (marca) listos para la UI: icono inicial quitado y primera letra en mayúscula en cada parte.
 */
export function mealItemDisplayPartsForUi(raw: string): { title: string; subtitle?: string } {
  const r = (raw || 'Alimento').trim() || 'Alimento';
  const { title, subtitle } = splitMealItemDisplayName(r);
  const { title: stripped } = stripLeadingMealIconFromTitle(title);
  const base = stripped.trim() || title.trim() || 'Alimento';
  const main = capitalizeFirstChar(base);
  const subRaw = subtitle?.trim();
  const sub = subRaw ? capitalizeFirstChar(subRaw) : undefined;
  return { title: main, subtitle: sub };
}

/** Una sola línea para listas/modales (título — subtítulo si hay marca). */
export function mealItemDisplayLineForUi(raw: string): string {
  const { title, subtitle } = mealItemDisplayPartsForUi(raw);
  return subtitle ? `${title} — ${subtitle}` : title;
}

/** Separa "Nombre — marca", "Nombre · marca" o "Nombre | marca" en título + subtítulo (marca). */
export function splitMealItemDisplayName(raw: string): { title: string; subtitle?: string } {
  const s = (raw || 'Alimento').trim() || 'Alimento';
  const parts = s.split(/\s*[—·|]\s*/).filter((p) => p.length > 0);
  if (parts.length >= 2) {
    return { title: parts[0], subtitle: parts.slice(1).join(' · ') };
  }
  return { title: s };
}

/** Un emoji inicial (p. ej. icono de receta «🧀 Nombre») + espacios opcionales (también «🥪Bocata» sin espacio). */
const LEADING_MEAL_ICON =
  /^((?:\p{Extended_Pictographic})(?:\u200D(?:\p{Extended_Pictographic}))*(?:\uFE0F)?)\s*/u;

/**
 * Separa un posible icono inicial del título (p. ej. `🧀 Bocata` → icono + `Bocata`).
 * Si tras quitar el icono no queda texto, no se modifica el título.
 */
export function stripLeadingMealIconFromTitle(s: string): { icon: string | null; title: string } {
  const t = (s || '').trim();
  if (!t) return { icon: null, title: s };
  const m = t.match(LEADING_MEAL_ICON);
  if (!m) return { icon: null, title: t };
  const icon = m[1];
  const rest = t.slice(m[0].length).trim();
  if (!rest) return { icon: null, title: t };
  return { icon, title: rest };
}

/**
 * Nombre guardado en el ítem con emoji inicial: icono explícito (p. ej. alimento creado) o heurística.
 * Si el nombre ya lleva icono al inicio, no se duplica.
 */
export function mealItemCustomNameWithLeadingIcon(rawName: string, explicitIcon?: string | null): string {
  const name = (rawName || 'Alimento').trim() || 'Alimento';
  const { icon: already } = stripLeadingMealIconFromTitle(name);
  if (already) return name;
  if (mealItemVisualIconForLookupName(name).kind === 'image') return name;
  const emoji = (explicitIcon?.trim() || mealItemEmoji(name));
  return `${emoji} ${name}`.trim();
}

/** Marca/distribuidor por defecto en cabeceras de detalle cuando el ítem no trae marca en el nombre. */
export const MEAL_ITEM_GENERIC_BRAND = 'Alimento general';

/**
 * Título y “distribuidor” para la cabecera tipo ficha de alimento: primer ítem comido (o el primero).
 * El distribuidor sale del sufijo tras — · | en `custom_name`; si no hay, `MEAL_ITEM_GENERIC_BRAND`.
 */
/** Índice del ítem principal (primero comido, o el primero). Sin ítems: -1. */
export function primaryMealItemIndex(meal: MealEntry): number {
  const items = meal.items ?? [];
  if (!items.length) return -1;
  const i = items.findIndex((it) => it.eaten !== false);
  return i >= 0 ? i : 0;
}

export function mealPreviewPrimaryFoodLabels(meal: MealEntry): { foodTitle: string; distributor: string } {
  const items = meal.items ?? [];
  const idx = primaryMealItemIndex(meal);
  const primary = idx >= 0 ? items[idx] : undefined;
  if (!primary) {
    const fallback = mealDisplayTitle(meal).trim() || 'Alimento';
    return { foodTitle: capitalizeFirstChar(fallback), distributor: MEAL_ITEM_GENERIC_BRAND };
  }
  const raw = (primary.custom_name || 'Alimento').trim() || 'Alimento';
  const { title, subtitle } = mealItemDisplayPartsForUi(raw);
  const distributor = subtitle?.trim() ? subtitle : MEAL_ITEM_GENERIC_BRAND;
  return { foodTitle: title, distributor };
}

const EMOJI_RULES: [RegExp, string][] = [
  // Preparados frecuentes antes que ingredientes genéricos (p. ej. «bocata lomo queso» → 🥪, no 🧀)
  [/s[aá]ndwich|bocadillo|bocata|sub/i, '🥪'],
  // Lácteos y derivados
  [/yogur|yoghurt|yogurt|griego/i, '🥛'],
  [/leche|milk/i, '🥛'],
  [/queso|cheese/i, '🧀'],
  [/mantequilla|butter/i, '🧈'],
  [/helado|ice cream/i, '🍦'],
  // Proteínas animales
  [/pollo|chicken|pechuga|muslo|pavo|turkey/i, '🍗'],
  [/huevo|egg|tortilla francesa/i, '🥚'],
  [/carne|ternera|beef|filete|solomillo|entrecot/i, '🥩'],
  [/cerdo|pork|jam[oó]n|bacon|panceta|chorizo|salchich/i, '🥓'],
  [/salm[oó]n|salmon/i, '🐟'],
  [/pescado|at[uú]n|tuna|merluza|lubina|dorada|bacalao|sardina|anchoa|trucha|gambas|langostino|camar[oó]n|marisco|calamar|pulpo|sepia|mejill[oó]n/i, '🐟'],
  [/hamburguesa|burger/i, '🍔'],
  // Cereales y granos
  [/arroz|rice/i, '🍚'],
  [/pan|bread|tostada|tostad|chapata|bagel|baguette/i, '🍞'],
  [/avena|oat|porridge|granola|muesli|cereal/i, '🥣'],
  [/pasta|espagueti|macarron|tallarines|fideo|lasaña|ravioli|ñoqui|gnocchi/i, '🍝'],
  [/tortita|pancake|crepe|cr[eê]pe|waffle|gofre/i, '🥞'],
  [/galleta|cookie|biscuit/i, '🍪'],
  // Frutas (específicas primero)
  [/pl[aá]tano|banana/i, '🍌'],
  [/fresa|frambues|ar[aá]ndano|mora|berry|berries/i, '🍓'],
  [/naranja|mandarina|orange|clementina|pomelo/i, '🍊'],
  [/manzana|apple/i, '🍎'],
  [/pera|pear/i, '🍐'],
  [/sand[ií]a|watermelon/i, '🍉'],
  [/mel[oó]n|melon/i, '🍈'],
  [/melocot[oó]n|durazno|peach|nectarina|albaricoque/i, '🍑'],
  [/uva|grape/i, '🍇'],
  [/pi[nñ]a|pineapple/i, '🍍'],
  [/cereza|cherry/i, '🍒'],
  [/kiwi/i, '🥝'],
  [/lim[oó]n|lime|lima/i, '🍋'],
  [/mango/i, '🥭'],
  [/coco|coconut/i, '🥥'],
  // Verduras y hortalizas
  [/aguacate|avocado/i, '🥑'],
  [/tomate|tomato/i, '🍅'],
  [/ensalada|salad|c[eé]sar|cesar|lechuga|canónigo/i, '🥗'],
  [/patata|potato|boniato|batata/i, '🥔'],
  [/zanahoria|carrot/i, '🥕'],
  [/br[oó]coli|broccoli|coliflor/i, '🥦'],
  [/espinaca|spinach|acelga|kale/i, '🥬'],
  [/ma[ií]z|corn|elote/i, '🌽'],
  [/pimiento|pepper|jalape[nñ]o|chile/i, '🌶️'],
  [/cebolla|onion|puerro|chalota/i, '🧅'],
  [/ajo|garlic/i, '🧄'],
  [/seta|champi[nñ][oó]n|mushroom/i, '🍄'],
  [/pepino|cucumber/i, '🥒'],
  [/berenjena|eggplant/i, '🍆'],
  [/jud[ií]a|alubia|lenteja|garbanzo|legumbre|bean|lentil|chickpea/i, '🫘'],
  [/guisante|pea/i, '🫛'],
  // Frutos secos y semillas
  [/almendra|nuez|caca[h]?uete|peanut|walnut|almond|pistacho|anacardo|avellana|frutos?\s*secos/i, '🥜'],
  [/semillas?\s+de\s+ch[ií]a|semillas?\s+de\s+lino/i, '🥜'],

  // Bebidas
  [/caf[eé]|coffee|espresso|capuccino|latte/i, '☕'],
  [/t[eé]\s|tea|infusi[oó]n|manzanilla/i, '🍵'],
  [/batido|shake|smoothie/i, '🥤'],
  [/zumo|juice|jugo/i, '🧃'],
  [/agua|water/i, '💧'],
  // Comidas preparadas
  [/pizza/i, '🍕'],
  [/taco|burrito|fajita|quesadilla|enchilada|nachos/i, '🌮'],
  [/wrap|kebab|d[oö]ner|shawarma/i, '🥙'],
  [/sushi|maki|nigiri|sashimi/i, '🍣'],
  [/sopa|caldo|crema de|gazpacho|pur[eé]/i, '🍜'],
  [/guiso|estofado|potaje|cocido|stew/i, '🍲'],
  [/curry/i, '🍛'],
  // Dulces y postres
  [/chocolate|cacao/i, '🍫'],
  [/tarta|pastel|cake|bizcocho|magdalena|muffin|donut|rosquilla/i, '🍰'],
  [/caramelo|candy|gominola|chuche/i, '🍬'],
  [/croissant|cruasan/i, '🥐'],
  // Condimentos y extras
  [/aceite|olive oil|oliva/i, '🫒'],
  [/miel|honey/i, '🍯'],
  [/sal\b|salt/i, '🧂'],
  // Fallback genérico
  [/frut/i, '🍎'],
];

/** Icono para un nombre ya “de UI” (p. ej. título sin marca): emoji o imagen (pipas / girasol). */
export function mealItemVisualIconForLookupName(name: string): MealItemVisualIcon {
  const n = (name || '').toLowerCase();
  const img = mealItemImageForLookupLower(n);
  if (img) return { kind: 'image', source: img };
  for (const [re, emoji] of EMOJI_RULES) {
    if (re.test(n)) return { kind: 'emoji', emoji };
  }
  return { kind: 'emoji', emoji: '🍽️' };
}

/** Solo emoji (texto); si aplica imagen custom, cadena vacía — usar `mealItemVisualIconForLookupName` + `MealItemIconMedia`. */
export function mealItemEmoji(name: string): string {
  const v = mealItemVisualIconForLookupName(name);
  return v.kind === 'emoji' ? v.emoji : '';
}

/** Orden fijo de momentos del día en la UI del diario. */
export const MEAL_TYPES_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealTypeOrderKey = (typeof MEAL_TYPES_ORDER)[number];

export function mealTypeLabel(mealType: string): string {
  const labels: Record<string, string> = {
    breakfast: 'Desayuno',
    lunch: 'Comida',
    dinner: 'Cena',
    snack: 'Snack',
  };
  return labels[mealType] || 'Comida';
}

export function parseMealTypeParam(raw: string | string[] | undefined): MealTypeOrderKey {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === 'breakfast' || v === 'lunch' || v === 'dinner' || v === 'snack') return v;
  return 'lunch';
}

const TYPE_EMOJI: Record<string, string> = {
  breakfast: '🥣',
  lunch: '🍗',
  dinner: '🥗',
  snack: '🥤',
};

export function mealEmoji(meal: MealEntry): string {
  const t = (meal.title || '').toLowerCase();
  if (/avena|oat/i.test(t)) return '🥣';
  if (/pollo|chicken|pechuga/i.test(t)) return '🍗';
  if (/ensalada|salad|césar|cesar/i.test(t)) return '🥗';
  if (/batido|shake|prote[ií]n/i.test(t)) return '🥤';
  return TYPE_EMOJI[meal.meal_type] || '🍽️';
}

/** Emoji de la fila de comida: primer alimento registrado; si no hay ítems, misma heurística que `mealEmoji`. */
export function mealLeadingVisual(meal: MealEntry): MealItemVisualIcon {
  const first = meal.items?.[0];
  if (first) {
    const raw = (first.custom_name || 'Alimento').trim();
    const { icon: fromRaw } = stripLeadingMealIconFromTitle(raw);
    if (fromRaw) return { kind: 'emoji', emoji: fromRaw };
    const { title } = splitMealItemDisplayName(raw);
    const { icon, title: stripped } = stripLeadingMealIconFromTitle(title);
    if (icon) return { kind: 'emoji', emoji: icon };
    return mealItemVisualIconForLookupName(stripped);
  }
  return { kind: 'emoji', emoji: mealEmoji(meal) };
}

/** Compatibilidad solo-emoji; para pipas/girasol usar `mealLeadingVisual` y `MealItemIconMedia`. */
export function mealLeadingEmoji(meal: MealEntry): string {
  const v = mealLeadingVisual(meal);
  return v.kind === 'emoji' ? v.emoji : '';
}

export function mealDisplayTitle(meal: MealEntry): string {
  if (meal.title?.trim()) return capitalizeFirstChar(meal.title.trim());
  return mealTypeLabel(meal.meal_type);
}

export function formatMealTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('es-ES', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return '';
  }
}

/** Genera titulo combinado: 2 items "A con B", 3+ items "A, B y C". */
export function combinedMealTitle(items: MealItem[]): string {
  const names = items.map((it) => {
    const raw = (it.custom_name || 'Alimento').trim() || 'Alimento';
    return mealItemDisplayPartsForUi(raw).title;
  });
  if (names.length === 0) return 'Comida';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} con ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}
