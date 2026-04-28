"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { NormalizedDesignV1, NormalizedNode } from "@/lib/figma";
import { createLocalTemplateRepository } from "@/lib/storage/templateRepo";

function normalizeFontFamily(raw: string) {
  const first = raw.split(",")[0]?.trim();
  if (!first) return "";
  return first.replace(/^['\"]/, "").replace(/['\"]$/, "").trim();
}

function getNodeLabel(node: NormalizedNode) {
  return (node.name ?? node.id).trim() || node.id;
}

export function IconsFontsPanel({ design }: { design: NormalizedDesignV1 }) {
  const repo = useMemo(() => createLocalTemplateRepository(), []);

  const designFontFamilies = useMemo(() => {
    const fonts = (design.assets?.fonts ?? []).map(normalizeFontFamily).filter(Boolean);
    return [...new Set(fonts)].sort((a, b) => a.localeCompare(b));
  }, [design.assets]);

  const [fontStatusByFamily, setFontStatusByFamily] = useState<Record<string, "stored" | "missing">>({});
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadTargetFamily, setUploadTargetFamily] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (designFontFamilies.length === 0) {
        setFontStatusByFamily({});
        return;
      }
      const entries = await Promise.all(
        designFontFamilies.map(async (family) => {
          const rec = await repo.getFont(family);
          return [family, rec ? ("stored" as const) : ("missing" as const)] as const;
        }),
      );
      if (cancelled) return;
      setFontStatusByFamily(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [designFontFamilies, repo]);

  async function onChooseFontFile(e: React.ChangeEvent<HTMLInputElement>) {
    const family = uploadTargetFamily;
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!family || !file) return;

    await repo.upsertFont({ family, blob: file });
    const rec = await repo.getFont(family);
    setFontStatusByFamily((prev) => ({ ...prev, [family]: rec ? "stored" : "missing" }));
    window.dispatchEvent(new Event("fyb:fonts:changed"));
    setUploadTargetFamily(null);
  }

  async function onDeleteFont(family: string) {
    await repo.deleteFont(family);
    setFontStatusByFamily((prev) => ({ ...prev, [family]: "missing" }));
    window.dispatchEvent(new Event("fyb:fonts:changed"));
  }

  const warnings = design.warnings ?? [];
  const iconWarnings = warnings.filter((w) => w.code === "vector_geometry_missing");

  const compoundVectorNodes = useMemo(() => {
    return Object.values(design.nodesById)
      .filter((n) => n.visible)
      .filter((n): n is Extract<NormalizedNode, { kind: "shape" }> => n.kind === "shape")
      .filter((n) => (n.vectorPaths?.length ?? 0) > 1)
      .sort((a, b) => getNodeLabel(a).localeCompare(getNodeLabel(b)));
  }, [design.nodesById]);

  return (
    <div className="flex h-full flex-col overflow-hidden border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
        <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">Icons &amp; Fonts</div>
        <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
          Fix missing icons by ensuring vector geometry and fonts are available.
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {/* Fonts */}
        {designFontFamilies.length ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950/30">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-zinc-950 dark:text-zinc-100">Fonts</div>
                <div className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">
                  Upload a .woff2/.woff/.ttf/.otf for any missing family. Exports now wait for these fonts.
                </div>
              </div>
              <input ref={uploadInputRef} type="file" accept=".woff2,.woff,.ttf,.otf" onChange={onChooseFontFile} className="hidden" />
            </div>

            <div className="mt-2 space-y-2">
              {designFontFamilies.slice(0, 10).map((family) => (
                <div
                  key={family}
                  className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-zinc-900 dark:text-zinc-100" style={{ fontFamily: family }}>
                      {family}
                    </div>
                    <div className="mt-0.5 text-[11px] text-zinc-600 dark:text-zinc-300">
                      {fontStatusByFamily[family] === "stored" ? "custom font stored" : "no custom font stored"}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setUploadTargetFamily(family);
                        uploadInputRef.current?.click();
                      }}
                      className="rounded-lg border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800/60"
                    >
                      Upload
                    </button>
                    {fontStatusByFamily[family] === "stored" ? (
                      <button
                        type="button"
                        onClick={() => onDeleteFont(family)}
                        className="rounded-lg border border-red-200 px-2.5 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/30"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}

              {designFontFamilies.length > 10 ? (
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400">+{designFontFamilies.length - 10} more fonts detected</div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-200 bg-white p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-300">
            No fonts detected in this design.
          </div>
        )}

        {/* Diagnostics */}
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950/30">
          <div className="text-xs font-semibold text-zinc-950 dark:text-zinc-100">Icon diagnostics</div>
          <div className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">
            Common causes: missing vector geometry in the JSON export, or missing icon-font families.
          </div>

          <div className="mt-3 space-y-3">
            <div className="rounded-xl border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900">
              <div className="font-medium text-zinc-900 dark:text-zinc-100">Vector geometry warnings</div>
              <div className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">
                {iconWarnings.length ? `${iconWarnings.length} layer(s) reported missing vector geometry.` : "No vector geometry warnings."}
              </div>
              {iconWarnings.slice(0, 5).map((w, idx) => (
                <div key={`${w.nodeId ?? "none"}-${idx}`} className="mt-2 text-[11px] text-zinc-600 dark:text-zinc-300">
                  • {w.message}
                </div>
              ))}
              {iconWarnings.length > 5 ? (
                <div className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">+{iconWarnings.length - 5} more</div>
              ) : null}
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900">
              <div className="font-medium text-zinc-900 dark:text-zinc-100">Compound vectors</div>
              <div className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">
                These shapes have multiple sub-paths. They should now render correctly.
              </div>
              {compoundVectorNodes.length ? (
                <div className="mt-2 space-y-1">
                  {compoundVectorNodes.slice(0, 8).map((n) => (
                    <div key={n.id} className="flex items-center justify-between gap-2 text-[11px]">
                      <div className="min-w-0 truncate text-zinc-700 dark:text-zinc-200">{getNodeLabel(n)}</div>
                      <div className="shrink-0 text-zinc-500 dark:text-zinc-400">{n.vectorPaths?.length ?? 0} paths</div>
                    </div>
                  ))}
                  {compoundVectorNodes.length > 8 ? (
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">+{compoundVectorNodes.length - 8} more</div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-2 text-[11px] text-zinc-600 dark:text-zinc-300">No compound vector layers detected.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
