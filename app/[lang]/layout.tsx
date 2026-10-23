import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { dir, t } from "@/i18n";
import type { Lang } from "@/agent/types";
import "../globals.css";

export function generateStaticParams() {
  return [{ lang: "ar" }, { lang: "en" }];
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l: Lang = lang === "ar" ? "ar" : "en";
  return { title: `${t("title", l)} | Qloo`, description: t("subtitle", l) };
}

export default async function LangLayout({ children, params }: { children: ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (lang !== "ar" && lang !== "en") notFound();
  return (
    <html lang={lang} dir={dir(lang)}>
      <body>{children}</body>
    </html>
  );
}
