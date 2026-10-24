/**
 * "Load demo company": a synthetic 12-person team for the judge demo. The member names and tastes are invented
 * (no real employees); the artists are public names used only as taste seeds for Qloo.
 * Tastes are deliberately spread so the fairness meter has something to show: a Lebanese/grill majority,
 * smaller Japanese, Indian and Italian camps, and a few members whose picks the city may not cover at all.
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
    { name: "Tariq", cuisines: ["grill", "middle_eastern"], activities: ["bowling"], artists: "عمرو دياب", dietary: ["halal"] },
    { name: "Maya", cuisines: ["japanese", "sushi"], activities: ["escape_room"], artists: "", dietary: [] },
    { name: "Jad", cuisines: ["lebanese", "grill"], activities: ["go_kart", "bowling"], artists: "", dietary: ["halal"] },
    { name: "Dana", cuisines: ["italian", "pizza"], activities: ["karaoke"], artists: "", dietary: ["gluten_free"] },
    { name: "Karim", cuisines: ["indian"], activities: ["hiking", "park"], artists: "", dietary: ["vegetarian"] },
    { name: "Nour", cuisines: ["middle_eastern", "turkish"], activities: ["art_gallery", "historical"], artists: "Fairuz", dietary: ["halal"] },
    { name: "Hadi", cuisines: ["hamburger", "american"], activities: ["amusement", "go_kart"], artists: "", dietary: [] },
    { name: "Leen", cuisines: ["japanese", "korean"], activities: ["escape_room", "karaoke"], artists: "", dietary: [] },
    { name: "Omar", cuisines: ["grill", "steak_house"], activities: ["bowling", "sports"], artists: "", dietary: ["halal"] },
    { name: "Sama", cuisines: ["italian", "cafe"], activities: ["museum", "tourist"], artists: "", dietary: [] },
    { name: "Yazan", cuisines: ["seafood", "mediterranean"], activities: ["live_music"], artists: "", dietary: [] },
  ] satisfies DemoMember[],
} as const;
