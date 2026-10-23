/**
 * SYNTHETIC fixtures that mirror the real Qloo response shapes. No real Qloo data is stored in this repo
 * (Qloo's terms forbid publishing response data publicly). All venue names are made up.
 */
import type { InsightsRequest, InsightsResult, QlooPlace, QlooSearchResult } from "../../src/connectors/qloo/types";

export const SEED_FAIRUZ = "SEED-FAIRUZ";
export const SEED_DIAB = "SEED-DIAB";

const R = "urn:tag:genre:place:restaurant:";
const P = "urn:tag:genre:place:";
const D = "urn:tag:dietary_option:qloo:";
const tag = (id: string) => ({ id, name: id.split(":").pop()!, type: id.split(":")[1]!, weight: 1 });

export function place(over: Partial<Omit<QlooPlace, "tags">> & { entityId: string; nameEn: string; tags: string[] }): QlooPlace {
  const { tags, ...rest } = over;
  return {
    name: over.nameAr ? `${over.nameEn} | ${over.nameAr}` : over.nameEn,
    popularity: 0.8,
    affinity: 0.5,
    priceLevel: 2,
    rating: 4.2,
    keywords: [],
    explain: [],
    ...rest,
    tags: tags.map(tag),
  };
}

export const RAW_INSIGHTS = {
  success: true,
  results: {
    entities: [
      {
        name: "Test Grill House | بيت المشاوي",
        entity_id: "E1",
        popularity: 0.9,
        location: { lat: 31.95, lon: 35.91 },
        tags: [{ id: R + "grill", name: "Grill", type: "urn:tag:genre:place", weight: 0.9 }],
        query: {
          affinity: 0.71,
          explainability: {
            "signal.interests.entities": [
              { entity_id: SEED_FAIRUZ, score: 0.7 },
              { entity_id: SEED_DIAB, score: 0.3 },
            ],
          },
        },
        properties: { price_level: 3, business_rating: 4.5, address: "1 Test St", is_closed: false, geocode: { city: "Amman" } },
      },
      { name: "Plain Cafe", entity_id: "E2", tags: [], properties: { price_level: null, business_rating: null } },
    ],
  },
  query: { localities: { filter: [{ name: "Amman", disambiguation: "Amman, Jordan" }] } },
  warnings: [{ type: "not_found", "signal.interests.entities": ["X"] }],
};

export const RAW_SEARCH = {
  results: [
    { name: "Test Singer", entity_id: "S1", types: ["urn:entity:artist"], popularity: 0.5, tags: [{ name: "Pop", tag_id: "urn:tag:genre:media:pop", type: "urn:tag:genre:media", value: "urn:tag:genre:media:pop" }] },
  ],
};

/** Venue pool used by planner tests. Dinner and activity venues keyed by what the request asks for. */
export const DINNERS: QlooPlace[] = [
  place({ entityId: "D1", nameEn: "Test Lebanese Table", nameAr: "طاولة لبنانية", affinity: 0.9, priceLevel: 2, rating: 4.6,
    tags: [R + "lebanese", D + "halal", D + "vegetarian", "urn:tag:event:place:work_dinner"], explain: [{ entityId: SEED_FAIRUZ, score: 0.65 }, { entityId: SEED_DIAB, score: 0.35 }] }),
  place({ entityId: "D2", nameEn: "Test Sushi Bar", affinity: 0.7, priceLevel: 3, rating: 4.4, tags: [R + "japanese", D + "vegetarian"] }),
  place({ entityId: "D3", nameEn: "Test Fine Steak", affinity: 0.95, priceLevel: 4, rating: 4.9, tags: [R + "steak_house", D + "halal", D + "vegetarian"] }),
  place({ entityId: "D6", nameEn: "Test Mezze Corner", affinity: 0.5, priceLevel: 2, rating: 4.0, tags: [R + "lebanese", D + "halal", D + "vegetarian"] }),
  place({ entityId: "D7", nameEn: "Test Garden Kitchen", affinity: 0.45, priceLevel: 1, rating: 3.9, tags: [R + "lebanese", D + "halal", D + "vegetarian"] }),
  place({ entityId: "D4", nameEn: "Test Closed Grill", affinity: 1, priceLevel: 1, isClosed: true, tags: [R + "grill", D + "halal", D + "vegetarian"] }),
  place({ entityId: "D5", nameEn: "Test Unpriced Pizza", affinity: 0.4, priceLevel: undefined, rating: undefined, tags: [R + "pizza"] }),
];

export const ACTIVITY_VENUES: QlooPlace[] = [
  place({ entityId: "A1", nameEn: "Test Bowl", affinity: 0.8, priceLevel: undefined, tags: [P + "bowling_alley", "urn:tag:ambience:place:large_group"] }),
  place({ entityId: "A2", nameEn: "Test Museum", affinity: 0.6, priceLevel: undefined, tags: [P + "museum"] }),
  place({ entityId: "A3", nameEn: "Test Grand Hotel", affinity: 0.99, priceLevel: undefined, tags: [P + "hotel", P + "tourist_attraction"] }),
  place({ entityId: "A4", nameEn: "Test Park", affinity: 0.3, priceLevel: undefined, tags: [P + "park"] }),
  place({ entityId: "A5", nameEn: "Test Spa Retreat", affinity: 0.5, priceLevel: undefined, tags: [P + "spa", P + "hotel"] }),
];

/** Fake Qloo: routes by whether filter tags look like restaurants or activities. Records every request. */
export class FakeQloo {
  httpCalls = 0;
  requests: InsightsRequest[] = [];
  constructor(
    private readonly dinners: QlooPlace[] = DINNERS,
    private readonly activities: QlooPlace[] = ACTIVITY_VENUES,
    private readonly locality = "Amman, Jordan",
  ) {}

  async searchEntities(o: { query: string }): Promise<QlooSearchResult[]> {
    this.httpCalls++;
    const id = o.query === "Fairuz" ? SEED_FAIRUZ : o.query === "Amr Diab" ? SEED_DIAB : undefined;
    return id ? [{ entityId: id, name: o.query, types: ["urn:entity:artist"], tags: [] }] : [];
  }

  async insights(r: InsightsRequest): Promise<InsightsResult> {
    this.httpCalls++;
    this.requests.push(r);
    const isDinner = (r.filterTags ?? []).some((t) => t.includes(":restaurant:"));
    const src = isDinner ? this.dinners : this.activities;
    const wanted = new Set(r.filterTags ?? []);
    const places = src.filter((p) => p.tags.some((t) => wanted.has(t.id))).map((p) => ({ ...p, explain: r.explainability ? p.explain : [] }));
    return { places, locality: this.locality, warnings: [] };
  }
}
