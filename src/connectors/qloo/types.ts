/** Typed subset of the Qloo hackathon API (https://hackathon.api.qloo.com). */

export const ENTITY_TYPES = [
  "urn:entity:artist",
  "urn:entity:book",
  "urn:entity:brand",
  "urn:entity:destination",
  "urn:entity:movie",
  "urn:entity:person",
  "urn:entity:place",
  "urn:entity:podcast",
  "urn:entity:tv_show",
  "urn:entity:video_game",
] as const;
export type InsightsEntityType = (typeof ENTITY_TYPES)[number];

export interface QlooTag {
  id: string;
  name: string;
  type: string;
  weight?: number | null;
}

export interface QlooSearchResult {
  entityId: string;
  name: string;
  types: string[];
  popularity?: number;
  country?: string;
  location?: { lat: number; lon: number };
  tags: { name: string; id: string; type: string }[];
}

export interface QlooTagResult {
  id: string;
  name: string;
  type: string;
}

export interface ExplainabilityContribution {
  entityId: string;
  score: number;
}

export interface QlooPlace {
  entityId: string;
  name: string;
  /** Arabic name when the Qloo name contains Arabic script (often "English | عربي"). */
  nameAr?: string;
  /** Latin/English part of the name. */
  nameEn: string;
  popularity?: number;
  /** Qloo affinity (0..1) for the signals of the request; undefined when no signal was sent. */
  affinity?: number;
  priceLevel?: number;
  rating?: number;
  address?: string;
  website?: string;
  phone?: string;
  description?: string;
  city?: string;
  neighborhood?: string;
  location?: { lat: number; lon: number };
  tags: QlooTag[];
  keywords: { name: string; count: number }[];
  isClosed?: boolean;
  /** Which input entities (signal.interests.entities) drove this result, per Qloo explainability. */
  explain: ExplainabilityContribution[];
  hours?: Record<string, { opens: string; closes: string; closed: boolean }[]>;
}

export interface InsightsRequest {
  filterType: InsightsEntityType;
  /** Locality name resolved by Qloo (filter.location.query), e.g. "Amman". */
  locationQuery?: string;
  filterTags?: string[];
  /** "union" (default) or "intersection" for filterTags. */
  filterTagsOperator?: "union" | "intersection";
  excludeTags?: string[];
  signalTags?: string[];
  signalEntities?: string[];
  priceLevelMin?: number;
  priceLevelMax?: number;
  ratingMin?: number;
  popularityMin?: number;
  /** Strict locality boundary (filter.location.radius=0). */
  strictLocation?: boolean;
  take?: number;
  explainability?: boolean;
}

export interface InsightsResult {
  places: QlooPlace[];
  /** Locality Qloo matched for filterLocationQuery, if reported. */
  locality?: string;
  warnings: string[];
}
