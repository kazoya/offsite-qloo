/**
 * "Load demo company": a synthetic 12-person team for the judge demo. The member names and tastes are invented
 * (no real employees); the artists are public names used only as taste seeds for Qloo.
 * Tastes form realistic overlapping clusters (a Levantine/grill group, a cafe/Italian/sushi group, a burgers/grill
 * group; culture fans and bowling/escape-room fans), so most members can be covered while options still differ.
 * Nothing here fixes the outcome: the options, coverage and lowest-member scores are computed live from Qloo.
 */
export interface DemoMember {
  name: string;
  cuisines: string[];
  activities: string[];
  /** Comma-separated, as typed in the form. */
  artists: string;
  dietary: string[];
}

export const DEMO_COMPANY = {
  nameEn: "Nimbus Analytics (synthetic)",
  nameAr: "نيمبس للتحليلات (شركة تجريبية)",
  city: "Amman",
  budgetPerPerson: 30,
  headcount: 12,
  date: "2026-11-12",
  startTime: "18:00",
  members: [
    { name: "Rana", cuisines: ["lebanese", "mediterranean"], activities: ["museum", "art_gallery"], artists: "Fairuz", dietary: ["vegetarian"] },
    { name: "Tariq", cuisines: ["middle_eastern", "grill"], activities: ["bowling", "tourist"], artists: "عمرو دياب", dietary: ["halal"] },
    { name: "Maya", cuisines: ["sushi", "cafe"], activities: ["escape_room", "art_gallery"], artists: "", dietary: [] },
    { name: "Jad", cuisines: ["lebanese", "grill", "middle_eastern"], activities: ["bowling", "go_kart"], artists: "", dietary: ["halal"] },
    { name: "Dana", cuisines: ["italian", "pizza", "cafe"], activities: ["museum", "art_gallery"], artists: "", dietary: ["gluten_free"] },
    { name: "Karim", cuisines: ["middle_eastern", "cafe"], activities: ["tourist", "historical"], artists: "", dietary: ["vegetarian"] },
    { name: "Nour", cuisines: ["lebanese", "middle_eastern"], activities: ["art_gallery", "historical"], artists: "Fairuz", dietary: ["halal"] },
    { name: "Hadi", cuisines: ["hamburger", "grill", "american"], activities: ["bowling", "tourist"], artists: "", dietary: [] },
    { name: "Leen", cuisines: ["sushi", "cafe"], activities: ["escape_room", "art_gallery"], artists: "", dietary: [] },
    { name: "Omar", cuisines: ["grill", "steak_house", "hamburger"], activities: ["bowling", "tourist"], artists: "", dietary: ["halal"] },
    { name: "Sama", cuisines: ["cafe", "italian"], activities: ["museum", "tourist"], artists: "", dietary: [] },
    { name: "Yazan", cuisines: ["mediterranean", "seafood", "lebanese"], activities: ["tourist", "art_gallery"], artists: "", dietary: [] },
  ] satisfies DemoMember[],
} as const;
