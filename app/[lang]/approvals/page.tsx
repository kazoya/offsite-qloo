import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { t } from "@/i18n";
import type { Lang } from "@/agent/types";
import { Approvals } from "@/ui/Approvals";
import { Header } from "@/ui/Header";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l: Lang = lang === "ar" ? "ar" : "en";
  return { title: `${t("approvals", l)} | ${t("title", l)}` };
}

export default async function ApprovalsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (lang !== "ar" && lang !== "en") notFound();
  const l = lang as Lang;
  return (
    <main>
      <Header l={l} page="approvals" title={t("approvals", l)} subtitle={t("approvalsSub", l)} />
      <Approvals lang={l} />
      <footer className="muted">Powered by Qloo Taste AI</footer>
    </main>
  );
}
