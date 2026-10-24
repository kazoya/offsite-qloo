# Before / after: `17b958b` → `e2153eb`

`17b958b` is the last commit before the fairness and agent-loop work. `e2153eb` is `main` as deployed on 2026-10-24
(Asia/Amman). Everything below was measured on the box from those two commits (a git worktree for the old one), not
estimated.

## Size of the change

| Measure | 17b958b | e2153eb | How measured |
|---|---:|---:|---|
| Commits in between | | 15 | `git rev-list --count 17b958b..e2153eb` |
| Files changed | | 47 (+6361 / −134 lines) | `git diff --shortstat 17b958b e2153eb` |
| TypeScript lines in `src/` + `app/` | 2992 | 5274 | `find src app -name '*.ts*' \| xargs cat \| wc -l` |
| Test files | 7 | 15 | `ls tests/*.test.ts` |
| Offline tests (all passing) | 78 | 148 | `npx vitest run` on each commit |
| Agent modules in `src/agent/` | 8 | 14 | added: `loop.ts`, `fairness.ts`, `diff.ts`, `deadline.ts`, `names.ts`, `baselines.ts` |

The old Devpost draft said "71 offline Vitest tests". The real count at `17b958b` was 78; the draft was stale.

## Capabilities

| Capability | 17b958b | e2153eb | Commit(s) |
|---|---|---|---|
| Qloo-ranked dinner + activity, hours, diets, budget, R1/R2/R3 policy, 3 diverse options | yes | yes (unchanged weights) | earlier |
| Venues without a diet tag | dropped when a diet was needed | kept, penalised, labelled "diet unconfirmed" | `67e3eca` |
| Artist seeds | top search hit | exact normalised match only, plus Arabic/Latin alternate spellings | `f34f1f5`, `81eae26` |
| Team Fairness Engine (per-member coverage, Best fit / Fairest / Cheapest, who is left out) | no | yes | `d885879` |
| Agent loop with a decision log and an approval gate | no (single pipeline call) | yes, `plan.agent.log` | `188b2f4` |
| Feedback replanning (`budget`, `reject_venue`, `not_fair`) and met/not-met checks | no | yes | `188b2f4` |
| `manager_reject` feedback (reason required) | no | yes | `da803dc` |
| Planner deadline, rate limits, body caps | no | yes (25 s; 10/min and 30/min per instance) | `1aaefd8` |
| Approvals on the hosted demo | shared queue, manager PIN required | per-visitor sandbox, no PIN; PIN only in `APPROVALS_MODE=shared` | `0200b4b` |
| Synthetic demo company and plan diff ("What changed") | no | yes | `32ff547`, `f8ce374` |
| Judge demo path UI (fairness meter, feedback buttons, log, diff) | no (API-only) | yes, AR and EN | `c85690d`, `f8ce374` |
| Arabic decision log and feedback checks | no | yes | `f8ce374` |
| A / A+ / B / C experiment with committed aggregate results | no | yes | `a8c56b7` |

## Metrics

There is no experiment at `17b958b`, so there is no "before" number for the planner's coverage or fairness. The
experiment in `e2153eb` compares **strategies on the same data**, not the two commits. Its main table (seed 20261024,
24 synthetic teams, 179 members, means over teams):

| Metric | A popular | A+ popular in pool | B affinity only | C full planner |
|---|---:|---:|---:|---:|
| Mean member coverage ↑ | 0.138 | 0.224 | 0.234 | 0.319 |
| Members left out by every option ↓ | 0.490 | 0.348 | 0.375 | 0.181 |
| Options within budget ↑ | 0.875 | 0.764 | 0.792 | 1.000 |
| Venues with unknown hours ↓ | 0.333 | 0.299 | 0.222 | 0.243 |

C is worse than B on unknown hours, and with tighter budgets C proposed no plan for 5 of 24 teams. Full tables and
caveats: [EXPERIMENT.md](EXPERIMENT.md). Coverage here is a match with Qloo tags, not measured satisfaction.

## What did not change

- Ranking weights (`0.5 / 0.25 / 0.15 / 0.1`) and the R1/R2/R3 policy.
- The Qloo endpoints used (`GET /search`, `GET /v2/insights`) and the private, uncommitted cache.
- Supported cities (Amman, Dubai, Riyadh, Cairo; Jeddah refused).
- No booking, payment, sign-in or database.
