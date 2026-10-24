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
