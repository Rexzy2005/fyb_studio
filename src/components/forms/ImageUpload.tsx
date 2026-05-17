"use client";

import { useId, useMemo, useRef, useState } from "react";

type Props = {
  label: string;
  description?: string;
  valueUrl?: string;
  valueName?: string;
  disabled?: boolean;
  objectFit?: "cover" | "contain";
  accept?: string;
  onPick: (file: File) => void;
  onClear?: () => void;
};

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"] as const;
  let idx = 0;
  let n = bytes;
  while (n >= 1024 && idx < units.length - 1) {
    n /= 1024;
    idx += 1;
  }
  const digits = idx === 0 ? 0 : idx === 1 ? 0 : 1;
  return `${n.toFixed(digits)} ${units[idx]}`;
}

export function ImageUpload({
  label,
  description,
  valueUrl,
  valueName,
  disabled,
  objectFit = "cover",
  accept = "image/*",
  onPick,
  onClear,
}: Props) {
  const inputId = useId();
  const helpId = useMemo(() => `${inputId}-help`, [inputId]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function pickFile(file: File | null | undefined) {
    if (!file) return;
    onPick(file);
  }

  return (
    <div className="grid w-full min-w-0 gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <label htmlFor={inputId} className="min-w-0 text-xs font-medium text-ink dark:text-ink">
          {label}
        </label>
        {valueUrl && onClear ? (
          <button
            type="button"
            onClick={() => {
              onClear();
              if (inputRef.current) inputRef.current.value = "";
            }}
            disabled={disabled}
            className="shrink-0 text-xs font-medium text-ink-muted hover:text-ink disabled:opacity-50 dark:text-ink-muted dark:hover:text-ink"
          >
            Remove
          </button>
        ) : null}
      </div>

      {description ? (
        <div
          id={helpId}
          title={description}
          className="min-w-0 break-words text-[11px] leading-4 text-ink-muted dark:text-ink-muted"
        >
          {description}
        </div>
      ) : null}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        disabled={disabled}
        aria-describedby={description ? helpId : undefined}
        onChange={(e) => pickFile(e.target.files?.[0])}
        className="hidden"
      />

      <div
        role={disabled ? undefined : "button"}
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled ? true : undefined}
        onClick={() => {
          if (disabled) return;
          inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragOver(false);
          pickFile(e.dataTransfer.files?.[0]);
        }}
        className={
          "flex w-full min-w-0 items-center gap-3 rounded-2xl border border-dashed p-3 outline-none transition " +
          (disabled
            ? "cursor-not-allowed border-hairline bg-canvas opacity-70 dark:border-hairline dark:bg-surface-1"
            : dragOver
              ? "cursor-pointer border-ink bg-canvas dark:border-hairline-soft dark:bg-surface-2/60"
              : "cursor-pointer border-hairline bg-surface-1 hover:bg-canvas dark:border-hairline dark:bg-surface-1 dark:hover:bg-surface-2/40")
        }
      >
        <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl border border-hairline bg-canvas dark:border-hairline dark:bg-surface-1">
          {valueUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={valueUrl}
              alt=""
              className={
                "h-full w-full " +
                (objectFit === "contain" ? "object-contain" : "object-cover")
              }
            />
          ) : (
            <div className="text-xs font-semibold text-ink-muted dark:text-ink-muted">IMG</div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="min-w-0 break-words text-xs font-medium leading-4 text-ink dark:text-ink">
            {valueName ? valueName : valueUrl ? "Selected image" : "Upload an image"}
          </div>
          <div className="mt-0.5 text-[11px] text-ink-muted dark:text-ink-muted">
            {disabled ? "This image is locked by the template." : dragOver ? "Drop to upload" : "Click or drag & drop"}
          </div>
        </div>

        {!disabled ? (
          <span className="shrink-0 rounded-xl border border-hairline bg-surface-1 px-2 py-1 text-[11px] font-medium text-ink-muted dark:border-hairline dark:bg-surface-1 dark:text-ink">
            Choose
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function inferFileMeta(file: File | undefined) {
  if (!file) return undefined;
  const size = formatBytes(file.size);
  return `${file.name}${size ? ` • ${size}` : ""}`;
}
