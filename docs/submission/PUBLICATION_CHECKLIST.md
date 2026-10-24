# Publication and licence checklist

Checked against the official rules at https://qloo.devpost.com/rules and the organisers' submission guide
(`docs/SUBMISSION.md` in https://github.com/qloo/qloo-hackathon-kit), both read on 2026-10-24 (Asia/Amman).

**Deadline:** Oct 30 2026, 11:45 pm ET = **Sat Oct 31 2026, 06:45 Asia/Amman**. Drafts can be edited until then, not
after. Judging runs Nov 2–5; the three finalists are told soon after the close and must be available to present live
on Nov 5.

Status key: ✅ done · ⏳ owner action needed · ⚠️ known gap

## Required by the official rules

| # | Requirement | Status | Evidence / action |
|---|---|---|---|
| 1 | Working app that integrates the Qloo API and is agentic | ✅ | `/api/plan` runs an agent loop over Qloo Insights and Search; see `docs/ARCHITECTURE.md`, `docs/TEST_REPORT.md`. |
| 2 | Functions as depicted in the video and text | ✅ | Demo script and Devpost text describe only what was verified on production on 2026-10-24. Re-check if anything is redeployed. |
| 3 | Link to a functional demo | ✅ | https://offsite-qloo.vercel.app (`/en`, `/ar`). |
| 4 | Free, unrestricted access for judges until judging ends (Nov 5); credentials if anything is private | ✅ / ⏳ | No login or PIN needed (approvals sandbox). Keep the deployment and the Qloo key working until Nov 5; don't enable `APPROVALS_MODE=shared` on production. |
| 5 | Public code repository (GitHub, GitLab or Bitbucket) with all source and instructions | ⏳ | `kazoya/offsite-qloo` is **private** today. Make it public before submitting. README has setup steps. |
| 6 | Open-source licence, detectable and visible in the repo's About section | ✅ / ⏳ | `LICENSE` is MIT (© 2026 Suhib Asrawi). After making the repo public, confirm GitHub shows "MIT license" in About. |
| 7 | Text description in English | ✅ | `docs/submission/devpost.md` (draft, to paste into Devpost). |
| 8 | All materials in English (or with English translations) | ✅ | Devpost text in English; video has an English track; Arabic is optional extra. |
| 9 | Original work, created during the Submission Period (Sep 30 – Oct 30 2026) | ✅ | All commits dated 2026-10-24 per `git log`; no reused code. |
| 10 | Third-party code and data used within their terms | ✅ | Dependencies in `package.json` (MIT/Apache-style licences). Qloo data cached privately, never committed; repo docs hold aggregates only. |
| 11 | No sponsor financial support | ✅ | None received. |
| 12 | Submit on Devpost before the deadline | ⏳ | Owner submits; not done by the agent. |

## Organisers' submission guide (qloo-hackathon-kit)

| # | Item | Status | Where |
|---|---|---|---|
| 1 | Short problem statement | ✅ | devpost.md "Inspiration" |
| 2 | Qloo workflow / tools used and why | ✅ | devpost.md "How we built it", README Qloo table |
| 3 | Redacted request-to-result explanation, with entity/tag choices | ✅ | README, `docs/ARCHITECTURE.md`, `docs/QLOO_COVERAGE.md` |
| 4 | Demo or screenshots with no credential or personal data | ⏳ | Record per `demo-script.md` (synthetic team; no key, network tab or cache on screen) |
| 5 | Setup steps from a clean environment | ✅ | README (`npm install`, `.env` from `.env.example` with your own key, `npm test`, `npm run dev`) |
| 6 | Known limitations, including what the result does not establish | ✅ | devpost.md "Known limitations", `docs/EXPERIMENT.md` caveats |

The kit also says: keep the key on the server, never in a web page or a commit (✅, key only in server env and
`.env`, which is gitignored), and don't send personal data to Qloo (✅, only tags, artist names, the city and query
options are sent; member names stay on the server).

## Before making the repo public (owner)

- [x] No key-shaped string in any commit (`git log --all -p` scan for the hackathon key pattern: 0 hits, 2026-10-24).
- [x] No Qloo cache tracked (`git ls-files .cache`: 0 files). The only tracked images are the experiment chart and
      the architecture diagram, neither shows venue names.
- [ ] Re-run both checks on the final commit before switching the repo to public.
- [ ] README and devpost.md match the deployed commit.
- [ ] Repo About: description, website https://offsite-qloo.vercel.app, licence MIT visible.

## Known gaps to state openly

- ⚠️ Step 7 of the demo needs headcount 20 (documented in the judge instructions).
- ⚠️ Approvals sandbox is in memory; rate limits are per instance.
- ⚠️ No sign-in, booking or payment (by design for the demo).
