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
2. **Artists → Qloo entities** (`GET /search`), round-robin across members, max 5 seeds (shared signal budget).
3. **Dinner**: one `/v2/insights` call, 50 restaurants, union of the team's cuisine tags (plus a broad cuisine pool so Qloo can still rank), `signal.interests.tags` = voted cuisines, `signal.interests.entities` = artist seeds, explainability on.
4. **Activities**: tags voted by the team; if fewer than 4 venues come back a corporate-friendly fallback set is used and the output says so. Hotels are excluded unless categorised as a spa.
5. **Scoring** per venue: `0.5 × Qloo affinity (min-max within the candidate set) + 0.25 × member coverage + 0.15 × team fit + 0.1 × rating`.
   Combo = `0.6 × dinner + 0.4 × activity`. Closed venues are dropped.
6. **Dietary**: if some venues carry Qloo's dietary tags for *all* the team's needs, venues without confirmation are left out (with a warning); otherwise they stay and are labelled "not confirmed".
7. **Budget**: restaurant `price_level` (1-4) → USD estimate → city factor × currency rate; activity cost from a small table. Both are labelled assumptions.
8. **Policy** (`policy.ts`): R1 over budget → rejected; R2 total above threshold (default 400 USD eq.) → manager approval; R3 auto-approve. Each decision is audit-logged. Shortlist = 3 category-diverse options, ranked by score; the best rejected combos are logged too.
9. **Narration**: `narrateSafely` calls the configured `LLMProvider`; on any error it falls back to the deterministic `RuleBasedProvider` and adds a warning. The LLM never changes ranking or policy.

## Qloo specifics
* Hackathon base URL only; legacy `/recommendations` and `/recs` paths are refused by the client; non-hackathon hosts are refused.
* Key only in the `X-Api-Key` header, redacted from errors/logs.
* Location queries are country-qualified (`Riyadh, Saudi Arabia`) because bare names resolve to the wrong place; the matched locality is returned to the UI.
* Explainability scores are each seed's *share* (sum to 1 per venue), so attribution is shown only for the dominant seed and only when ≥2 seeds compete.

## Testing
`npm test` runs offline: the Qloo client against a mocked `fetch`, the planner against a `FakeQloo` with invented venues, policy/audit, LLM providers, validation and i18n.
