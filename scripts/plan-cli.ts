/** Usage: npm run plan -- [data/sample-request.json] [--lang ar|en] */
import { readFileSync } from "node:fs";
import { planOffsite, type PlanRequest } from "../src/agent";
import { QlooClient } from "../src/connectors/qloo";
import { providerFromEnv } from "../src/llm";
import { DECISION_LABEL, money, renderReason } from "../src/i18n";

const args = process.argv.slice(2);
const file = args.find((a) => a.endsWith(".json")) ?? "data/sample-request.json";
const langIdx = args.indexOf("--lang");
const req = JSON.parse(readFileSync(file, "utf8")) as PlanRequest;
if (langIdx >= 0) req.language = args[langIdx + 1] === "ar" ? "ar" : "en";

const qloo = QlooClient.fromEnv();
const plan = await planOffsite(req, { qloo, llm: providerFromEnv() });
const l = req.language;
console.log(plan.overview, `\n[locality: ${plan.locality}] [narration: ${plan.provider}] [qloo http calls: ${plan.qlooHttpCalls}] [schedule: ${JSON.stringify(plan.schedule)}]\n`);
for (const o of plan.options) {
  console.log(`#${o.rank} ${DECISION_LABEL[o.decision][l]}  ${money(o.costPerPerson, plan.currency, l)}/pp  ${money(o.costTotal, plan.currency, l)} total  score=${o.score.toFixed(2)}`);
  for (const c of [o.dinner, o.activity]) {
    console.log(`   ${c.kind}: ${l === "ar" ? (c.place.nameAr ?? c.place.nameEn) : c.place.nameEn} (${c.categoryEn ?? "-"}) ~${money(c.costPerPerson, plan.currency, l)}`);
    for (const r of c.reasons) console.log(`      - ${renderReason(r, l)}`);
  }
  console.log(`   ${o.summary}`);
}
console.log("\nAUDIT");
for (const a of plan.audit) console.log(`  ${a.seq} ${a.decision} :: ${a.subject} :: ${a.rule}`);
if (plan.warnings.length) console.log("\nWARNINGS\n  " + plan.warnings.join("\n  "));
