"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { nanoid } from "nanoid";

import type { RevenueShareSnapshot } from "@/backend/services/revenueShare.service";
import {
  allocateRevenueShares,
  formatNgnFromKobo,
  formatSharePercent,
} from "@/lib/revenue/allocateShares";
import { createDefaultRevenueFramework } from "@/lib/revenue/defaultFramework";
import type { RevenueFramework } from "@/lib/revenue/types";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";

const COLOR_SWATCHES = [
  "#22c55e",
  "#8b5cf6",
  "#3b82f6",
  "#6366f1",
  "#ec4899",
  "#f59e0b",
  "#06b6d4",
  "#ef4444",
  "#14b8a6",
  "#a3e635",
] as const;

type ApiErrorResponse = { error?: { message?: string } };

function cloneFramework(framework: RevenueFramework): RevenueFramework {
  return {
    categories: framework.categories.map((category) => ({ ...category })),
    members: framework.members.map((member) => ({ ...member })),
    assignments: framework.assignments.map((assignment) => ({ ...assignment })),
  };
}

function weightSumBps(framework: RevenueFramework): number {
  return framework.categories.reduce((sum, category) => sum + category.weightBps, 0);
}

function readApiError(res: Response): Promise<string> {
  return res
    .json()
    .then((body: ApiErrorResponse) => body.error?.message ?? `Request failed (${res.status})`)
    .catch(() => `Request failed (${res.status})`);
}

function percentInputFromBps(bps: number): string {
  const value = bps / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function RevenueSharePanel({
  heading = "section",
}: {
  /** "section" is the dashboard-style eyebrow. "none" when the page already has a title. */
  heading?: "section" | "none";
}) {
  const toast = useToast();
  const [data, setData] = useState<RevenueShareSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RevenueFramework | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/revenue/shares", { cache: "no-store" });
    if (!res.ok) throw new Error(await readApiError(res));
    return (await res.json()) as RevenueShareSnapshot;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const snapshot = await load();
        if (!cancelled) {
          setData(snapshot);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Unknown error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const liveFramework = data?.framework ?? null;
  const liveAllocation = data?.allocation ?? null;

  const usedBps = liveFramework ? weightSumBps(liveFramework) : 0;
  const remainingBps = 10_000 - usedBps;

  function startEdit() {
    if (!data) return;
    setDraft(cloneFramework(data.framework));
    setConfirmReset(false);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft(null);
    setConfirmReset(false);
  }

  async function persist(framework: RevenueFramework) {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/revenue/shares", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(framework),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      const snapshot = (await res.json()) as RevenueShareSnapshot;
      setData(snapshot);
      setEditing(false);
      setDraft(null);
      setConfirmReset(false);
      toast.show({
        tone: "success",
        title: "Framework saved",
        body: "The live split now uses the updated people and weights.",
      });
    } catch (e) {
      toast.show({
        tone: "error",
        title: "Could not save",
        body: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function resetToPdf() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/revenue/shares/reset", { method: "POST" });
      if (!res.ok) throw new Error(await readApiError(res));
      const snapshot = (await res.json()) as RevenueShareSnapshot;
      setData(snapshot);
      setEditing(false);
      setDraft(null);
      setConfirmReset(false);
      toast.show({
        tone: "success",
        title: "Restored the signed split",
        body: "Rex, Spectre, Jay Zee, Jay Jay and Destiny are back to 50 / 25 / 15 / 10.",
      });
    } catch (e) {
      toast.show({
        tone: "error",
        title: "Could not reset",
        body: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] p-4 text-sm text-danger dark:border-[rgba(239,68,68,0.28)] dark:bg-red-950/40 dark:text-danger">
        {error}
      </div>
    );
  }

  return (
    <section className="space-y-4 sm:space-y-5">
      {heading === "section" ? (
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-faint dark:text-ink-faint">
              <span aria-hidden className="inline-block h-px w-5 bg-[var(--accent-blue)] opacity-60" />
              Revenue share
            </div>
            <h2 className="mt-1 text-base font-semibold tracking-tight text-ink sm:text-lg dark:text-ink">
              How the pot is split
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-muted sm:text-[13px] dark:text-ink-muted">
              Lifetime product revenue, the same number as Total revenue.
              Each category is split equally among the people assigned to it.
              Leftover kobo is split too — the parts always add back to the pool.
            </p>
          </div>
          {data ? <EditFrameworkButton onClick={startEdit} /> : null}
        </header>
      ) : data ? (
        <div className="flex justify-end">
          <EditFrameworkButton onClick={startEdit} />
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <ShareStat
          label="Pool to split"
          value={data ? formatNgnFromKobo(data.poolKobo) : loading ? "…" : "₦0.00"}
          sub={
            data
              ? `${data.successfulPayments.toLocaleString()} successful payments`
              : ""
          }
        />
        <ShareStat
          label="People"
          value={
            liveFramework
              ? String(liveFramework.members.length)
              : loading
                ? "…"
                : "0"
          }
          sub={liveFramework ? `${liveFramework.categories.length} categories` : ""}
        />
        <ShareStat
          label="Books"
          value={
            liveAllocation
              ? liveAllocation.proof.balanced
                ? "Balanced"
                : "Off"
              : loading
                ? "…"
                : "—"
          }
          sub={
            liveAllocation
              ? `${formatNgnFromKobo(liveAllocation.proof.memberSumKobo)} accounted for`
              : ""
          }
        />
      </div>

      <div className="rounded-2xl border border-hairline bg-surface-1 p-4 dark:border-hairline dark:bg-surface-1">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted">
          Per person
        </div>
        {loading || !liveAllocation ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="fyb-skeleton h-16 rounded-xl" />
            ))}
          </div>
        ) : liveAllocation.members.length === 0 ? (
          <p className="text-xs text-ink-faint">Add at least one person to split the pot.</p>
        ) : (
          <ul className="space-y-2.5">
            {liveAllocation.members.map((member) => {
              const width =
                data && data.poolKobo > 0
                  ? Math.max(2, (member.totalKobo / data.poolKobo) * 100)
                  : member.frameworkBps / 100;
              return (
                <li
                  key={member.id}
                  className="rounded-xl border border-hairline-soft px-3 py-2.5 dark:border-hairline"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          aria-hidden
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: member.color }}
                        />
                        <span className="text-sm font-semibold text-ink dark:text-ink">
                          {member.name}
                        </span>
                        {member.role ? (
                          <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted dark:bg-surface-2 dark:text-ink-muted">
                            {member.role}
                          </span>
                        ) : null}
                      </div>
                      {member.byCategory.length > 0 ? (
                        <div className="mt-1 truncate text-[11px] text-ink-faint dark:text-ink-faint">
                          {member.byCategory
                            .filter((row) => row.kobo > 0)
                            .map(
                              (row) =>
                                `${row.categoryName} ${formatNgnFromKobo(row.kobo)}`
                            )
                            .join(" · ")}
                        </div>
                      ) : (
                        <div className="mt-1 text-[11px] text-ink-faint">
                          Not assigned to a category
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold tabular-nums text-ink dark:text-ink">
                        {formatNgnFromKobo(member.totalKobo)}
                      </div>
                      <div className="text-[11px] tabular-nums text-ink-muted">
                        {formatSharePercent(member.allocatedBps)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-canvas dark:bg-surface-2">
                    <div
                      className="h-full rounded-full transition-[width] duration-300"
                      style={{ width: `${Math.min(100, width)}%`, background: member.color }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-hairline bg-surface-1 p-4 dark:border-hairline dark:bg-surface-1">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted">
            Categories
          </div>
          {liveFramework ? (
            <span
              className={
                "text-[11px] font-medium tabular-nums " +
                (remainingBps === 0
                  ? "text-[var(--accent-blue)]"
                  : "text-amber-600 dark:text-amber-400")
              }
            >
              {formatSharePercent(usedBps)} allocated
              {remainingBps === 0
                ? ""
                : ` · ${formatSharePercent(Math.abs(remainingBps))} ${remainingBps > 0 ? "left" : "over"}`}
            </span>
          ) : null}
        </div>
        {loading || !liveAllocation || !liveFramework ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="fyb-skeleton h-12 rounded-xl" />
            ))}
          </div>
        ) : (
          <ul className="space-y-2">
            {liveAllocation.categories.map((category) => {
              const names = category.contributorIds
                .map(
                  (id) => liveFramework.members.find((member) => member.id === id)?.name
                )
                .filter(Boolean);
              return (
                <li
                  key={category.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline-soft px-3 py-2 dark:border-hairline"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: category.color }}
                      />
                      <span className="text-sm font-medium text-ink dark:text-ink">
                        {category.name}
                      </span>
                      <span className="text-[11px] tabular-nums text-ink-muted">
                        {formatSharePercent(category.weightBps)}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-ink-faint">
                      {names.length > 0 ? names.join(", ") : "Nobody assigned"}
                    </div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums text-ink dark:text-ink">
                    {formatNgnFromKobo(category.potKobo)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {liveAllocation && liveAllocation.members.length > 0 ? (
        <div className="flex items-start gap-2 rounded-2xl border border-hairline bg-surface-1 px-4 py-3 text-xs text-ink-muted dark:border-hairline dark:bg-surface-1 dark:text-ink-muted">
          {liveAllocation.proof.balanced ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          ) : (
            <X className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          )}
          <p>
            {liveAllocation.members.map((member) => member.name).join(" + ")} ={" "}
            <span className="font-semibold text-ink dark:text-ink">
              {formatNgnFromKobo(liveAllocation.proof.memberSumKobo)}
            </span>
            {data
              ? liveAllocation.proof.balanced
                ? " — matches the product pool."
                : ` — does not match the pool (${formatNgnFromKobo(data.poolKobo)}).`
              : "."}
          </p>
        </div>
      ) : null}

      <Modal
        open={editing && draft !== null}
        onClose={() => {
          if (!saving) cancelEdit();
        }}
        size="lg"
        preventDismiss={saving}
        title="Edit framework"
        description="Change people, category weights, or who sits in each bucket. Save when the weights add up to 100%."
        footer={
          draft ? (
            <EditorFooter
              saving={saving}
              confirmReset={confirmReset}
              setConfirmReset={setConfirmReset}
              onCancel={cancelEdit}
              onSave={() => persist(draft)}
              onReset={resetToPdf}
            />
          ) : null
        }
      >
        {draft ? (
          <FrameworkEditor
            draft={draft}
            setDraft={setDraft}
            poolKobo={data?.poolKobo ?? 0}
          />
        ) : null}
      </Modal>
    </section>
  );
}

function EditFrameworkButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-hairline bg-surface-1 px-3 text-xs font-medium text-ink-muted transition hover:bg-canvas hover:text-ink active:scale-95 dark:border-hairline dark:bg-surface-1 dark:text-ink-muted dark:hover:bg-surface-2 dark:hover:text-ink"
    >
      <Pencil className="h-3.5 w-3.5" />
      Edit framework
    </button>
  );
}

function ShareStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface-1 p-3 sm:p-4 dark:border-hairline dark:bg-surface-1">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint sm:text-[10.5px]">
        {label}
      </div>
      <div className="mt-1 truncate text-xl font-semibold tracking-tight text-ink sm:text-2xl dark:text-ink">
        {value}
      </div>
      {sub ? (
        <div className="mt-0.5 truncate text-[10.5px] text-ink-muted sm:text-[11.5px]">
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function EditorFooter({
  saving,
  confirmReset,
  setConfirmReset,
  onCancel,
  onSave,
  onReset,
}: {
  saving: boolean;
  confirmReset: boolean;
  setConfirmReset: (next: boolean) => void;
  onCancel: () => void;
  onSave: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
      {confirmReset ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          Restore the signed PDF split? This saves immediately.
          <button
            type="button"
            onClick={onReset}
            disabled={saving}
            className="inline-flex h-8 items-center rounded-lg bg-[rgba(239,68,68,0.1)] px-2.5 text-xs font-medium text-danger hover:bg-[rgba(239,68,68,0.16)] disabled:opacity-50"
          >
            Yes, restore
          </button>
          <button
            type="button"
            onClick={() => setConfirmReset(false)}
            className="inline-flex h-8 items-center rounded-lg px-2.5 text-xs font-medium text-ink-muted hover:bg-canvas"
          >
            Keep editing
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmReset(true)}
          disabled={saving}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-ink-faint hover:bg-canvas hover:text-ink disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset to signed PDF
        </button>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="inline-flex h-9 items-center rounded-xl border border-hairline bg-surface-1 px-3 text-xs font-medium text-ink-muted hover:bg-canvas disabled:opacity-50 dark:border-hairline dark:bg-surface-1"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex h-9 items-center rounded-xl bg-[var(--accent-blue)] px-3 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save framework"}
        </button>
      </div>
    </div>
  );
}

function FrameworkEditor({
  draft,
  setDraft,
  poolKobo,
}: {
  draft: RevenueFramework;
  setDraft: (next: RevenueFramework) => void;
  poolKobo: number;
}) {
  function updateMember(
    id: string,
    patch: Partial<RevenueFramework["members"][number]>
  ) {
    setDraft({
      ...draft,
      members: draft.members.map((member) =>
        member.id === id ? { ...member, ...patch } : member
      ),
    });
  }

  function updateCategory(
    id: string,
    patch: Partial<RevenueFramework["categories"][number]>
  ) {
    setDraft({
      ...draft,
      categories: draft.categories.map((category) =>
        category.id === id ? { ...category, ...patch } : category
      ),
    });
  }

  function removeMember(id: string) {
    setDraft({
      ...draft,
      members: draft.members.filter((member) => member.id !== id),
      assignments: draft.assignments.filter((assignment) => assignment.memberId !== id),
    });
  }

  function removeCategory(id: string) {
    setDraft({
      ...draft,
      categories: draft.categories.filter((category) => category.id !== id),
      assignments: draft.assignments.filter((assignment) => assignment.categoryId !== id),
    });
  }

  function addMember() {
    const id = `mem_${nanoid(8)}`;
    const color =
      COLOR_SWATCHES[draft.members.length % COLOR_SWATCHES.length] ?? "#22c55e";
    setDraft({
      ...draft,
      members: [
        ...draft.members,
        { id, name: "", role: null, color },
      ],
    });
  }

  function addCategory() {
    const id = `cat_${nanoid(8)}`;
    const color =
      COLOR_SWATCHES[draft.categories.length % COLOR_SWATCHES.length] ?? "#3b82f6";
    setDraft({
      ...draft,
      categories: [
        ...draft.categories,
        { id, name: "", weightBps: 0, color },
      ],
    });
  }

  function toggleAssignment(memberId: string, categoryId: string) {
    const exists = draft.assignments.some(
      (assignment) =>
        assignment.memberId === memberId && assignment.categoryId === categoryId
    );
    setDraft({
      ...draft,
      assignments: exists
        ? draft.assignments.filter(
            (assignment) =>
              !(
                assignment.memberId === memberId &&
                assignment.categoryId === categoryId
              )
          )
        : [...draft.assignments, { memberId, categoryId }],
    });
  }

  const preview = allocateRevenueShares(poolKobo, draft);
  const usedBps = weightSumBps(draft);
  const remainingBps = 10_000 - usedBps;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={
            "text-[11px] font-medium tabular-nums " +
            (remainingBps === 0 ? "text-emerald-400" : "text-amber-400")
          }
        >
          {formatSharePercent(usedBps)} allocated
          {remainingBps === 0
            ? ""
            : ` · ${formatSharePercent(Math.abs(remainingBps))} ${remainingBps > 0 ? "left" : "over"}`}
        </span>
        <button
          type="button"
          onClick={() => setDraft(createDefaultRevenueFramework())}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium text-ink-muted hover:bg-white/5 hover:text-ink"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Load PDF defaults
        </button>
      </div>

      {preview.members.length > 0 ? (
        <div className="grid gap-1.5 rounded-xl border border-white/10 bg-black/20 p-2.5 sm:grid-cols-2">
          {preview.members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between gap-2 rounded-lg px-2 py-1"
            >
              <span className="flex min-w-0 items-center gap-2 text-[12px] text-ink">
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: member.color }}
                />
                <span className="truncate">{member.name || "Untitled"}</span>
              </span>
              <span className="shrink-0 text-[12px] tabular-nums text-ink-muted">
                {formatNgnFromKobo(member.totalKobo)} · {formatSharePercent(member.allocatedBps)}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
            People
          </div>
          <button
            type="button"
            onClick={addMember}
            disabled={draft.members.length >= 20}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-ink-muted hover:bg-canvas hover:text-ink disabled:opacity-40 dark:hover:bg-surface-2"
          >
            <Plus className="h-3.5 w-3.5" />
            Add person
          </button>
        </div>
        <div className="space-y-2">
          {draft.members.map((member) => (
            <div
              key={member.id}
              className="grid gap-2 rounded-xl border border-hairline-soft p-2.5 sm:grid-cols-[1fr_8rem_auto_auto] sm:items-center dark:border-hairline"
            >
              <input
                value={member.name}
                onChange={(e) => updateMember(member.id, { name: e.target.value })}
                placeholder="Name"
                className="h-9 rounded-lg border border-hairline bg-canvas px-2.5 text-sm text-ink outline-none focus:border-[var(--accent-blue)] dark:border-hairline dark:bg-surface-2 dark:text-ink"
              />
              <input
                value={member.role ?? ""}
                onChange={(e) => updateMember(member.id, { role: e.target.value })}
                placeholder="Role (optional)"
                className="h-9 rounded-lg border border-hairline bg-canvas px-2.5 text-sm text-ink outline-none focus:border-[var(--accent-blue)] dark:border-hairline dark:bg-surface-2 dark:text-ink"
              />
              <ColorPicker
                value={member.color}
                onChange={(color) => updateMember(member.id, { color })}
              />
              <button
                type="button"
                onClick={() => removeMember(member.id)}
                disabled={draft.members.length <= 1}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-faint hover:bg-[rgba(239,68,68,0.08)] hover:text-danger disabled:opacity-30"
                aria-label={`Remove ${member.name || "person"}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
            Categories &amp; assignments
          </div>
          <button
            type="button"
            onClick={addCategory}
            disabled={draft.categories.length >= 12}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-ink-muted hover:bg-canvas hover:text-ink disabled:opacity-40 dark:hover:bg-surface-2"
          >
            <Plus className="h-3.5 w-3.5" />
            Add category
          </button>
        </div>
        <div className="space-y-3">
          {draft.categories.map((category) => (
            <div
              key={category.id}
              className="space-y-2 rounded-xl border border-hairline-soft p-3 dark:border-hairline"
            >
              <div className="grid gap-2 sm:grid-cols-[1fr_7rem_auto_auto] sm:items-center">
                <input
                  value={category.name}
                  onChange={(e) => updateCategory(category.id, { name: e.target.value })}
                  placeholder="Category name"
                  className="h-9 rounded-lg border border-hairline bg-canvas px-2.5 text-sm text-ink outline-none focus:border-[var(--accent-blue)] dark:border-hairline dark:bg-surface-2 dark:text-ink"
                />
                <label className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={percentInputFromBps(category.weightBps)}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      const bps = Number.isFinite(next)
                        ? Math.max(0, Math.min(10_000, Math.round(next * 100)))
                        : 0;
                      updateCategory(category.id, { weightBps: bps });
                    }}
                    className="h-9 w-full rounded-lg border border-hairline bg-canvas px-2.5 pr-7 text-sm tabular-nums text-ink outline-none focus:border-[var(--accent-blue)] dark:border-hairline dark:bg-surface-2 dark:text-ink"
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-faint">
                    %
                  </span>
                </label>
                <ColorPicker
                  value={category.color}
                  onChange={(color) => updateCategory(category.id, { color })}
                />
                <button
                  type="button"
                  onClick={() => removeCategory(category.id)}
                  disabled={draft.categories.length <= 1}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-faint hover:bg-[rgba(239,68,68,0.08)] hover:text-danger disabled:opacity-30"
                  aria-label={`Remove ${category.name || "category"}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {draft.members.map((member) => {
                  const checked = draft.assignments.some(
                    (assignment) =>
                      assignment.memberId === member.id &&
                      assignment.categoryId === category.id
                  );
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => toggleAssignment(member.id, category.id)}
                      className={
                        "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition " +
                        (checked
                          ? "border-transparent text-white"
                          : "border-hairline bg-canvas text-ink-muted hover:text-ink dark:border-hairline dark:bg-surface-2")
                      }
                      style={checked ? { background: member.color } : undefined}
                    >
                      {member.name || "Untitled"}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {COLOR_SWATCHES.slice(0, 5).map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className={
            "h-6 w-6 rounded-full border-2 transition " +
            (value.toLowerCase() === color
              ? "border-ink dark:border-white"
              : "border-transparent")
          }
          style={{ background: color }}
          aria-label={`Use ${color}`}
        />
      ))}
    </div>
  );
}
