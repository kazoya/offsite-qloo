# Offsite Planner Agent: team outings with taste

*Devpost submission text. Solo build by Suhib Asrawi. Draft, not submitted.*

**Tagline:** A bilingual (Arabic/English) agent that turns a whole team's tastes into three evening plans (an activity,
then dinner) that fit the budget, respect opening hours and dietary needs, show who each plan leaves out, replan on
feedback, and go through manager approval with a full audit trail.

## Inspiration

In Amman, Riyadh and Dubai, team outings are planned the same way everywhere: a group chat, a spreadsheet and someone
guessing what twelve colleagues might enjoy. Then finance asks whether it's in budget, and a manager has to sign off.
Generic LLM suggestions are usually the same few famous places, ignore who is actually on the team, and can't say
whether a place is open on the day. I wanted an agent that starts from what each person likes and shows its reasoning,
working in Arabic first.

## What it does

* **Group taste profile.** Each member enters cuisines, activities, favourite artists and dietary needs. The agent turns
  these into weighted votes and resolves artists to Qloo entities (exact name match only, with Arabic/Latin
  spellings) as taste signals. Member names never leave the server.
* **Qloo-ranked venues.** Qloo's Insights API ranks restaurants and activity venues in the chosen city using the
  team's tags and artist entities as signals. Qloo affinity is the largest weight in the ranking (0.5, then member
  coverage 0.25, team fit 0.15, rating 0.1).
* **Why Qloo picked this.** Each option shows which members it matches, which taste signal Qloo's explainability
  credits, and a score breakdown.
* **Team Fairness Engine.** For every option it scores each member (both venues match, one, or none), shows the team
  average, the lowest member and who is left out, and labels the options Best fit, Fairest and Cheapest. When the
  fairest option isn't the top one, it says who it adds and what it costs.
* **An agent loop you can talk back to.** Each run is a logged loop: understand → query Qloo → rank → check budget
  and hours → propose → explain → approval gate. You can give feedback (a new budget, reject a venue, "not fair to
  <member>", or a manager rejection with a reason) and it replans with all feedback so far, reusing the Qloo answers
  it already has. It then checks each request as met or not met, and shows what changed against the previous and
  the original plan.
* **Opening hours, diets and budget.** Venues closed in their slot are left out; unknown hours are labelled. Diets
  count only when Qloo's tags confirm them. Per-person cost is estimated in local currency and labelled as an
  estimate.
* **Policy and approvals.** Over budget per person is rejected (R1); a total above 400 USD needs a manager (R2);
  anything else is auto-approved (R3). The agent never books, pays or sends anything by itself: the user clicks
  "Send to manager", and the manager approves or rejects (reason required), once, with an append-only audit trail.
* **Honest about coverage.** Jeddah is refused because Qloo resolves it to all of Saudi Arabia; the matched locality
  is always shown.
* **Bilingual and RTL.** Arabic (`/ar`) and English (`/en`), on desktop and mobile.

## Does it help? A small offline experiment

On 24 synthetic teams (179 members, seed 20261024, one cached snapshot of Qloo data) we compared four strategies:
A city-popular venues, A+ popularity within the same pools, B Qloo affinity only, and C the full planner.

| Mean over teams | A | A+ | B | C |
|---|---:|---:|---:|---:|
| Member coverage ↑ | 0.138 | 0.224 | 0.234 | 0.319 |
| Members left out by every option ↓ | 0.490 | 0.348 | 0.375 | 0.181 |
| Options within budget ↑ | 0.875 | 0.764 | 0.792 | 1.000 |
| Venues with unknown hours ↓ | 0.333 | 0.299 | 0.222 | 0.243 |

Coverage means "the venue carries one of the member's Qloo tags", not measured satisfaction; no satisfaction scores
were collected. C loses to B on unknown hours, and with tighter budgets C proposed no plan for 5 of 24 teams. Some of
C's gains hold by construction (it filters on budget and hours). The run is reproducible from the cache and the
committed results are byte-identical on rerun. Details: `docs/EXPERIMENT.md`.

## How we built it

* **Next.js 16 + React 19 + TypeScript**, one app for the UI and the API routes (`/api/plan`, `/api/approvals`).
* **Qloo connector:** `GET /search` for artist entities and `GET /v2/insights` for places, using `filter.location.query`
  (country-qualified), `filter.tags`, `signal.interests.tags`, `signal.interests.entities` and
  `feature.explainability`. Timeouts and retries, the key in a header only (never logged), identical calls answered
  once per run, and a private server-side cache that is never committed.
* **Agent loop** (`src/agent/loop.ts`): a deterministic loop around the planner with a decision log, feedback
  replanning, met/not-met checks and an approval gate. Pure modules for fairness (`fairness.ts`) and plan diffs
  (`diff.ts`).
* **Reliability:** a 25-second planner deadline with a clean error, per-client rate limits (10 plans and 30
  approval calls per minute) and request-body caps.
* **Narration:** rule-based by default (production uses it). Any OpenAI-compatible LLM can be plugged in, but it only
  rewrites the explanation text and never changes ranking or policy; on failure it falls back.
* **Approvals:** on the hosted demo, each visitor gets a private in-memory sandbox (cookie-scoped, 2-hour expiry, no
  PIN). A shared mode with a manager PIN exists for self-hosting (`APPROVALS_MODE=shared`).
* **Tests:** 149 offline Vitest tests in 15 files, using invented venues and a mocked Qloo (no key, no network). CPU
  only, no GPU or model hosting.

## Challenges we ran into

* **Location matching.** A bare "Riyadh" matched a village in Sudan, and Jeddah matched the whole country. I switched
  to country-qualified queries, show the matched locality, and refuse cities that don't resolve properly.
* **Sparse fields.** Activities have no price level in Qloo, so activity costs come from a labelled heuristic table.
  Arabic venue names are rare (0–22 % by city), so many names stay in Latin script in the Arabic UI.
* **Opening hours.** Hours can run past midnight, and about a quarter of venues come back marked closed every day,
  which looks like missing data. Those venues are treated as "hours unknown" rather than closed.
* **Variety.** At first the best-scoring restaurant showed up in all three options. Diversity rules now guarantee
  three different dinners.

## Accomplishments that we're proud of

* Qloo is central to the result: affinity drives the ranking, explainability drives the "why", and hours, price level
  and dietary tags drive the checks.
* A complete flow from team tastes to plan, approval and audit trail, not just a list of recommendations.
* Honest output: estimates, unknown hours, unconfirmed diets and unsupported cities are all labelled instead of hidden.
* A fairness view that names who is left out instead of hiding it behind an average.
* An agent that takes feedback and then reports whether it actually met it.
* It works fully without any LLM key.

## What we learned

* Taste signals from music and cuisine make group recommendations noticeably more personal than category filters.
* For corporate use, explainability and audit trails matter as much as recommendation quality.
* Location strings and data coverage need to be checked per city before you promise anything to a user.

## What's next

* Sign-in and roles for approvals (today there is no authentication; the hosted demo uses a private per-visitor sandbox).
* A real database instead of the local JSON store.
* Booking and availability through reservation partners, since Qloo hours are not live availability.
* Public holidays, travel time between venues, and more cities as Qloo coverage allows (Jeddah is not supported today).
* A calendar invite and an expense report generated from the approved plan.

## Known limitations (honest list)

* Prices are estimates: restaurants from Qloo's price level, activities from a heuristic table.
* Opening hours are weekly hours, not availability; 22–33 % of venues have unknown hours. Public holidays are not
  modelled.
* Dietary tags are a presence signal only, never a safety statement.
* The hosted approvals sandbox is in memory and resets when a server instance restarts; there is no sign-in.
* Rate limits are per server instance, not global.
* Coverage: Amman, Dubai, Riyadh and Cairo; Riyadh and Cairo resolve to a region, so venues can be far apart.
* Arabic venue names are rare in Qloo data (0–22 %), and a few labels (some validation messages) are still English
  in the Arabic UI.
* The experiment uses synthetic teams and Qloo's own tags; it does not measure real satisfaction.

## Built with

`qloo-api` · `typescript` · `next.js` · `react` · `node.js` · `vercel` · `vitest` · `openai-compatible-llm (optional)` · `css (rtl)`

## Data note

Qloo responses are cached privately on the server and are not published in the repository. Tests and examples use
invented venues. The coverage document in the repo contains aggregate statistics only.

## Testing instructions for judges

No account, PIN or key is needed, and the demo is free to use.

1. Open https://offsite-qloo.vercel.app/en (Arabic: https://offsite-qloo.vercel.app/ar).
2. Click **Load demo company (20 people)**. The team is synthetic. It plans for 20 people, so some options go above
   the approval threshold and can be sent to the manager.
3. Click **Plan the offsite**. Open **Why Qloo picked this** and look at **Fairness and fit**.
4. Under **Give the agent feedback**, set a new budget (for example 25) and click **Replan with this budget**, or
   mark an option "not fair" to a member, or reject it as the manager with a reason.
5. Read **What changed**, the feedback checks and the agent decision log.
6. Click **Send to manager** on an option marked "Needs manager approval", open the approvals page, and approve or
   reject. The queue is a private sandbox for your browser; no PIN is needed and nothing is booked or paid.

Offline: `npm install && npm test` runs all 149 tests without a key. See the README for running the app with your own Qloo
hackathon key.

## Links

* Demo: https://offsite-qloo.vercel.app (English `/en`, Arabic `/ar`).
* Code: https://github.com/kazoya/offsite-qloo (MIT licence). **The repository is private at the time of writing and
  must be made public, with the licence visible in the About section, before submitting.**
