# Demo video script: Offsite Planner Agent (90–120 seconds, 7 steps)

Rewritten 2026-10-24 (Asia/Amman) for the judge demo path on https://offsite-qloo.vercel.app/en. Every shot below was
run on production the same day (see [../TEST_REPORT.md](../TEST_REPORT.md)); record only what the hosted demo does.

**Rules this follows** (https://qloo.devpost.com/rules, read 2026-10-24): the required items are a link to a working
demo, a public repo with an open-source licence visible in About, and an English text description. A video is useful
but the project "must function as depicted". Materials must be in English, so the English voiceover is the main
track; the Arabic one is a second version or subtitles. Judging criteria (equal weight): Technological
Implementation, Design, Potential Impact, Quality of the Idea.

## Setup (before recording)

1. Open https://offsite-qloo.vercel.app/en in a fresh browser window (a fresh window also gets an empty approvals
   sandbox). Desktop width; zoom 100 %.
2. Rehearse once. If the app shows "Qloo unavailable", wait a minute and use Retry.
3. **Step 7 needs an option above the approval threshold.** With the default 12 people the total stays under
   284 JOD, so set **Headcount to 20** right after loading the demo company. Verified: with headcount 20, the plan and
   a budget replan to 25 JOD each showed 3 "Send to manager" buttons.

## Data handling while recording

- No raw Qloo JSON, network tab, `.cache/`, terminal, `.env` or API key on screen.
- Venue names appear only as normal product use. Don't pause or zoom on them, and keep them out of captions,
  thumbnails and the Devpost text.
- The demo company (Nimbus Analytics) and its 12 members are synthetic.

## Shot list (English voiceover)

| # | Time | Screen | Voiceover |
|---|---|---|---|
| 1 | 0:00–0:12 | Click **Load demo company (12 people)**; the synthetic team collapses into a summary. Set Headcount to 20. | "Planning a team outing means a dozen different tastes, a budget and a manager's sign-off. This agent starts from what each person actually likes." |
| 2 | 0:12–0:27 | Click **Plan the offsite**; skeleton, then 3 options (activity, then dinner). | "It turns the team's cuisines, activities and favourite artists into Qloo taste signals and asks Qloo's Insights API to rank real venues in Amman. Three different evenings come back, checked against opening hours, diets and the budget." |
| 3 | 0:27–0:42 | Expand **Why Qloo picked this** on option 1; show the score breakdown. | "Each pick explains itself: which members it matches, which taste signal Qloo credits, and how affinity, member match and rating add up. Prices are labelled as estimates." |
| 4 | 0:42–0:57 | Point at **Fairness and fit**: team average, lowest member, coverage, who is left out, the **Fairest** badge and "Why option N may suit the team better". | "The best score isn't always fair. The fairness engine shows, per option, who is covered and who is left out, and which option is fairest and what it costs." |
| 5 | 0:57–1:12 | In **Give the agent feedback**, set the budget to 25 and click **Replan with this budget**. | "Now I give feedback, like a lower budget. The agent replans with everything it was told, reusing the Qloo answers it already has." |
| 6 | 1:12–1:30 | Show **What changed** (old vs new), the feedback check marked met, and open two steps of the **agent decision log**. | "It shows what changed, checks whether it met my request, and logs every decision: understand, query Qloo, rank, check budget and hours, propose, explain, and the approval gate." |
| 7 | 1:30–1:50 | Click **Send to manager** on an option marked "Needs manager approval", open approvals, enter a name, **Approve**. Show the audit trail. | "Anything above the company threshold waits for a human. The agent never books or pays. In this demo sandbox, private to my browser with no PIN, the manager approves and every step lands in the audit trail." |
| — | 1:50–2:00 | Optional: switch to `/ar` (RTL). | "Arabic first, English too. Taste from Qloo, rules from your company." |

## Arabic voiceover (same timings)

| # | التعليق الصوتي |
|---|---|
| 1 | «تنظيم طلعة للفريق يعني أذواقًا كثيرة وميزانية وموافقة المدير. هذا الوكيل يبدأ مما يحبّه كل شخص فعلًا.» |
| 2 | «يحوّل مطابخ الفريق وأنشطته وفنانيه المفضّلين إلى إشارات ذوق من Qloo، ويطلب من واجهة Insights ترتيب أماكن حقيقية في عمّان. والنتيجة ثلاث أمسيات مختلفة، مع التحقق من ساعات العمل والأنظمة الغذائية والميزانية.» |
| 3 | «كل اختيار يشرح نفسه: أيّ الأعضاء يطابقهم، وأيّ إشارة ذوق اعتمد عليها Qloo، وكيف تجتمع درجة التقارب ومطابقة الأعضاء والتقييم. والأسعار مُعلَّمة كتقديرات.» |
| 4 | «الأعلى درجةً ليس دائمًا الأعدل. محرك العدالة يبيّن لكل خيار من يشمله ومن يُستبعد، وأيّ خيار هو الأعدل وكم يكلّف.» |
| 5 | «الآن أعطي الوكيل ملاحظة، مثل ميزانية أقل. فيعيد التخطيط بكل ما قيل له، مستخدمًا إجابات Qloo التي لديه.» |
| 6 | «يعرض ما تغيّر، ويتحقق إن كان قد نفّذ طلبي، ويسجّل كل قرار: الفهم، والاستعلام من Qloo، والترتيب، وفحص الميزانية والساعات، والاقتراح، والشرح، وبوابة الموافقة.» |
| 7 | «كل ما يتجاوز حد الشركة ينتظر قرار إنسان. الوكيل لا يحجز ولا يدفع. في هذا الصندوق التجريبي الخاص بمتصفحي، وبدون رمز PIN، يوافق المدير وتُسجَّل كل خطوة في سجل التدقيق.» |
| — | «بالعربية أولًا، وبالإنجليزية أيضًا. الذوق من Qloo، والقواعد من شركتك.» |

## Recording checklist

- [ ] Hosted demo is live and matches this script (headcount 20 set in shot 1).
- [ ] Repo is public with the MIT licence visible in About (owner action before submitting).
- [ ] No raw Qloo data, cache, terminal or key on screen; no lingering on venue names.
- [ ] 90–120 seconds, English audio or English subtitles.
- [ ] Nothing in the video claims bookings, payments, sign-in or features that don't exist.
