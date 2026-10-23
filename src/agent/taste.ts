import { ACTIVITIES, CUISINES, DIETARY, findItem, type CatalogItem } from "../connectors/qloo/catalog";
import type { Member } from "./types";

export interface Vote {
  item: CatalogItem;
  members: string[];
}

export interface ArtistSeed {
  entityId: string;
  name: string;
  member: string;
}

export interface GroupProfile {
  cuisines: Vote[];
  activities: Vote[];
  dietary: Vote[];
  artists: ArtistSeed[];
  warnings: string[];
}

function tally(
  team: Member[],
  pick: (m: Member) => string[],
  list: CatalogItem[],
  what: string,
  warnings: string[],
): Vote[] {
  const votes = new Map<string, Vote>();
  for (const m of team) {
    for (const raw of pick(m)) {
      const item = findItem(list, raw);
      if (!item) {
        warnings.push(`Unknown ${what} "${raw}" from ${m.name} was ignored.`);
        continue;
      }
      const v = votes.get(item.key) ?? { item, members: [] };
      if (!v.members.includes(m.name)) v.members.push(m.name);
      votes.set(item.key, v);
    }
  }
  // Most-wanted first; ties broken by catalog order so output is deterministic.
  return [...votes.values()].sort(
    (a, b) => b.members.length - a.members.length || list.indexOf(a.item) - list.indexOf(b.item),
  );
}

/** Merge member picks into one group profile. Pure function. */
export function buildGroupProfile(team: Member[], artists: ArtistSeed[] = []): GroupProfile {
  const warnings: string[] = [];
  return {
    cuisines: tally(team, (m) => m.cuisines, CUISINES, "cuisine", warnings),
    activities: tally(team, (m) => m.activities, ACTIVITIES, "activity", warnings),
    dietary: tally(team, (m) => m.dietary, DIETARY, "dietary need", warnings),
    artists,
    warnings,
  };
}
