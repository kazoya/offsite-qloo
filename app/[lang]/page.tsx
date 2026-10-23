import Link from "next/link";
import { notFound } from "next/navigation";
import { ACTIVITIES, CITIES, CUISINES, DIETARY } from "@/connectors/qloo/catalog";
import { t } from "@/i18n";
import type { Lang } from "@/agent/types";
import { Planner } from "@/ui/Planner";

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (lang !== "ar" && lang !== "en") notFound();
  const l = lang as Lang;
  const pick = (i: { key: string; en: string; ar: string }) => ({ key: i.key, label: l === "ar" ? i.ar : i.en });
  return (
    <main>
      <header className="top">
        <div>
          <h1>{t("title", l)}</h1>
          <p className="muted">{t("subtitle", l)}</p>
        </div>
        <nav aria-label={t("language", l)}>
          <Link href="/ar" className={l === "ar" ? "on" : ""} hrefLang="ar">العربية</Link>
          <Link href="/en" className={l === "en" ? "on" : ""} hrefLang="en">English</Link>
        </nav>
      </header>
      <Planner
        lang={l}
        cities={CITIES.map((c) => ({ key: c.name, label: l === "ar" ? c.ar : c.name, currency: c.currency }))}
        cuisines={CUISINES.map(pick)}
        activities={ACTIVITIES.map(pick)}
        dietary={DIETARY.map(pick)}
      />
      <footer className="muted">Powered by Qloo Taste AI</footer>
    </main>
  );
}
