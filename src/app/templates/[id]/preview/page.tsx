import { notFound } from "next/navigation";
import Link from "next/link";

import { auth } from "@/backend/auth/config";
import { getTemplateById } from "@/backend/services/template.service";
import { getLockViewForTemplate } from "@/backend/services/templateLock.service";
import { PreviewLockPanel } from "@/components/templates/PreviewLockPanel";

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
    <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-6">
        <Link
          href="/templates"
          className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-100"
        >
          <ArrowLeftIcon />
          Back to gallery
        </Link>
        <Link
          href={`/templates/${template.id}/use`}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Use design
        </Link>
      </header>

      <main className="mx-auto grid w-full max-w-6xl gap-8 px-4 pb-20 lg:grid-cols-12">
        <section className="lg:col-span-7">
          <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="relative bg-zinc-50 dark:bg-zinc-800/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={template.cover.url}
                alt={`${template.name} cover`}
                className="block h-auto w-full object-contain p-6"
              />
            </div>
            <div className="border-t border-zinc-100 px-5 py-4 dark:border-zinc-800">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {template.category ?? "Template"}
              </div>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
                {template.name}
              </h1>
            </div>
          </div>
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
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}
