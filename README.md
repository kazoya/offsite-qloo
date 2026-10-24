# Offsite Planner Agent (مخطِّط الرحلات المؤسسية) — built on Qloo

A bilingual (Arabic / English, RTL-aware) agent that plans a corporate team dinner + activity. It builds a **group taste
profile** from each team member's tastes, asks **Qloo's taste-intelligence API** for ranked venues in the chosen city,
filters them by **budget per person** and a **corporate approval policy**, and explains **why Qloo picked each item**.
Built for the Qloo Agentic Hackathon (Devpost).

> Status: milestone 1 (working core + UI + tests). Not deployed. See "What was built during the Submission Period".

## How Qloo is used (the centerpiece)

| Step | Qloo call (hackathon base URL only) |
|---|---|
| Resolve members' favourite artists | `GET /search` (entity ids) |
| Rank restaurants for the whole team | `GET /v2/insights` `filter.type=urn:entity:place`, `filter.location.query`, `filter.tags` (cuisines, union), `signal.interests.tags` + `signal.interests.entities`, `feature.explainability=true` |
| Rank activities | same endpoint, activity tags voted by the team (fallback category set if too few results) |

Qloo's per-venue `affinity` is the largest ranking weight (0.5); `explainability` is turned into the human-readable
"why" (which team members' seeds drove the match). Details and honest gaps: [docs/QLOO_COVERAGE.md](docs/QLOO_COVERAGE.md),
design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Run it

Requires Node >= 20.9.

```bash
npm install
cp .env.example .env        # put your hackathon key in QLOO_API_KEY (never commit .env)
npm run dev                 # http://localhost:3200  -> redirects to /ar ; /en for English
# or: npm run build && npm start
npm run plan -- data/sample-request.json --lang ar   # CLI, prints the plan
npm run probe               # live coverage probe (Amman, Dubai, Riyadh, Cairo)
npm test                    # offline tests, no network, no key
npm run typecheck
```

Optional LLM narration: set `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` (any OpenAI-compatible chat/completions
endpoint). Without them a deterministic rule-based narrator is used; the plan itself never depends on an LLM.
If the LLM call fails the app falls back to the rule-based text and adds a warning.

## Approval policy and audit log

* R1 — per-person cost above the budget → rejected.
* R2 — total cost above the approval threshold (default 400 USD equivalent) → needs manager approval.
* R3 — otherwise auto-approved.

Every decision (including the best rejected combinations) is written to an audit log with sequence number, timestamp,
subject, decision, rule and detail, and shown in the UI.

## Known limitations

* Activity venues carry no price in Qloo; activity costs and restaurant prices (price_level → currency) are **our
  estimates**, labelled as assumptions in the output.
* Opening hours: the date + start time are checked against Qloo `hours` (activity 2 h from the start time, then dinner 90 min). Venues Qloo shows closed in their slot are left out; venues without hours are kept and labelled "hours unknown". Hours are not live availability or reservations, and public holidays are not modelled.
* Dietary tags are a presence signal: "not confirmed" is not "unavailable" and never a safety statement about allergies.
* City coverage: Amman, Dubai, Riyadh, Cairo. Jeddah resolves to the whole country in Qloo, so it is unsupported.
* Arabic venue names are rare in Qloo data (0–22 %), so many venue names stay in Latin script in the Arabic UI.

## What was built during the Submission Period

Everything in this repository was written between **Oct 24 and Oct 31, 2026** (the Submission Period): the Qloo
connector, agent core, policy/audit, LLM layer, bilingual UI, tests and docs. **No code was reused from earlier
projects.** The official [qloo-hackathon-kit](https://github.com/qloo/qloo-hackathon-kit) was read for API conventions
only; none of its code is included. Third-party dependencies: Next.js, React, TypeScript, Vitest, tsx (see package.json).

## Data and terms

Qloo response data is cached privately on the server (`.cache/`, gitignored) and is **not** published in this repo.
Tests use synthetic fixtures with invented venues. `docs/QLOO_COVERAGE.md` holds aggregate statistics only.

## License

MIT — see [LICENSE](LICENSE).
