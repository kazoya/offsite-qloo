# Offsite Planner Agent: team outings with taste

*Devpost submission text. Solo build by Suhib Asrawi. Draft, not submitted.*

**Tagline:** A bilingual (Arabic/English) agent that turns a whole team's tastes into three evening plans (an activity,
then dinner) that fit the budget, respect opening hours and dietary needs, and go through manager approval with a full
audit trail.

## Inspiration

In Amman, Riyadh and Dubai, team outings are planned the same way everywhere: a group chat, a spreadsheet and someone
guessing what twelve colleagues might enjoy. Then finance asks whether it's in budget, and a manager has to sign off.
Generic LLM suggestions are usually the same few famous places, ignore who is actually on the team, and can't say
whether a place is open on the day. I wanted an agent that starts from what each person likes and shows its reasoning,
working in Arabic first.

## What it does

* **Group taste profile.** Each member enters cuisines, activities, favourite artists and dietary needs. The agent turns
  these into weighted votes, so things more people want count for more, and resolves artists to Qloo entities as taste
  signals.
* **Qloo-ranked venues.** It asks Qloo's Insights API for restaurants and activity venues in the chosen city, using the
  team's cuisine and activity tags plus the artist entities as signals. Qloo's affinity score is the largest weight in
  the ranking.
* **Why Qloo picked this.** Each option shows which members' tastes it matches and, using Qloo explainability, which
  taste signal drove the match.
* **Three different evenings.** Each option is an activity and then dinner, with no dinner repeated across the three.
* **Opening hours.** The chosen date and start time are checked against Qloo's hours. Venues closed in their slot are
  left out; venues with no hours are kept and clearly labelled "hours unknown".
* **Dietary needs.** Halal, vegetarian, vegan and gluten-free count only when Qloo's tags confirm them. Anything else is
  labelled "not confirmed", never claimed as safe.
* **Budget and policy.** Per-person cost is estimated from Qloo's price level in local currency (JOD, AED, SAR, EGP),
  with each price labelled as an estimate. Over budget per person is rejected (R1). A total above 400 USD needs manager
  approval (R2). Anything else is auto-approved (R3). Every decision, including the rejected combinations, goes into an
  audit log.
* **Manager approval page.** Options that need approval are sent to a queue. The manager approves, or rejects with a
  required reason. Each request can be decided once, and every step is added to an append-only approval audit trail.
* **Honest about coverage.** Jeddah is refused with a clear message, because Qloo resolves it to all of Saudi Arabia.
  The matched locality is always shown, and so is a note when Qloo has no Arabic name for a venue.
* **Bilingual and RTL.** Arabic (`/ar`, right-to-left) and English (`/en`), and it works on mobile. There are clear
  loading, "Qloo unavailable" (with retry) and "no plan fits" states.

## How we built it

* **Next.js 16 + React 19 + TypeScript**, one app for the UI and the API routes (`/api/plan`, `/api/approvals`).
* **Qloo connector:** `GET /search` for artist entities and `GET /v2/insights` for places, using `filter.location.query`
  (country-qualified), `filter.tags`, `signal.interests.tags`, `signal.interests.entities` and
  `feature.explainability`. It has timeouts and retries, sends the key in the header only (redacted from logs), and
  keeps a private server-side response cache that is not committed.
* **Agent pipeline:** taste profile → Qloo ranking → hours check → dietary filter → budget estimate → policy →
  diverse shortlist → narration. Ranking: 0.5 × Qloo affinity + member coverage + team fit + rating.
* **Narration:** a deterministic rule-based narrator by default. Any OpenAI-compatible LLM can be plugged in
  (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`), but it only rewrites the explanation and never changes ranking or
  policy. If it fails, the app falls back to the rule-based text.
* **Approvals:** a small store with serialised writes and atomic file replacement, plus 409 on repeated decisions.
* **Tests:** 71 offline Vitest tests using invented venues and a mocked Qloo, covering the client, planner, variety,
  hours, policy, approvals, errors, i18n and LLM fallback. The build is CPU-only, with no GPU or model hosting.

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
* It works fully without any LLM key.

## What we learned

* Taste signals from music and cuisine make group recommendations noticeably more personal than category filters.
* For corporate use, explainability and audit trails matter as much as recommendation quality.
* Location strings and data coverage need to be checked per city before you promise anything to a user.

## What's next

* Sign-in and roles for the approval page (today it has **no authentication** and is meant as a single-company demo).
* A real database instead of the local JSON store.
* Booking and availability through reservation partners, since Qloo hours are not live availability.
* Public holidays, travel time between venues, and more cities as Qloo coverage allows (Jeddah is not supported today).
* A calendar invite and an expense report generated from the approved plan.

## Known limitations (honest list)

* Prices are estimates: restaurants from Qloo's price level, activities from a heuristic table.
* Venues with unknown hours are labelled but not ranked lower. Public holidays are not modelled.
* The approval page and API have no authentication, and the store is single-process.
* Without an LLM key the narration is template-based, which works but is less fluent.
* Coverage: Amman, Dubai, Riyadh and Cairo; Riyadh and Cairo resolve to a region, so venues can be far apart.
* Some validation messages are still English-only.

## Built with

`qloo-api` · `typescript` · `next.js` · `react` · `node.js` · `vitest` · `openai-compatible-llm (optional)` · `css (rtl)`

## Data note

Qloo responses are cached privately on the server and are not published in the repository. Tests and examples use
invented venues. The coverage document in the repo contains aggregate statistics only.

## Links (to fill in before submitting)

* Demo: *(hosted URL: Devpost requires an externally hosted, publicly reachable demo)*
* Code: https://github.com/kazoya/offsite-qloo *(must be made public, MIT license visible in About)*
