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

			<div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-hairline bg-surface-1 shadow-xl dark:border-hairline dark:bg-surface-1">
				<div className="flex items-start justify-between gap-4 border-b border-hairline p-5 dark:border-hairline">
					<div className="min-w-0">
						<div className="text-sm font-semibold text-ink dark:text-ink">{title}</div>
						<div className="mt-1 text-sm text-ink-muted dark:text-ink-muted">
							{warnings.length} warning{warnings.length === 1 ? "" : "s"} found.
						</div>
					</div>

					<div className="flex shrink-0 items-center gap-2">
						<button
							type="button"
							onClick={copyWarnings}
							className="inline-flex h-9 items-center justify-center rounded-2xl border border-hairline bg-surface-1 px-3 text-xs font-medium text-ink shadow-sm transition hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue-ring)] dark:border-hairline dark:bg-surface-1 dark:text-ink dark:hover:bg-surface-2"
						>
							{copied ? "Copied" : "Copy"}
						</button>
						<button
							type="button"
							onClick={onClose}
							className="inline-flex h-9 items-center justify-center rounded-2xl bg-surface-1 px-3 text-xs font-medium text-white shadow-sm transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue-ring)] dark:bg-surface-2 dark:text-ink dark:hover:bg-surface-1"
						>
							Close
						</button>
					</div>
				</div>

				<div className="max-h-[70vh] overflow-y-auto p-5">
					{warnings.length === 0 ? (
						<div className="rounded-2xl border border-hairline bg-canvas p-4 text-sm text-ink-muted dark:border-hairline dark:bg-surface-1 dark:text-ink">
							No warnings.
						</div>
					) : (
						<ul className="space-y-3">
							{warnings.map((w, idx) => (
								<li
									key={`${w.code}-${w.nodeId ?? ""}-${idx}`}
									className="rounded-2xl border border-[rgba(245,158,11,0.28)] bg-[rgba(245,158,11,0.08)] p-4 text-sm text-warning dark:border-[rgba(245,158,11,0.28)] dark:bg-[rgba(245,158,11,0.12)] dark:text-warning"
								>
									<div className="flex flex-wrap items-center gap-2">
										<span className="rounded-full border border-[rgba(245,158,11,0.28)] bg-surface-1 px-2.5 py-0.5 text-[11px] font-semibold text-warning dark:border-[rgba(245,158,11,0.28)] dark:bg-surface-1 dark:text-warning">
											{w.code}
										</span>
										{w.nodeId ? (
											<span className="text-[11px] font-medium text-warning/80 dark:text-warning/80">
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

