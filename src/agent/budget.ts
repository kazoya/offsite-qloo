import { ACTIVITIES, PRICE_LEVEL_USD, cityProfile } from "../connectors/qloo/catalog";

export interface CostEstimate {
  perPerson: number;
  assumed: boolean;
}

/** Default Qloo price level assumed when a restaurant has none (mid-range). */
export const DEFAULT_PRICE_LEVEL = 2;

/** Dinner cost per person in local currency. OUR heuristic: price_level -> USD -> city factor -> currency. */
export function dinnerCost(priceLevel: number | undefined, city: string): CostEstimate {
  const c = cityProfile(city);
  const lvl = priceLevel && PRICE_LEVEL_USD[priceLevel] !== undefined ? priceLevel : DEFAULT_PRICE_LEVEL;
  return { perPerson: PRICE_LEVEL_USD[lvl]! * c.priceFactor * c.perUsd, assumed: !priceLevel };
}

/** Activity cost per person in local currency. Qloo has no price for activity venues: always an assumption. */
export function activityCost(categoryKey: string, city: string): CostEstimate {
  const c = cityProfile(city);
  const est = ACTIVITIES.find((a) => a.key === categoryKey)?.estUsd ?? 10;
  return { perPerson: est * c.priceFactor * c.perUsd, assumed: true };
}

export const DEFAULT_APPROVAL_THRESHOLD_USD = 400;

export function defaultApprovalThreshold(city: string): number {
  return DEFAULT_APPROVAL_THRESHOLD_USD * cityProfile(city).perUsd;
}
