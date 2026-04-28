"use client";

import Link from "next/link";

import { use, useEffect, useMemo, useState } from "react";

import { createLocalTemplateRepository } from "@/lib/storage/templateRepo";
import type { TemplateRecord } from "@/lib/storage/types";
import { ProgressModal } from "@/components/ui/ProgressModal";
import { useSimulatedProgress } from "@/components/ui/useSimulatedProgress";

export default function TemplatePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const repo = useMemo(() => createLocalTemplateRepository(), []);
  const [record, setRecord] = useState<TemplateRecord | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const pageLoading = !record;
  const pageProgress = useSimulatedProgress(pageLoading, { start: 0.12, cap: 0.9 });

  useEffect(() => {
    let url: string | null = null;

    (async () => {
      const r = await repo.get(id);
      setRecord(r);

      if (r?.previewId) {
        const p = await repo.getPreview(r.previewId);
        if (p) {
          url = URL.createObjectURL(p.blob);
          setPreviewUrl(url);
        }
      }
    })();

    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, repo]);

  if (!record) {
    return (
      <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
        <ProgressModal
          open
          title="Loading template"
          subtitle={pageProgress < 0.55 ? "Fetching template" : "Preparing preview"}
          percent={Math.round(pageProgress * 100)}
          hint="This runs locally in your browser."
        />
      </div>
    );
  }

  if (record.status !== "published") {
    return (
      <div className="min-h-screen bg-zinc-50 p-6 dark:bg-zinc-950">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
          This template is not published.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">{record.name}</div>
          <Link href="/templates" className="text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-200 dark:hover:text-zinc-50">
            Back
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-4 px-4 py-6 lg:grid-cols-[1fr_280px]">
        <div className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="relative w-full">
            <div className="aspect-4/5 w-full" />
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Template preview" className="absolute inset-0 h-full w-full object-contain" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
                No preview available yet.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">Use this template</div>
          <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">Fill the form and preview live.</div>
          <Link
            href={`/templates/${record.id}/use`}
            className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            Use Template
          </Link>
        </div>
      </main>
    </div>
  );
}

