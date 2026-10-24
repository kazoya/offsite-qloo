# Demo video script: Offsite Planner Agent (max 3:00)

**Devpost requirements this is aligned with** (qloo.devpost.com, checked 2026-10-24):
* A demo video is **not required**. The required items are a **hosted, publicly reachable demo app**, a **public repo
  with an open-source license** shown in the repo's About section, and a **text description**. Judges "may choose to
  judge based solely on the text description, images, and video", so a short video is still worth making.
* All materials must be in English. The English voiceover is the primary track; the Arabic voiceover is an optional
  second version or subtitles.
* The judging criteria are equally weighted: **Technological Implementation** (how deeply Qloo is used), **Design**
  (a complete product, not a proof of concept), **Potential Impact** (a real problem for a real audience) and **Quality
  of the Idea** (a non-obvious use of Qloo). Each shot below says which criterion it supports.
* "The project must function as depicted in the video", so record only what the hosted demo actually does.

## Data handling while recording (Qloo terms)

* Record the **live app only**. Do not show raw Qloo JSON, the browser network tab, `.cache/` files, terminal output
  of `npm run plan` or `npm run probe`, or the API key / `.env`.
* Venue names appear in the UI as part of normal use of the product. Do not pause on them, zoom into them or list
  them in captions, and do not put venue names into the Devpost text or thumbnails.
* The team members (Lina, Omar, Sara, Khaled) and their tastes are invented (`data/sample-request.json`).
* Before publishing, re-check the Qloo hackathon API terms for display/attribution rules. This script assumes in-app
  display of results is permitted and redistribution of raw data is not.

## Setup before recording

* Hosted demo URL open in a clean browser profile, 1440×900, zoom 100 %. Also record one mobile shot (DevTools device
  mode, 390 px).
* Start at `/ar` with the sample team pre-filled. City: Amman, date 2026-11-12, start 18:00, budget 30 JOD per
  person, **headcount 20** (so all options exceed the 284 JOD threshold and need approval).
* Warm the cache once beforehand so the plan loads in about a second.
* Empty approvals store (`APPROVALS_FILE` pointing to a fresh file).

## Shot list

| # | Time | On screen (action) | Voiceover (EN) | Criterion |
|---|---|---|---|---|
| 1 | 0:00–0:15 | Title card, then the Arabic planner `/ar` (RTL). | "Planning a team offsite means pleasing a dozen different tastes, staying in budget and getting a manager's sign-off. Usually a spreadsheet and a group chat. This agent does it with Qloo's taste graph." | Impact |
| 2 | 0:15–0:35 | Scroll the team form slowly: four members, each with cuisines, activities, a favourite artist and dietary needs. Point at the city, date, start time and budget fields. | "Each team member adds what they like, including music. The agent turns those votes into one group taste profile, then picks a city, date, start time and a budget per person." | Idea |
| 3 | 0:35–0:45 | Open the city list and choose **Jeddah**: the inline notice appears and the submit button is disabled. Switch back to Amman. | "It is honest about coverage. Qloo resolves Jeddah to all of Saudi Arabia, so instead of guessing, the agent says it can't plan there yet." | Design |
| 4 | 0:45–1:05 | Press **Plan**: skeleton and spinner, then three options appear. Show the evening schedule line (activity 18:00–20:00, dinner 20:00–21:30). | "One request to Qloo's insights API ranks restaurants for the whole team, with the team's cuisines as tags and their favourite artists as taste signals. A second ranks activities. Out come three different evenings, activity first, then dinner." | Tech |
| 5 | 1:05–1:30 | Open **Why Qloo picked this** on option 1. Show the reasons: which members' tastes it matches and the Qloo taste-signal attribution. | "Every pick explains itself. Qloo's affinity score is the biggest weight in the ranking, and its explainability tells us which team member's taste drove the match. That's cultural grounding an LLM alone can't give." | Tech, Idea |
| 6 | 1:30–1:50 | Point at the badges: "open at this time" with hours, "hours unknown", "estimated price", "typical price, not from Qloo" and "no Arabic name in Qloo", plus the dietary confirmed / not confirmed line in the reasons. Then the notes block saying how many venues were left out for hours and diet. | "It checks Qloo's opening hours for the chosen day and time. Closed venues are left out, missing hours are flagged. Prices are labelled as estimates, and dietary needs count only when Qloo confirms them." | Design, Tech |
| 7 | 1:50–2:10 | Show cost per person and total, the status **Needs manager approval**, and the audit table below with rule IDs R1/R2/R3. | "Then company policy. Over budget per person is rejected. A total above 400 dollars, here 284 dinars, needs a manager. Every decision, including the rejected combinations, goes into an audit log." | Impact |
| 8 | 2:10–2:35 | Click **Send to manager** on option 1, then **View approvals**. On the approvals page, type an approver name and **Approve**. Open the **All** tab and the approval audit trail (M1). Try a second decision: it is refused. | "One click sends it to the manager's queue. The manager approves or rejects, and a rejection needs a reason. Each request can be decided once, and every step lands in an audit trail." | Design, Impact |
| 9 | 2:35–2:48 | Toggle to `/en`, then the mobile view (390 px) of the results. | "Arabic and English, right-to-left done properly, and it works on a phone." | Design |
| 10 | 2:48–3:00 | End card: repo URL, demo URL, "Built solo by Suhib Asrawi". Optional small line: "Works without an LLM key; an LLM only rewrites the explanation." | "Taste from Qloo, rules from your company, a plan your team will actually enjoy. Thanks for watching." | — |

Total: 3:00. If a cut is needed, shorten shot 9 to 5 s and shot 2 to 15 s.

## Arabic voiceover (same timings)

| # | التعليق الصوتي |
|---|---|
| 1 | «تنظيم طلعة للفريق يعني إرضاء أذواق كثيرة ومختلفة، والالتزام بالميزانية، وأخذ موافقة المدير. عادةً جدول بيانات ومجموعة دردشة. هذا الوكيل ينجز ذلك باستخدام شبكة الأذواق من Qloo.» |
| 2 | «كل عضو في الفريق يضيف ما يحبّه، حتى الموسيقى. يحوّل الوكيل هذه الأصوات إلى ملف ذوق واحد للمجموعة، ثم نختار المدينة والتاريخ ووقت البدء والميزانية للشخص.» |
| 3 | «وهو صادق في حدود التغطية: يطابق Qloo مدينة جدة مع السعودية كلها، فبدل التخمين يقول الوكيل إنه لا يستطيع التخطيط هناك بعد.» |
| 4 | «طلب واحد إلى واجهة Insights في Qloo يرتّب المطاعم للفريق كله، مع مطابخ الفريق كوسوم وفنانيهم المفضّلين كإشارات ذوق، وطلب آخر يرتّب الأنشطة. والنتيجة ثلاث أمسيات مختلفة: النشاط أولًا ثم العشاء.» |
| 5 | «كل اختيار يشرح نفسه. درجة التوافق من Qloo هي الوزن الأكبر في الترتيب، وميزة التفسير تبيّن ذوقُ أيِّ عضو قاد هذا الاختيار. هذا أساس ثقافي لا يقدّمه نموذج لغوي وحده.» |
| 6 | «ويتحقق من ساعات العمل في Qloo لليوم والوقت المختارين: الأماكن المغلقة تُستبعد، والساعات غير المعروفة يُشار إليها. الأسعار مُعلَّمة كتقديرات، والاحتياجات الغذائية لا تُحتسب إلا إذا أكّدها Qloo.» |
| 7 | «ثم سياسة الشركة: تجاوز الميزانية للشخص يعني الرفض، والإجمالي فوق 400 دولار، هنا 284 دينارًا، يحتاج موافقة المدير. وكل قرار، حتى التركيبات المرفوضة، يُسجَّل في سجل التدقيق.» |
| 8 | «بنقرة واحدة يُرسَل الخيار إلى قائمة المدير. يوافق المدير أو يرفض، والرفض يحتاج سببًا. كل طلب يُبتّ فيه مرة واحدة فقط، وكل خطوة تُسجَّل في سجل التدقيق.» |
| 9 | «بالعربية والإنجليزية، مع اتجاه من اليمين إلى اليسار بشكل صحيح، ويعمل على الهاتف.» |
| 10 | «الذوق من Qloo، والقواعد من شركتك، وخطة سيستمتع بها فريقك فعلًا. شكرًا للمشاهدة.» |

## Recording checklist

* [ ] Hosted demo is live and matches this script (Devpost requires an external, public demo).
* [ ] Repo is public with the MIT license visible in About.
* [ ] No raw Qloo data, cache, terminal or key on screen.
* [ ] Under 3:00, with English audio or subtitles.
