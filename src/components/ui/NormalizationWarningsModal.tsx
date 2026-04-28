"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type NormalizationWarning = {
	code: string;
	message: string;
	nodeId?: string;
};

export function NormalizationWarningsModal({
	open,
	onClose,
	warnings,
	title = "Normalization warnings",
	resolveNodeLabel,
}: {
	open: boolean;
	onClose: () => void;
	warnings: NormalizationWarning[];
	title?: string;
	resolveNodeLabel?: (nodeId: string) => string | undefined;
}) {
	const [copied, setCopied] = useState(false);
	const onCloseRef = useRef(onClose);

	useEffect(() => {
		onCloseRef.current = onClose;
	}, [onClose]);

	useEffect(() => {
		if (!open) return;

		const prevOverflow = document.documentElement.style.overflow;
		document.documentElement.style.overflow = "hidden";

		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") onCloseRef.current();
		}

		window.addEventListener("keydown", onKeyDown);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
			document.documentElement.style.overflow = prevOverflow;
		};
	}, [open]);

	const summary = useMemo(() => {
		const rows = warnings.map((w) => {
			let id = "";
			if (w.nodeId) {
				const label = resolveNodeLabel?.(w.nodeId);
				id = label ? ` (node: ${label} [${w.nodeId}])` : ` (node: ${w.nodeId})`;
			}
			return `• [${w.code}] ${w.message}${id}`;
		});
		return rows.join("\n");
	}, [warnings, resolveNodeLabel]);

	async function copyWarnings() {
		try {
			await navigator.clipboard.writeText(summary || "(no warnings)");
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1200);
		} catch {
			// Ignore clipboard errors (permissions, unsupported).
		}
	}

	if (!open) return null;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center p-4"
			role="dialog"
			aria-modal="true"
			aria-label={title}
			onMouseDown={(e) => {
				if (e.currentTarget === e.target) onClose();
			}}
		>
			<div className="absolute inset-0 bg-black/40" />

			<div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
				<div className="flex items-start justify-between gap-4 border-b border-zinc-200 p-5 dark:border-zinc-800">
					<div className="min-w-0">
						<div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">{title}</div>
						<div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
							{warnings.length} warning{warnings.length === 1 ? "" : "s"} found.
						</div>
					</div>

					<div className="flex shrink-0 items-center gap-2">
						<button
							type="button"
							onClick={copyWarnings}
							className="inline-flex h-9 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 shadow-sm transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
						>
							{copied ? "Copied" : "Copy"}
						</button>
						<button
							type="button"
							onClick={onClose}
							className="inline-flex h-9 items-center justify-center rounded-2xl bg-zinc-900 px-3 text-xs font-medium text-white shadow-sm transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
						>
							Close
						</button>
					</div>
				</div>

				<div className="max-h-[70vh] overflow-y-auto p-5">
					{warnings.length === 0 ? (
						<div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-200">
							No warnings.
						</div>
					) : (
						<ul className="space-y-3">
							{warnings.map((w, idx) => (
								<li
									key={`${w.code}-${w.nodeId ?? ""}-${idx}`}
									className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100"
								>
									<div className="flex flex-wrap items-center gap-2">
										<span className="rounded-full border border-amber-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-amber-900 dark:border-amber-900/40 dark:bg-zinc-950/30 dark:text-amber-100">
											{w.code}
										</span>
										{w.nodeId ? (
											<span className="text-[11px] font-medium text-amber-900/80 dark:text-amber-100/80">
												node: {resolveNodeLabel?.(w.nodeId) ?? w.nodeId}
												{resolveNodeLabel?.(w.nodeId) ? (
													<span className="ml-1 opacity-60">[{w.nodeId}]</span>
												) : null}
											</span>
										) : null}
									</div>
									<div className="mt-2 leading-6">{w.message}</div>
								</li>
							))}
						</ul>
					)}
				</div>
			</div>
		</div>
	);
}

