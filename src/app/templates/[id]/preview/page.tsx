import { notFound } from "next/navigation";
import Link from "next/link";

import { auth } from "@/backend/auth/config";
import { getTemplateById } from "@/backend/services/template.service";
import { getLockViewForTemplate } from "@/backend/services/templateLock.service";
import { PreviewLockPanel } from "@/components/templates/PreviewLockPanel";
import { TopNav } from "@/components/ui/TopNav";
import { Card } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { displayMd, caption } from "@/lib/ui/typography";

export const dynamic = "force-dynamic";

export default async function TemplatePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user?.id || !session.user.isDepartmentHead) {
    notFound();
  }

  const template = await getTemplateById(id);
  if (!template) notFound();

  const lock = await getLockViewForTemplate({
    templateId: id,
    viewerUserId: session.user.id,
    viewerDepartmentId: session.user.departmentId ?? null,
    isLockOwner: false,
  });

  const lockedByMyDept =
    lock !== null &&
    Boolean(session.user.departmentId) &&
    lock.departmentId === session.user.departmentId;
  const lockedByOtherDept = lock !== null && !lockedByMyDept;

  return (
    <div className="min-h-dvh" style={{ background: "var(--canvas)", color: "var(--ink)" }}>
      <TopNav cta={undefined} />

      <header className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 px-5 sm:px-8 pt-8">
        <Link
          href="/templates"
          className="inline-flex items-center gap-2"
          style={{ ...caption, color: "var(--ink-muted)" }}
        >
          <ArrowLeftIcon /> Back to gallery
        </Link>
        <ButtonLink href={`/templates/${template.id}/use`} variant="primary" size="md">
          Use design
        </ButtonLink>
      </header>

      <main className="mx-auto grid w-full max-w-[1200px] gap-8 px-5 sm:px-8 pb-20 pt-6 lg:grid-cols-12">
        <section className="lg:col-span-7">
          <Card variant="surface-1" padding={0} radius={20}>
            <div
              className="relative"
              style={{ background: "var(--surface-2)", borderTopLeftRadius: 20, borderTopRightRadius: 20 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={template.cover.url}
                alt={`${template.name} cover`}
                className="block h-auto w-full object-contain p-6"
              />
            </div>
            <div className="px-5 py-4" style={{ borderTop: "1px solid var(--hairline)" }}>
              <Badge tone="muted" size="sm">{template.category ?? "Template"}</Badge>
              <h1 className="mt-2" style={{ ...displayMd, fontSize: 24 }}>
                {template.name}
              </h1>
            </div>
          </Card>
        </section>

        <aside className="lg:col-span-5">
          <PreviewLockPanel
            templateId={template.id}
            templateName={template.name}
            initialLock={lock}
            lockedByOtherDept={lockedByOtherDept}
          />
        </aside>
      </main>
    </div>
  );
}

function ArrowLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}
