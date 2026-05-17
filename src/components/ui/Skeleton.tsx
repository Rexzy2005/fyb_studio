import type { CSSProperties } from "react";

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
  style?: CSSProperties;
}

export function Skeleton({
  width = "100%",
  height = 16,
  radius = 8,
  className = "",
  style,
}: SkeletonProps) {
  return (
    <div
      className={`fyb-skeleton ${className}`}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden
    />
  );
}

export function SkeletonText({
  lines = 3,
  width = "100%",
  className = "",
}: {
  lines?: number;
  width?: number | string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2 ${className}`} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={12}
          width={i === lines - 1 ? "65%" : width}
          radius={6}
        />
      ))}
    </div>
  );
}
