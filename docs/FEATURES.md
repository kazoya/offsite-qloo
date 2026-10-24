# Features: what exists, where, and how it is tested

Snapshot of `main` at `e2153eb` (2026-10-24, Asia/Amman). Test counts come from `npx vitest run --reporter=verbose`
on that commit (15 files, 148 tests, all passing). "Live" means checked against the production deployment
https://offsite-qloo.vercel.app on 2026-10-24 (see [TEST_REPORT.md](TEST_REPORT.md)).

Status key:

- **works-and-tested**: implemented, covered by offline tests, and (where it has a user-visible path) checked live.
- **partial**: implemented, but with a stated gap (no automated test, a heuristic, or a limitation in production).
- **documented-only**: described in docs, no code.
- **missing**: not built. Listed so nobody assumes it exists.

## Core planning (Qloo)

| Feature | Implementing files | Tests (count) | Status | Notes |
|---|---|---|---|---|
| Qloo connector: `GET /search`, `GET /v2/insights`, header-only key, timeouts, retries, private cache | `src/connectors/qloo/*` | `tests/qloo-client.test.ts` (13) | works-and-tested | Key never logged; cache is gitignored. Live: 4 Qloo calls per fresh plan. |
| Group taste profile (weighted votes from cuisines, activities, artists, diets) | `src/agent/taste.ts`, `src/agent/planner.ts` | `tests/agent.test.ts` (32) | works-and-tested | Member names stay on the server; only tags, artist names, entity ids and the city go to Qloo. |
| Artist resolution with exact match and alternate spellings (Latin/Arabic) | `src/agent/names.ts`, `src/agent/planner.ts` | `tests/names.test.ts` (6), `tests/agent.test.ts` | works-and-tested | A search hit is used only if it equals one of the spellings exactly. |
| Ranking: 0.5 Qloo affinity + 0.25 member coverage + 0.15 team fit + 0.1 rating, diet-unconfirmed penalty | `src/agent/planner.ts` (`WEIGHTS`, `DIET_PENALTY_PER_NEED`) | `tests/agent.test.ts` | works-and-tested | Weights unchanged since the experiment. |
| "Why Qloo picked this" (explainability + matched members) | `src/agent/planner.ts`, `src/ui/Planner.tsx` | `tests/agent.test.ts` | works-and-tested | Live: 6 summaries rendered and expandable. |
| Opening hours check for the date and start time | `src/agent/hours.ts` | `tests/hours.test.ts` (10) | works-and-tested | Hours are not live availability; public holidays not modelled. "Closed every day" treated as unknown. |
| Dietary labels (halal, vegetarian, vegan, gluten-free) from Qloo tags only | `src/agent/planner.ts` | `tests/agent.test.ts` | works-and-tested | "Not confirmed" is never a safety claim. |
| Budget estimate in local currency | `src/agent/budget.ts` | `tests/agent.test.ts` | partial | Restaurants from Qloo price_level; activities from a labelled heuristic table (Qloo has no activity prices). |
| Policy R1 (over budget → rejected), R2 (total above threshold → manager), R3 (auto-approve) + audit log | `src/agent/policy.ts` | `tests/agent.test.ts` | works-and-tested | Default threshold 400 USD (≈ 284 JOD). |
| Three diverse options (no repeated dinner, venue or chain) | `src/agent/planner.ts` | `tests/variety.test.ts` (4) | works-and-tested | |
| Unsupported city refusal (Jeddah) and matched-locality display | `src/agent/validate.ts`, `src/connectors/qloo/catalog.ts` | `tests/ui-errors.test.ts` | works-and-tested | Live: Jeddah returns 422. |

## Agent loop, fairness and feedback (added after 17b958b)

| Feature | Implementing files | Tests (count) | Status | Notes |
|---|---|---|---|---|
| Team Fairness Engine: per-member satisfaction, Best fit / Fairest / Cheapest labels, who is left out | `src/agent/fairness.ts`, `src/ui/DemoParts.tsx` | `tests/fairness.test.ts` (8) | works-and-tested | Reports only; it re-ranks only when the user sends `not_fair`. Live: meter, labels and "why option N" card shown. |
| Agent loop `runAgent` with decision log (understand → qloo_queries → rank → budget_time_check → propose → explain → approval_gate) | `src/agent/loop.ts`, `src/i18n/decisionLog.ts` | `tests/agent-loop.test.ts` (24), `tests/decision-log-ar.test.ts` (2) | works-and-tested | Live: 16 log steps after one replan; Arabic log heading shown. |
| Feedback replanning: `budget`, `reject_venue`, `not_fair`, `manager_reject` (reason required, else 400) | `src/agent/loop.ts`, `app/api/plan/route.ts`, `src/ui/Planner.tsx` | `tests/agent-loop.test.ts` | works-and-tested | Live: budget and manager_reject verified; replan made 0 extra Qloo calls. `reject_venue` and `not_fair` verified offline only. |
| Feedback verification (met / not met per request) | `src/agent/loop.ts` | `tests/agent-loop.test.ts` | works-and-tested | Unmet requests are reported, not hidden. Live: 1 met, 0 not met. |
| Plan diff ("What changed" vs previous and original plan) | `src/agent/diff.ts`, `src/ui/DemoParts.tsx` | `tests/diff.test.ts` (7) | works-and-tested | |
| Synthetic demo company (Nimbus Analytics, 12 invented members, Amman, 30 JOD) | `src/demo/company.ts`, `src/i18n/demo.ts` | none directly (used by UI) | partial | Verified live. At headcount 12 no option crosses R2, so step 7 needs headcount 20 (see Known issues). |
| Judge demo path UI (one-click demo, fairness meter, feedback buttons, log, diff) | `src/ui/Planner.tsx`, `src/ui/DemoParts.tsx`, `app/[lang]/page.tsx` | no component tests | partial | Verified by a headless-browser run of all 7 steps; no automated UI test in the repo. |

## Approvals

| Feature | Implementing files | Tests (count) | Status | Notes |
|---|---|---|---|---|
| Approval store: decide once (409 on repeats), reason required for reject, append-only audit | `src/approvals/store.ts`, `app/api/approvals/**` | `tests/approvals.test.ts` (8) | works-and-tested | |
| Demo sandbox (default): per-visitor cookie queue, no PIN, 2 h TTL, caps on boxes and requests | `src/approvals/sandbox.ts` | `tests/approvals-sandbox.test.ts` (6) | works-and-tested | Live: send 201, "No PIN needed" banner, approve 200, a fresh browser sees an empty queue. In-memory: resets on instance restart. |
| Shared mode with manager PIN (`APPROVALS_MODE=shared`) | `src/approvals/pin.ts` | `tests/approvals-pin.test.ts` (7) | partial | Tested offline; not enabled in production. The PIN is a guard, not authentication. |
| Sign-in, roles, real authentication | none | none | missing | Out of scope for the demo. |

## Reliability and API

| Feature | Implementing files | Tests (count) | Status | Notes |
|---|---|---|---|---|
| Rate limits (plan 10/min, approvals 30/min), body caps (32 KB / 16 KB) | `src/api/guard.ts` | `tests/guard.test.ts` (7) | partial | Live 429 confirmed on one connection. In-memory, per server instance and per client IP, so not a global limit. |
| Planner deadline (25 s, clean 504) | `src/agent/deadline.ts`, `app/api/plan/route.ts` | `tests/guard.test.ts`, `tests/agent-loop.test.ts` | works-and-tested | |
| Typed error states (Qloo unavailable with retry, no plan fits, validation) | `src/api/errors.ts`, `src/ui/Planner.tsx` | `tests/ui-errors.test.ts` (5) | works-and-tested | Some validation messages are English-only. |
| Bilingual UI, Arabic RTL (`/ar`) and English (`/en`) | `src/i18n/*`, `src/ui/*`, `app/[lang]/*` | `tests/decision-log-ar.test.ts` (2) | partial | Live AR plan works with 0 page errors. The provider line shows the raw value "rule-based" in Arabic. |
| Narration: rule-based default, optional OpenAI-compatible LLM (text only, falls back on error) | `src/llm/*` | `tests/agent.test.ts` | partial | LLM path tested with mocks only; production runs rule-based. |

## Evaluation and tooling

| Feature | Implementing files | Tests (count) | Status | Notes |
|---|---|---|---|---|
| A / A+ / B / C experiment (24 synthetic teams, seed 20261024) | `src/agent/baselines.ts`, `scripts/experiment.ts`, `scripts/experiment-chart.py`, `docs/EXPERIMENT.md` | `tests/baselines.test.ts` (9) | works-and-tested | Rerun from cache gives byte-identical JSON for both result files. Measures fit with Qloo tags, not satisfaction. |
| Qloo coverage probe | `scripts/probe-coverage.ts`, `docs/QLOO_COVERAGE.md` | none | partial | Aggregate statistics only; output is not committed raw. |
| CLI planner | `scripts/plan-cli.ts` | none | partial | Developer tool. |

## Not built (by design or not yet)

| Feature | Status | Notes |
|---|---|---|
| Booking, reservations, payments | missing | The agent only proposes. It never books, pays or sends anything by itself. |
| Persistent database | missing | Hosted approvals are in memory; local mode uses a JSON file. |
| Calendar invites, expense reports | missing | |
| Travel time between venues, public holidays | missing | |
| Qloo weighted signals (POST-only) | missing | Not used; see [QLOO_COVERAGE.md](QLOO_COVERAGE.md). |
