# Test report

Commit under test: `main` at `e2153eb`. Production deployment under test: https://offsite-qloo.vercel.app
(deployment `dpl_9GXHP6NaVWD2YSKuVqEYqnpejAdR`). All times are Asia/Amman (UTC+3), 2026-10-24. Outputs below are
copied from the runs; venue names from live Qloo data are left out on purpose (counts only).

## 1. Typecheck

`npx tsc --noEmit`, started 11:42:13.

```
tsc exit=0
```

## 2. Unit tests (offline, synthetic fixtures, mocked Qloo, no key)

`npx vitest run`, started 11:42:15.

```
 ✓ tests/baselines.test.ts (9 tests)
 ✓ tests/qloo-client.test.ts (13 tests)
 ✓ tests/approvals-sandbox.test.ts (6 tests)
 ✓ tests/approvals-pin.test.ts (7 tests)
 ✓ tests/diff.test.ts (7 tests)
 ✓ tests/agent.test.ts (32 tests)
 ✓ tests/agent-loop.test.ts (24 tests)
 ✓ tests/hours.test.ts (10 tests)
 ✓ tests/names.test.ts (6 tests)
 ✓ tests/decision-log-ar.test.ts (2 tests)
 ✓ tests/fairness.test.ts (8 tests)
 ✓ tests/variety.test.ts (4 tests)
 ✓ tests/guard.test.ts (7 tests)
 ✓ tests/approvals.test.ts (8 tests)
 ✓ tests/ui-errors.test.ts (5 tests)

 Test Files  15 passed (15)
      Tests  148 passed (148)
   Duration  1.12s
vitest exit=0
```

## 3. Production build

`rm -rf .next && npx next build` (Next.js 16), clean build.

```
✓ Compiled successfully
✓ Generating static pages using 7 workers (6/6)

Route (app)
┌ ○ /_not-found
├   /[lang]
│ ├ ● /ar
│ └ ● /en
├ ƒ /[lang]/approvals
├ ƒ /api/approvals
├ ƒ /api/approvals/[id]
└ ƒ /api/plan
build exit=0
```

## 4. Experiment reproducibility

`npm run experiment -- --seed 20261024` from the private response cache, started 11:42:28.

```
teams=24 members=179 qloo http=0 cache hits=56
```

| File | sha256 of the rerun | Committed file | Result |
|---|---|---|---|
| main results | `918f16dbc9800e58bfd9bcfc2c042da252c1462a873733e98b111167241d71e5` | `docs/experiment-results.json` | byte-identical |
| tight budgets (`--budgets-usd 15,20,25,30,40,55`) | `ef9fa25471a631b3b5c4780aedb2d6cca876efcdf763321adadf313fe6a5383e` | `docs/experiment-results-tight-budgets.json` | byte-identical |

The rerun made no Qloo HTTP calls. No weights, metrics or results were changed.

Overall table from the rerun (A / A+ / B / C):

```
meanCoverage       0.138  0.224  0.234  0.319
minCoverage        0.000  0.007  0.014  0.042
zeroShare          0.734  0.582  0.590  0.464
leftOutEverywhere  0.490  0.348  0.375  0.181
diversity          0.667  0.708  0.646  0.778
budgetFit          0.875  0.764  0.792  1.000
dietConfirmed      0.514  0.514  0.514  0.806
unknownHours       0.333  0.299  0.222  0.243
closedAtSlot       0.042  0.111  0.187  0.000
noPlan             0      0      0      0      (3 options each)
```

## 5. Production user path (headless Chrome, Playwright), 11:43

Run once to spare the Qloo quota. Demo company: synthetic, 12 people, Amman, 30 JOD per person.

| Step | Check | Result |
|---|---|---|
| 1 | `/en` loads, "Load demo company" fills the team | pass |
| 2 | Plan the offsite: `POST /api/plan` | 200, 3 options |
| 3 | "Why Qloo picked this" summaries | 6 present, expand on click |
| 4 | Fairness meter (team average, lowest member, coverage), "Fairest" label, "Why option N may suit" card | pass |
| 5 | Feedback: budget 20 JOD per person → replan | 200 |
| 6 | "What changed" diff and feedback checks; decision log | present; 1 met, 0 not met; 16 log steps |
| 5b | Manager reject with a reason (UI) | 200 |
| 7 | Default demo (headcount 12): "Send to manager" buttons | 0 (no option above the R2 threshold; see issue 1) |
| 7 | Headcount 20: send to manager, approvals page, approve | 3 buttons; send 201; "No PIN needed" sandbox banner, no PIN field; approve 200 |
| 7b | Fresh browser context on the approvals page | empty ("Nothing here yet"): sandboxes are private per visitor |
| AR | `/ar` plan in Arabic | 200, Arabic decision-log heading, 0 page errors |

Demo-script order check, 11:48: load demo company → headcount 20 → plan (200, 3 "Send to manager" buttons) → budget
replan to 25 JOD (200, still 3 buttons, "What changed" shown, 0 not met). Nothing was sent in this run.

## 6. API smoke checks (production), 11:37–11:38

| Check | Result |
|---|---|
| Fresh plan | 3 options, 12 members in the fairness block, 7 log entries, 4 Qloo calls |
| Budget replan | plan changed, 0 extra Qloo calls |
| `manager_reject` replan | rejected pairing removed |
| `manager_reject` without a reason | 400 |
| Jeddah | 422 (unsupported city) |
| Rate limit on one reused connection | `/api/plan`: 10 × 200 then 429; approvals: about 30 × 200 then 429 |

## 7. Fairness Engine regression

The Fairness Engine did not break the Qloo integration, planning or approvals: steps 2–7 above pass, the fresh plan
still makes its Qloo calls (4), the replan reuses them (0 new calls), and the sandbox approval flow works end to end.

## Known issues found in sections 1–7 (not demo-blocking; 1, 3 and 4 fixed in section 8)

1. **Step 7 needs a change in the form.** With the default demo company (12 people, about 233 JOD total) no option
   exceeds the R2 threshold (400 USD ≈ 284 JOD), so no "Send to manager" button appears. Workaround for judges: set
   headcount to 20 before planning. Possible fix (needs approval, not done): default the demo company to 20 people. **Fixed in section 8.**
2. **Rate limit is per instance and per IP.** It is in memory, so it is not a global limit across Vercel instances.
3. **Arabic provider line** shows the raw value `rule-based` (`src/ui/Planner.tsx`). **Fixed in section 8.**
4. **`/favicon.ico` returns 404**, which logs one console error. **Fixed in section 8.**
5. **Approvals sandbox is in memory**: it resets when a server instance restarts.

## 8. Fix pass on `fix/demo-polish` (2026-10-24, 12:30–12:35 Asia/Amman)

Approved changes only: demo company headcount 20 (12 member profiles unchanged), translated narration provider label
(`providerText` in `src/i18n/index.ts`), and a favicon (`app/favicon.ico`, `app/icon.svg`). No change to the
experiment weights, metrics, results or seed.

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run` | 15 files, 149 tests passed (one new test for the provider label; the demo-company test now expects headcount 20) |
| `rm -rf .next && npx next build` | exit 0; routes include `/icon.svg` and `/favicon.ico` |
| Experiment rerun from the cache (seed 20261024, default and tight budgets) | 0 Qloo HTTP calls, 56 cache hits; both JSON files byte-identical to the committed ones |

Local user path (`next start`, headless Chrome), one run:

| Step | Check | Result |
|---|---|---|
| — | `/favicon.ico`, `/icon.svg` | 200 (`image/x-icon`, `image/svg+xml`); both linked in the page head; no non-API 4xx |
| 1 | Load demo company | loaded; headcount field 20, budget 30 |
| 2 | Plan | 200, 3 options |
| 3 | "Why Qloo picked this" | 6 summaries, expand on click |
| 4 | Fairness meter and labels (team average, lowest member, coverage, "Fairest", "Why option N may suit") | pass |
| 5 | Budget feedback 25 JOD → replan | 200; fairness block still shown |
| 6 | "What changed", decision log | present; 16 log steps |
| 5b | Manager reject with a reason | 200 |
| 7 | "Send to manager" with the default demo headcount | 3 buttons on the first plan and after the replans; send 201; sandbox banner, no PIN field; approve 200 |
| EN | Provider line | "Narration: Rule-based (no LLM)" |
| AR | `/ar` demo plan | 200; headcount 20; 3 send buttons; provider line "الصياغة: قائمة على القواعد (بدون نموذج لغوي)"; no Latin "rule-based"; 0 page errors |
