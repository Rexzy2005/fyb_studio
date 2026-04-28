export function applyTextCase(value: string, textCase?: string) {
  if (!textCase) return value;
  if (textCase === "UPPER") return value.toUpperCase();
  if (textCase === "LOWER") return value.toLowerCase();
  if (textCase === "TITLE") {
    return value.replace(/\b\w+/g, (w) => w.slice(0, 1).toUpperCase() + w.slice(1).toLowerCase());
  }
  return value;
}

export function resolveEffectiveTextCase(
  nodeTextCase: string | undefined,
  fieldCase: "as_design" | "upper" | "lower" | "title" | undefined,
): string | undefined {
  if (!fieldCase || fieldCase === "as_design") return nodeTextCase;
  if (fieldCase === "upper") return "UPPER";
  if (fieldCase === "lower") return "LOWER";
  if (fieldCase === "title") return "TITLE";
  return nodeTextCase;
}
