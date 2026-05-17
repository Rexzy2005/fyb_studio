"use client";

import {
  forwardRef,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { caption, bodyMd, micro } from "@/lib/ui/typography";

interface FieldShellProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
  optional?: boolean;
  className?: string;
}

export function FieldShell({
  label,
  hint,
  error,
  children,
  htmlFor,
  optional,
  className = "",
}: FieldShellProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label !== undefined && (
        <label htmlFor={htmlFor} style={{ ...caption, color: "var(--ink-muted)" }}>
          {label}
          {optional ? (
            <span style={{ ...micro, color: "var(--ink-faint)", marginLeft: 6 }}>(optional)</span>
          ) : null}
        </label>
      )}
      {children}
      {error ? (
        <span style={{ ...micro, color: "var(--semantic-danger)" }}>{error}</span>
      ) : hint ? (
        <span style={{ ...micro, color: "var(--ink-faint)" }}>{hint}</span>
      ) : null}
    </div>
  );
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  containerClassName?: string;
  inputStyle?: CSSProperties;
}

const inputBase: CSSProperties = {
  ...bodyMd,
  width: "100%",
  background: "rgba(255,255,255,0.025)",
  color: "var(--ink)",
  border: "1px solid rgba(255,215,0,0.18)",
  borderRadius: 10,
  padding: "10px 14px",
  outline: "none",
  transition: "border-color 140ms ease, box-shadow 140ms ease, background 140ms ease",
};

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  {
    label,
    hint,
    error,
    optional,
    leftSlot,
    rightSlot,
    containerClassName,
    inputStyle,
    id,
    className = "",
    ...rest
  },
  ref,
) {
  const reactId = id ?? rest.name;
  const errorTone = Boolean(error);
  const baseStyle: CSSProperties = {
    ...inputBase,
    borderColor: errorTone ? "var(--semantic-danger)" : "rgba(255,215,0,0.18)",
    paddingLeft: leftSlot ? 38 : 14,
    paddingRight: rightSlot ? 38 : 14,
    ...inputStyle,
  };
  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      htmlFor={reactId}
      optional={optional}
      className={containerClassName}
    >
      <div className="relative">
        {leftSlot ? (
          <span
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center"
            style={{ color: "var(--ink-faint)" }}
          >
            {leftSlot}
          </span>
        ) : null}
        <input
          ref={ref}
          id={reactId}
          className={className}
          style={baseStyle}
          onFocus={(e) => {
            if (!errorTone) {
              e.currentTarget.style.borderColor = "rgba(255,215,0,0.6)";
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(255,215,0,0.15)";
            }
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = errorTone
              ? "var(--semantic-danger)"
              : "rgba(255,215,0,0.18)";
            e.currentTarget.style.boxShadow = "none";
            rest.onBlur?.(e);
          }}
          {...rest}
        />
        {rightSlot ? (
          <span
            className="absolute inset-y-0 right-3 flex items-center"
            style={{ color: "var(--ink-faint)" }}
          >
            {rightSlot}
          </span>
        ) : null}
      </div>
    </FieldShell>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  containerClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, optional, containerClassName, id, className = "", style, ...rest },
  ref,
) {
  const reactId = id ?? rest.name;
  const errorTone = Boolean(error);
  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      htmlFor={reactId}
      optional={optional}
      className={containerClassName}
    >
      <textarea
        ref={ref}
        id={reactId}
        className={className}
        style={{
          ...inputBase,
          borderColor: errorTone ? "var(--semantic-danger)" : "rgba(255,215,0,0.18)",
          minHeight: 96,
          resize: "vertical",
          ...style,
        }}
        onFocus={(e) => {
          if (!errorTone) {
            e.currentTarget.style.borderColor = "rgba(255,215,0,0.6)";
            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(255,215,0,0.15)";
          }
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = errorTone
            ? "var(--semantic-danger)"
            : "rgba(255,215,0,0.18)";
          e.currentTarget.style.boxShadow = "none";
          rest.onBlur?.(e);
        }}
        {...rest}
      />
    </FieldShell>
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  containerClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, optional, containerClassName, id, className = "", style, children, ...rest },
  ref,
) {
  const reactId = id ?? rest.name;
  const errorTone = Boolean(error);
  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      htmlFor={reactId}
      optional={optional}
      className={containerClassName}
    >
      <select
        ref={ref}
        id={reactId}
        className={className}
        style={{
          ...inputBase,
          borderColor: errorTone ? "var(--semantic-danger)" : "rgba(255,215,0,0.18)",
          paddingRight: 36,
          appearance: "none",
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23999999' stroke-width='2'><polyline points='6 9 12 15 18 9'/></svg>\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 12px center",
          ...style,
        }}
        onFocus={(e) => {
          if (!errorTone) {
            e.currentTarget.style.borderColor = "rgba(255,215,0,0.6)";
            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(255,215,0,0.15)";
          }
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = errorTone
            ? "var(--semantic-danger)"
            : "rgba(255,215,0,0.18)";
          e.currentTarget.style.boxShadow = "none";
          rest.onBlur?.(e);
        }}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
});
