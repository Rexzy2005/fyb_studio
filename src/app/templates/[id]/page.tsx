"use client";

import Link from "next/link";

import { use, useEffect, useMemo, useState } from "react";

import { createLocalTemplateRepository } from "@/lib/storage/templateRepo";
import type { TemplateRecord } from "@/lib/storage/types";
import { ProgressModal } from "@/components/ui/ProgressModal";
import { useSimulatedProgress } from "@/components/ui/useSimulatedProgress";
import { TopNav } from "@/components/ui/TopNav";
import { Card } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { headline, bodySm, caption } from "@/lib/ui/typography";

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
      <div className="min-h-dvh" style={{ background: "var(--canvas)" }}>
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
      <div className="min-h-dvh p-6" style={{ background: "var(--canvas)", color: "var(--ink)" }}>
        <Card variant="surface-1" padding={20} radius={15}>
          <span style={{ ...bodySm, color: "var(--ink-muted)" }}>
            This template is not published.
          </span>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-dvh" style={{ background: "var(--canvas)", color: "var(--ink)" }}>
      <TopNav cta={undefined} />

      <header
        className="sticky top-14 z-10 backdrop-blur-md"
        style={{ background: "rgba(9,9,9,0.85)", borderBottom: "1px solid var(--hairline-soft)" }}
      >
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-5 py-3 sm:px-8">
          <div style={{ ...bodySm, color: "var(--ink)", fontWeight: 600 }}>{record.name}</div>
          <Link href="/templates" style={{ ...caption, color: "var(--ink-muted)" }}>
            Back
          </Link>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1200px] gap-6 px-5 py-8 sm:px-8 lg:grid-cols-[1fr_320px]">
        <Card variant="surface-1" padding={12} radius={20}>
          <div className="relative w-full">
            <div className="aspect-[4/5] w-full" />
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Template preview"
                className="absolute inset-0 h-full w-full object-contain"
              />
            ) : (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ ...bodySm, color: "var(--ink-faint)" }}
              >
                No preview available yet.
              </div>
            )}
          </div>
        </Card>

        <Card variant="surface-1" padding={20} radius={20}>
          <h2 style={{ ...headline, fontSize: 18 }}>Use this template</h2>
          <p className="mt-1" style={{ ...caption, color: "var(--ink-muted)" }}>
            Fill the form and preview live.
          </p>
          <div className="mt-4">
            <ButtonLink href={`/templates/${record.id}/use`} variant="primary" size="lg" fullWidth>
              Use Template
            </ButtonLink>
          </div>
        </Card>
      </main>
    </div>
  );
}
