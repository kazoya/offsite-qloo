# Architecture

```
UI (Next.js /[lang]) ──POST──> app/api/plan ──> rate limit · body cap · parsePlanRequest + parseFeedback
                                                 └─> runAgent(req, feedback) (25 s deadline) ──> planOffsite(req, deps, constraints)
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
9. **Team fairness** (`fairness.ts`, pure): per option, each member scores 1 (dinner and activity match their picks), 0.5 (one does) or 0 (left out), using the same evidence as scoring (tags, or Qloo explainability for their artist). Team fit = mean, fairness = min. Labels: **Best fit** = rank 1, **Fairest** = highest min (then fewest left out, then mean), **Cheapest** = lowest cost per person. When the fairest option is not rank 1, the plan explains who it adds, who it drops, the cost difference and the score gap; members no option serves are named. Fairness is reported, it does not re-rank, unless the team sends "not fair to X" feedback (see the agent loop below).
10. **Narration**: `narrateSafely` calls the configured `LLMProvider`; on any error it falls back to the deterministic `RuleBasedProvider` and adds a warning. The LLM never changes ranking or policy.

## Agent loop (`src/agent/loop.ts`)
`runAgent(req, feedback[], deps)` wraps the planner in explicit, logged steps:
`understand → qloo_queries → rank → budget_time_check → propose → explain → approval_gate`. The planner reports real
counts for each step through `deps.onStep`; the loop turns them into a **decision log** entry
`{seq, pass, step, inputs, decision, reason, ms}` (counts and names only, never raw Qloo payloads), returned as
`plan.agent.log`.

With feedback it continues with `apply_feedback → (the same steps, pass "replan") → verify_feedback`:
* `{type:"budget", budgetPerPerson}` replans at the new budget.
* `{type:"reject_venue", entityId}` removes that venue and other branches of the same chain before ranking.
* `{type:"not_fair", member}` adds venues the member picked to the shortlist pool and ranks options covering them
  first when any fit the budget; otherwise it says so.
`verify_feedback` checks each item against the new plan (budget respected, venue gone, member covered by option 1)
and reports unmet items as unmet. `plan.agent.baseline` and `changed` show what moved.

**Autonomy limits** (`AUTONOMY`, enforced in code): the agent only proposes; it never books, reserves or pays, and it
never submits to the approvals queue. The approval gate re-evaluates the policy for every option; anything over the
R2 threshold is `awaiting_human` (and forced to `needs_manager_approval` if an upstream step ever mislabelled it).

**Reuse**: identical Qloo requests within a run are answered once (`ReusingQloo`), so a replan makes no extra Qloo
calls; across HTTP requests the client's private disk cache applies. The API is stateless: the client sends the
original request plus the feedback list.

## Reliability (`src/api/guard.ts`, `src/agent/deadline.ts`)
* **Deadline**: one 25 s budget per `/api/plan` request; every Qloo call and every step is raced against what is
  left, and the whole run is raced too. Overrun → 504 `timeout` (`maxDuration` 30 s on Vercel as the outer ceiling).
* **Rate limit**: per client IP (from `x-forwarded-for`), sliding 60 s window: 10/min on `/api/plan`, 30/min across
  `/api/approvals*` → 429 `rate_limited` with `Retry-After`. In-memory, so on serverless it is per instance (best
  effort, not a global quota).
* **Body cap**: 32 KB for `/api/plan`, 16 KB for approvals, read with a capped stream → 413 `too_large`.
* **Feedback validation**: at most 10 items; budget 0–100000; entity ids `[\w:-]{1,80}`; `member` must be a team
  name; reasons up to 200 characters.

## Qloo specifics
* Hackathon base URL only; legacy `/recommendations` and `/recs` paths are refused by the client; non-hackathon hosts are refused.
* Key only in the `X-Api-Key` header, redacted from errors/logs.
* Location queries are country-qualified (`Riyadh, Saudi Arabia`) because bare names resolve to the wrong place; the matched locality is returned to the UI.
* Explainability scores are each seed's *share* (sum to 1 per venue), so attribution is shown only for the dominant seed and only when ≥2 seeds compete.

## Testing
`npm test` runs offline: the Qloo client against a mocked `fetch`, the planner and the agent loop against a `FakeQloo` with invented venues, policy/audit, fairness, LLM providers, validation, i18n, the deadline, the rate limiter, the body cap and the API routes (no key needed).
