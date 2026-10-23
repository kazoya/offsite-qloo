/**
 * Curated mapping from human-friendly taste picks to Qloo tag URNs.
 * Every id below was verified against GET /v2/tags on the hackathon API (see docs/QLOO_COVERAGE.md).
 * Labels are ours (Arabic/English); Qloo only supplies the URN.
 */

export interface CatalogItem {
  key: string;
  tag: string;
  en: string;
  ar: string;
}

const R = "urn:tag:genre:place:restaurant:";
const P = "urn:tag:genre:place:";
const D = "urn:tag:dietary_option:qloo:";

export const CUISINES: CatalogItem[] = [
  { key: "middle_eastern", tag: R + "middle_eastern", en: "Middle Eastern", ar: "شرقي" },
  { key: "lebanese", tag: R + "lebanese", en: "Lebanese", ar: "لبناني" },
  { key: "syrian", tag: R + "syrian", en: "Syrian", ar: "سوري" },
  { key: "turkish", tag: R + "turkish", en: "Turkish", ar: "تركي" },
  { key: "grill", tag: R + "grill", en: "Grill", ar: "مشاوي" },
  { key: "seafood", tag: R + "seafood", en: "Seafood", ar: "مأكولات بحرية" },
  { key: "italian", tag: R + "italian", en: "Italian", ar: "إيطالي" },
  { key: "pizza", tag: R + "pizza", en: "Pizza", ar: "بيتزا" },
  { key: "japanese", tag: R + "japanese", en: "Japanese", ar: "ياباني" },
  { key: "sushi", tag: R + "sushi", en: "Sushi", ar: "سوشي" },
  { key: "chinese", tag: R + "chinese", en: "Chinese", ar: "صيني" },
  { key: "indian", tag: R + "indian", en: "Indian", ar: "هندي" },
  { key: "mexican", tag: R + "mexican", en: "Mexican", ar: "مكسيكي" },
  { key: "american", tag: R + "american", en: "American", ar: "أمريكي" },
  { key: "hamburger", tag: R + "hamburger", en: "Burgers", ar: "برغر" },
  { key: "steak_house", tag: R + "steak_house", en: "Steakhouse", ar: "ستيك" },
  { key: "mediterranean", tag: R + "mediterranean", en: "Mediterranean", ar: "متوسطي" },
  { key: "french", tag: R + "french", en: "French", ar: "فرنسي" },
  { key: "korean", tag: R + "korean", en: "Korean", ar: "كوري" },
  { key: "thai", tag: R + "thai", en: "Thai", ar: "تايلندي" },
  { key: "vegetarian", tag: R + "vegetarian", en: "Vegetarian", ar: "نباتي" },
  { key: "cafe", tag: R + "cafe", en: "Cafe", ar: "مقهى" },
  { key: "dessert_shop", tag: R + "dessert_shop", en: "Desserts", ar: "حلويات" },
];

export const ACTIVITIES: (CatalogItem & { estUsd: number })[] = [
  { key: "bowling", tag: P + "bowling_alley", en: "Bowling", ar: "بولينغ", estUsd: 10 },
  { key: "escape_room", tag: P + "escape_room_center", en: "Escape room", ar: "غرفة الهروب", estUsd: 14 },
  { key: "museum", tag: P + "museum", en: "Museums", ar: "متاحف", estUsd: 6 },
  { key: "art_gallery", tag: P + "art_gallery", en: "Art galleries", ar: "معارض فنية", estUsd: 4 },
  { key: "historical", tag: P + "historical_landmark", en: "Historical sites", ar: "مواقع تاريخية", estUsd: 5 },
  { key: "tourist", tag: P + "tourist_attraction", en: "Sightseeing", ar: "معالم سياحية", estUsd: 5 },
  { key: "park", tag: P + "park", en: "Parks & outdoors", ar: "حدائق وهواء طلق", estUsd: 0 },
  { key: "hiking", tag: P + "hiking_area", en: "Hiking", ar: "مشي جبلي", estUsd: 12 },
  { key: "go_kart", tag: P + "go_kart_track", en: "Go-karting", ar: "كارتينغ", estUsd: 18 },
  { key: "amusement", tag: P + "amusement_center", en: "Games & amusement", ar: "ألعاب وترفيه", estUsd: 15 },
  { key: "karaoke", tag: P + "karaoke", en: "Karaoke", ar: "كاريوكي", estUsd: 12 },
  { key: "live_music", tag: P + "live_music_venue", en: "Live music", ar: "موسيقى حية", estUsd: 20 },
  { key: "spa", tag: P + "spa", en: "Spa", ar: "سبا", estUsd: 45 },
  { key: "cooking_class", tag: P + "cooking_class", en: "Cooking class", ar: "ورشة طبخ", estUsd: 40 },
  { key: "adventure", tag: P + "adventure_sports_center", en: "Adventure sports", ar: "رياضات مغامرة", estUsd: 35 },
  { key: "sports", tag: P + "sports_club", en: "Sports club", ar: "نادٍ رياضي", estUsd: 15 },
  { key: "zoo", tag: P + "zoo", en: "Zoo", ar: "حديقة حيوان", estUsd: 8 },
];

export const DIETARY: CatalogItem[] = [
  { key: "halal", tag: D + "halal", en: "Halal", ar: "حلال" },
  { key: "vegetarian", tag: D + "vegetarian", en: "Vegetarian", ar: "نباتي" },
  { key: "vegan", tag: D + "vegan", en: "Vegan", ar: "فيغان" },
  { key: "gluten_free", tag: D + "gluten_free", en: "Gluten-free", ar: "خالٍ من الغلوتين" },
];

export function findItem<T extends CatalogItem>(list: T[], key: string): T | undefined {
  const k = key.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return list.find((i) => i.key === k || i.en.toLowerCase() === key.trim().toLowerCase() || i.ar === key.trim());
}

// ---- Budget heuristics (OUR assumptions, not Qloo data) --------------------------------------

export interface CityProfile {
  name: string;
  ar: string;
  /**
   * String sent to filter.location.query. Qloo fuzzy-matches localities, so a bare "Riyadh" resolves to a
   * village in Sudan; always include the country (verified by probe, see docs/QLOO_COVERAGE.md).
   */
  qlooQuery: string;
  currency: string;
  /** units of local currency per 1 USD (approximate, fixed for determinism). */
  perUsd: number;
  /** multiplier on the global USD price-level table; <1 means cheaper than the baseline. */
  priceFactor: number;
}

export const CITIES: CityProfile[] = [
  { name: "Amman", ar: "عمّان", qlooQuery: "Amman, Jordan", currency: "JOD", perUsd: 0.71, priceFactor: 0.7 },
  { name: "Dubai", ar: "دبي", qlooQuery: "Dubai, United Arab Emirates", currency: "AED", perUsd: 3.67, priceFactor: 1.2 },
  { name: "Riyadh", ar: "الرياض", qlooQuery: "Riyadh, Saudi Arabia", currency: "SAR", perUsd: 3.75, priceFactor: 1.0 },
  { name: "Cairo", ar: "القاهرة", qlooQuery: "Cairo, Egypt", currency: "EGP", perUsd: 48, priceFactor: 0.45 },
];

export function cityProfile(city: string): CityProfile {
  const c = CITIES.find((x) => x.name.toLowerCase() === city.trim().toLowerCase() || x.ar === city.trim());
  return c ?? { name: city, ar: city, qlooQuery: city, currency: "USD", perUsd: 1, priceFactor: 1 };
}

/** Qloo price_level (1-4, dollar signs) -> estimated dinner cost per person in USD, before city factor. */
export const PRICE_LEVEL_USD: Record<number, number> = { 1: 8, 2: 18, 3: 35, 4: 70 };
