/**
 * Name normalisation for matching a member's typed artist name against Qloo search hits.
 * Case, diacritics (Latin accents and Arabic tashkeel), Arabic letter variants, punctuation and
 * spacing are ignored; a leading English "the" is ignored. Nothing else is fuzzy on purpose.
 */
export function normalizeName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // Latin combining accents
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "") // Arabic tashkeel + tatweel
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^the /, "");
}

/** First hit whose normalised name equals the query's, or undefined. Search order (relevance) breaks ties. */
export function exactNameMatch<T extends { name: string }>(query: string, hits: T[]): T | undefined {
  const q = normalizeName(query);
  if (!q) return undefined;
  return hits.find((h) => normalizeName(h.name) === q);
}

/**
 * Known equivalent spellings (Latin / Arabic) of artists teams commonly name. Used only as extra search
 * queries; a hit must still equal one of these spellings exactly after normalisation.
 */
const ARTIST_SPELLINGS: string[][] = [
  ["Amr Diab", "عمرو دياب", "Amro Diab"],
  ["Fairuz", "فيروز", "Fairouz", "Fayrouz"],
  ["Umm Kulthum", "أم كلثوم", "Oum Kalthoum", "Om Kalthoum"],
  ["Abdel Halim Hafez", "عبد الحليم حافظ"],
  ["Nancy Ajram", "نانسي عجرم"],
  ["Elissa", "إليسا"],
  ["Kadim Al Sahir", "كاظم الساهر", "Kazem El Saher"],
  ["Tamer Hosny", "تامر حسني"],
  ["Majida El Roumi", "ماجدة الرومي"],
  ["Wael Kfoury", "وائل كفوري"],
  ["Mohamed Mounir", "محمد منير"],
  ["Haifa Wehbe", "هيفاء وهبي"],
  ["Mohammed Abdu", "محمد عبده"],
  ["Rashed Al Majed", "راشد الماجد"],
  ["Assala", "أصالة"],
  ["Marwan Khoury", "مروان خوري"],
  ["Cairokee", "كايروكي"],
  ["Mashrou' Leila", "مشروع ليلى"],
];

/**
 * Spellings to try for one typed artist name, typed name first:
 * 1. parts the member typed themselves ("Amr Diab / عمرو دياب", "Fairuz (فيروز)"),
 * 2. known equivalents from ARTIST_SPELLINGS for any of those parts.
 * Deduplicated by normalised form.
 */
export function artistSpellings(typed: string): string[] {
  const parts = typed
    .split(/\s*(?:\/|\||،|\(|\)|\bor\b|\bأو\b)\s*/u)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (s: string) => {
    const n = normalizeName(s);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(s);
    }
  };
  add(typed);
  parts.forEach(add);
  for (const p of parts) {
    const group = ARTIST_SPELLINGS.find((g) => g.some((s) => normalizeName(s) === normalizeName(p)));
    group?.forEach(add);
  }
  return out;
}

/** First hit whose normalised name equals ANY of the given spellings (exact rule, no fuzzy matching). */
export function exactMatchAny<T extends { name: string }>(spellings: string[], hits: T[]): T | undefined {
  const wanted = new Set(spellings.map(normalizeName).filter(Boolean));
  return hits.find((h) => wanted.has(normalizeName(h.name)));
}
