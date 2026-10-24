# Offsite Planner Agent (مخطِّط الرحلات المؤسسية) — built on Qloo

A bilingual (Arabic / English, RTL-aware) agent that plans a corporate team dinner + activity. It builds a **group taste
profile** from each team member's tastes, asks **Qloo's taste-intelligence API** for ranked venues in the chosen city,
filters them by **budget per person** and a **corporate approval policy**, and explains **why Qloo picked each item**.
Built for the Qloo Agentic Hackathon (Devpost).

> Status: working core + bilingual UI + manager approvals + offline tests. Live demo: **https://offsite-qloo.vercel.app**
> (deployed from `main`, including the fairness engine, agent loop, judge demo path and A/B/C experiment; approvals
> there run in a per-visitor in-memory demo sandbox that resets, see below). See "What was built during the Submission Period".

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

## Team fairness

Each plan reports, per option, whose picks it matches (dinner and/or activity) and who it leaves out, plus team
mean and minimum satisfaction. Options are labelled **Best fit** (top score), **Fairest** (best minimum, then fewest
left out) and **Cheapest** (lowest estimated cost per person). If a lower-ranked option is fairer, the UI says why, e.g.
"Option 2 is fairer than option 1: it also matches Sara, who gets none of their picks in option 1 …". Fairness is
shown alongside the ranking; it does not change it unless the team asks (feedback "not fair to X", below). Logic:
`src/agent/fairness.ts`; tests: `tests/fairness.test.ts`.

## Does it beat simpler rankers? (A/B/C experiment)

We ran 24 synthetic teams (seed 20261024; 6 each in Amman, Dubai, Riyadh and Cairo) through four strategies:

- **A**: the city's popular venues, with no taste signal.
- **A+** (ablation): the same venue pools as C, ranked by Qloo popularity only.
- **B**: Qloo affinity only.
- **C**: the full planner.

Results (means over teams, from Qloo's own tags):

| | A | A+ | B | C |
|---|---:|---:|---:|---:|
| Mean member coverage | 0.14 | 0.22 | 0.23 | 0.32 |
| Members left out by every option | 0.49 | 0.35 | 0.38 | 0.18 |
| Options within budget | 0.88 | 0.76 | 0.79 | 1.00 |

C did **not** beat B on venues with unknown hours (0.24 vs 0.22). With tighter budgets, C proposed no plan for 21% of
teams. There are no satisfaction scores; method, caveats and how to reproduce are in
[docs/EXPERIMENT.md](docs/EXPERIMENT.md).

## Agent loop, feedback and replanning

`/api/plan` runs a small agent loop (`src/agent/loop.ts`): understand the constraints → query Qloo → rank → check
budget and opening hours → propose → explain → approval gate. Each step is written to a decision log (inputs as
counts, decision, reason, time) returned as `plan.agent.log`. Send `feedback` with the same request to replan:

```json
{ "...": "the original request", "feedback": [
  { "type": "budget", "budgetPerPerson": 20 },
  { "type": "reject_venue", "entityId": "<id from the plan>", "reason": "too far" },
  { "type": "not_fair", "member": "Sara" },
  { "type": "manager_reject", "dinnerId": "<id>", "activityId": "<id>", "reason": "too far from the office" } ] }
```

The replan reuses the Qloo responses it already has, and `plan.agent.checks` says for each item whether it was met
(an unmet request is reported, not hidden). The agent only proposes: it never books or pays, never sends anything to
the approvals queue by itself, and every option over the R2 threshold waits for a manager. The response is the same
Plan as before plus the `agent` field. The UI shows the log, the feedback controls, the checks and a "What changed"
diff (see the judge demo path below).

## Judge demo path (about 90–120 seconds)

1. **Load demo company**: one click fills a synthetic 12-person team (invented names and tastes, Amman, 30 JOD per
   person) and collapses it into a summary.
2. **Plan the offsite**: three options from Qloo, with the loading skeleton and retry on errors.
3. **Why Qloo picked this**: expandable reasons (matched tags, artist links, affinity) plus a score breakdown; every
   price is labelled as an estimate.
4. **Fairness and fit meter** per option: team average, lowest member, coverage N/M, who is left out, the Best fit /
   Fairest / Cheapest badges, and "why option N may suit the team better".
5. **Feedback**: change the budget, reject a venue, mark "not fair to <member>", or reject an option as the manager
   (reason required). Each action replans with all feedback so far and reuses Qloo answers.
6. **What changed**: old vs new per option (venues, estimated cost per person, fairness), the feedback checks, and the
   agent decision log (collapsible steps with decision, reason and timing).
7. **Approvals**: send an option over the threshold to the manager and approve it in your own demo sandbox. With the
   default 12 people every option stays under the threshold, so set **Headcount** to 20 before planning to see this step.

## Approval policy and audit log

* R1 — per-person cost above the budget → rejected.
* R2 — total cost above the approval threshold (default 400 USD equivalent) → needs manager approval.
* R3 — otherwise auto-approved.

Every decision (including the best rejected combinations) is written to an audit log with sequence number, timestamp,
subject, decision, rule and detail, and shown in the UI.

**Manager approval view** (`/ar/approvals`, `/en/approvals`): options that hit R2 have a "Send to manager" button.
The queue lists pending / approved / rejected requests; a manager enters their name and approves, or rejects with a
required reason. Each request can be decided once (a second decision returns 409), the total is recomputed on the
server, and only R2 plans are accepted. Every submit/approve/reject is appended to a separate approval audit trail
(rules M1/M2). Storage is a local JSON file, `data/private/approvals.json` (gitignored); override with
`APPROVALS_FILE=/path.json`, or `APPROVALS_FILE=memory` for RAM only. API: `GET /api/approvals?status=pending`,
`POST /api/approvals`, `POST /api/approvals/:id` with `{action:"approve"|"reject", actor, note}`.
**Demo sandbox (default):** each visitor gets a private in-memory approvals queue, keyed by an HttpOnly
`offsite_demo` cookie (random id, SameSite=Lax, Secure in production). Anyone can try submit → approve/reject without a
PIN, nobody sees anyone else's requests, and a box expires after two idle hours (at most 2000 boxes, 25 requests each).
The page shows a "demo: resets, no real bookings" banner. Nothing is booked or paid in any mode.

**Shared queue (`APPROVALS_MODE=shared`, opt-in):** one queue for everyone, stored as above. Approve/reject then require
the PIN from `APPROVALS_PIN` (checked on the server, sent as the `x-approvals-pin` header; 5 wrong tries lock a client
for 10 minutes). If `APPROVALS_PIN` is unset in production, approve/reject are disabled and the page says so; in
development they stay open. The PIN is a demo guard against casual clicks, not authentication: there are no user
accounts or roles.

**On Vercel** the filesystem is read-only, so the queue uses `APPROVALS_FILE=memory` (the default when `VERCEL` is set)
and **resets whenever the serverless instance restarts or scales**: a request sent to the manager can disappear, and two
instances may show different queues. Set `QLOO_CACHE_DIR=/tmp/qloo-cache` there; cache writes are best effort and never
fail a plan.

## Errors and honest coverage in the UI

`/api/plan` errors carry a stable `code` that the UI localises: `validation` (400), `unsupported_city` (422, e.g.
Jeddah), `no_key` (503), `qloo_down` / `qloo_auth` (502, upstream bodies are never echoed), `timeout` (504, over the
25 s deadline), `rate_limited` (429, 10 plans per minute per IP; approvals 30/min), `too_large` (413), `internal`
(500). The rate limit is in memory, so on Vercel it applies per server instance.
The UI shows a loading skeleton, a retry button when Qloo is down, a "no plan fits" card, labels each price as an
estimate (activities: "typical price, not from Qloo"), shows opening-hours status, and notes when Qloo has no Arabic name.
Planner notes are translated to Arabic when the pattern is known; anything unrecognised is shown verbatim.

## Known limitations

* Activity venues carry no price in Qloo; activity costs and restaurant prices (price_level → currency) are **our
  estimates**, labelled as assumptions in the output.
* Opening hours: the date + start time are checked against Qloo `hours` (activity 2 h from the start time, then dinner 90 min). Venues Qloo shows closed in their slot are left out; venues without hours are kept and labelled "hours unknown". Hours are not live availability or reservations, and public holidays are not modelled.
* Dietary tags are a presence signal: "not confirmed" is not "unavailable" and never a safety statement about allergies.
* City coverage: Amman, Dubai, Riyadh, Cairo. Jeddah resolves to the whole country in Qloo, so it is unsupported.
* Arabic venue names are rare in Qloo data (0–22 %), so many venue names stay in Latin script in the Arabic UI.

## What was built during the Submission Period

All code in this repository was written during the Submission Period (Sep 30 2026 09:00 ET – Oct 30 2026 23:45 ET).
Per `git log`, every commit so far is dated **Oct 24, 2026** (Amman time, UTC+3); `git log --date=iso` is the
authoritative record. The work covers the Qloo connector, agent core, policy/audit, LLM layer, bilingual UI, manager
approvals, tests and docs. **No code was reused from earlier projects.** The official
[qloo-hackathon-kit](https://github.com/qloo/qloo-hackathon-kit) was read for API conventions only; none of its code is
included. Third-party dependencies: Next.js, React, TypeScript, Vitest, tsx (see package.json).

## Data and terms

Qloo response data is cached privately on the server (`.cache/`, gitignored) and is **not** published in this repo.
Tests use synthetic fixtures with invented venues. `docs/QLOO_COVERAGE.md` holds aggregate statistics only.

## Evidence pack

- [docs/FEATURES.md](docs/FEATURES.md): every feature with its files, tests and an honest status.
- [docs/TEST_REPORT.md](docs/TEST_REPORT.md): typecheck, test, build, experiment-rerun and production-path outputs.
- [docs/BEFORE_AFTER.md](docs/BEFORE_AFTER.md): what changed from `17b958b` to `e2153eb`, measured.
- [docs/QLOO_COVERAGE.md](docs/QLOO_COVERAGE.md): Qloo coverage per city and data limits.
- [docs/submission/](docs/submission/): Devpost text, demo script, architecture diagram, publication checklist.

## License

MIT — see [LICENSE](LICENSE).
