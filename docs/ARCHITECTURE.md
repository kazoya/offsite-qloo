# Architecture

```
UI (Next.js /[lang]) ──POST──> app/api/plan ──> parsePlanRequest ──> planOffsite(req, {qloo, llm})
                                                                   │
        connectors/qloo (client: timeout, retry, private cache) <──┤  search artists, insights (dinner, activity)
        agent: taste → score → combos → budget/policy/audit        │
        llm: LLMProvider (rule-based | OpenAI-compatible)  <───────┘  narration only
```

## Flow (`src/agent/planner.ts`)
1. **Group profile** (`taste.ts`): each member's cuisines / activities / artists / dietary needs become votes; items wanted by more members rank higher. Unknown picks produce warnings.
2. **Artists → Qloo entities** (`GET /search`, top 5 hits), round-robin across members, max 5 seeds (shared signal budget). A hit is used only when its name matches the typed name after normalisation (`names.ts`: case, accents, Arabic letter variants, punctuation); if the typed name has no exact hit, up to 2 alternate spellings the input suggests are searched (both scripts typed, e.g. "X / س", or a known Latin/Arabic equivalent in `ARTIST_SPELLINGS`), and a hit must still equal one of those spellings exactly; otherwise the artist is skipped with a note naming the closest hit, so a collaboration like "Someone & X" never stands in for "X".
3. **Dinner**: one `/v2/insights` call, 50 restaurants, union of the team's cuisine tags (plus a broad cuisine pool so Qloo can still rank), `signal.interests.tags` = voted cuisines, `signal.interests.entities` = artist seeds, explainability on.
4. **Activities**: tags voted by the team; if fewer than 4 venues come back a corporate-friendly fallback set is used and the output says so. Hotels are excluded unless categorised as a spa.
5. **Scoring** per venue: `0.5 × Qloo affinity (min-max within the candidate set) + 0.25 × member coverage + 0.15 × team fit + 0.1 × rating`.
   Combo = `0.6 × dinner + 0.4 × activity`. Closed venues are dropped.
6. **Dietary**: a missing Qloo dietary tag is not proof a venue cannot serve a need, so no venue is dropped for it. Each unconfirmed need subtracts 0.15 from the venue score (capped at 0.3, `DIET_PENALTY_PER_NEED`), so tagged venues rank higher; untagged ones stay, carry a "Diet unconfirmed" badge plus a "check with the venue" reason, and a warning counts them.
7. **Budget**: restaurant `price_level` (1-4) → USD estimate → city factor × currency rate; activity cost from a small table. Both are labelled assumptions.
8. **Policy** (`policy.ts`): R1 over budget → rejected; R2 total above threshold (default 400 USD eq.) → manager approval; R3 auto-approve. Each decision is audit-logged. Shortlist = 3 category-diverse options, ranked by score; the best rejected combos are logged too.
9. **Team fairness** (`fairness.ts`, pure): per option, each member scores 1 (dinner and activity match their picks), 0.5 (one does) or 0 (left out), using the same evidence as scoring (tags, or Qloo explainability for their artist). Team fit = mean, fairness = min. Labels: **Best fit** = rank 1, **Fairest** = highest min (then fewest left out, then mean), **Cheapest** = lowest cost per person. When the fairest option is not rank 1, the plan explains who it adds, who it drops, the cost difference and the score gap; members no option serves are named. Fairness is reported, it does not re-rank.
10. **Narration**: `narrateSafely` calls the configured `LLMProvider`; on any error it falls back to the deterministic `RuleBasedProvider` and adds a warning. The LLM never changes ranking or policy.

## Qloo specifics
* Hackathon base URL only; legacy `/recommendations` and `/recs` paths are refused by the client; non-hackathon hosts are refused.
* Key only in the `X-Api-Key` header, redacted from errors/logs.
* Location queries are country-qualified (`Riyadh, Saudi Arabia`) because bare names resolve to the wrong place; the matched locality is returned to the UI.
* Explainability scores are each seed's *share* (sum to 1 per venue), so attribution is shown only for the dominant seed and only when ≥2 seeds compete.

## Testing
`npm test` runs offline: the Qloo client against a mocked `fetch`, the planner against a `FakeQloo` with invented venues, policy/audit, LLM providers, validation and i18n.
