import { notFound } from "next/navigation";
import { ACTIVITIES, CITIES, CUISINES, DIETARY, UNSUPPORTED_CITIES } from "@/connectors/qloo/catalog";
import { t } from "@/i18n";
import type { Lang } from "@/agent/types";
import { Header } from "@/ui/Header";
import { Planner } from "@/ui/Planner";

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (lang !== "ar" && lang !== "en") notFound();
  const l = lang as Lang;
  const pick = (i: { key: string; en: string; ar: string }) => ({ key: i.key, label: l === "ar" ? i.ar : i.en });
  return (
    <main>
      <Header l={l} page="" title={t("title", l)} subtitle={t("subtitle", l)} />
      <Planner
        lang={l}
        cities={CITIES.map((c) => ({ key: c.name, label: l === "ar" ? c.ar : c.name, currency: c.currency }))}
        unsupported={UNSUPPORTED_CITIES.map((c) => ({
          key: c.name,
          label: `${l === "ar" ? c.ar : c.name} (${l === "ar" ? "غير مدعومة بعد" : "not supported yet"})`,
          reason: l === "ar" ? c.reasonAr : c.reasonEn,
        }))}
        cuisines={CUISINES.map(pick)}
        activities={ACTIVITIES.map(pick)}
        dietary={DIETARY.map(pick)}
      />
      <footer className="muted">Powered by Qloo Taste AI</footer>
    </main>
  );
}
