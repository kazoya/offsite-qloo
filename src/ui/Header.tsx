import Link from "next/link";
import { t } from "@/i18n";
import type { Lang } from "@/agent/types";

/** Shared header: title + page nav + language switch that stays on the same page. */
export function Header({ l, page, title, subtitle }: { l: Lang; page: "" | "approvals"; title: string; subtitle: string }) {
  const suffix = page ? `/${page}` : "";
  return (
    <header className="top">
      <div>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
      </div>
      <nav aria-label={t("language", l)}>
        {page ? (
          <Link href={`/${l}`}>{t("backToPlanner", l)}</Link>
        ) : (
          <Link href={`/${l}/approvals`}>{t("approvals", l)}</Link>
        )}
        <Link href={`/ar${suffix}`} className={l === "ar" ? "on" : ""} hrefLang="ar" lang="ar">العربية</Link>
        <Link href={`/en${suffix}`} className={l === "en" ? "on" : ""} hrefLang="en" lang="en">English</Link>
      </nav>
    </header>
  );
}
