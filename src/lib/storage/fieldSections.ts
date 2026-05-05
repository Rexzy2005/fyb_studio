import { nanoid } from "nanoid";

import type { FieldConfig, FieldSection } from "@/lib/storage/types";

/**
 * The synthetic "default" section used when a config has no sections defined
 * or when a field has no sectionId. Its id never collides with a real section
 * because nanoid never produces this exact string.
 */
export const DEFAULT_SECTION_ID = "__default__";

/**
 * Suggested presets the admin can pick from when creating a new section.
 * Icon names map 1:1 to lucide-react icon component names.
 */
export const SECTION_PRESETS: Array<{ label: string; icon: string }> = [
  { label: "Personal Details", icon: "User" },
  { label: "Photos", icon: "Camera" },
  { label: "Fun Facts", icon: "Sparkles" },
  { label: "Socials", icon: "AtSign" },
  { label: "Contact", icon: "Mail" },
  { label: "About", icon: "FileText" },
];

/**
 * Build a fresh section with a unique id and a sensible default order
 * (after the highest existing order). Use this as the single entry point
 * for creating sections so the admin UI never has to think about ids.
 */
export function makeSection(
  existing: FieldSection[] | undefined,
  init: { label: string; icon?: string },
): FieldSection {
  const maxOrder = (existing ?? []).reduce((m, s) => Math.max(m, s.order), -1);
  return {
    id: nanoid(8),
    label: init.label.trim() || "Untitled section",
    icon: init.icon,
    order: maxOrder + 1,
  };
}

/**
 * Resolve the effective sections list for a config. Returns a list ordered
 * by `order` ascending, plus the default "Details" section appended when
 * any field has no sectionId — that way fields without an assignment still
 * render in a labeled group instead of disappearing.
 */
export function resolveSections(
  config: FieldConfig,
): Array<FieldSection> {
  const declared = (config.sections ?? []).slice().sort((a, b) => a.order - b.order);
  const declaredIds = new Set(declared.map((s) => s.id));
  const hasUnassignedField = config.fields.some(
    (f) => !f.sectionId || !declaredIds.has(f.sectionId),
  );
  if (hasUnassignedField) {
    return [
      ...declared,
      {
        id: DEFAULT_SECTION_ID,
        label: declared.length ? "Other" : "Details",
        icon: "Folder",
        order: declared.length ? Number.MAX_SAFE_INTEGER : 0,
      },
    ];
  }
  return declared;
}

/**
 * Group fields by their resolved section. Preserves original field order
 * within each group so the admin's intentional ordering is respected.
 */
export function groupFieldsBySection(
  config: FieldConfig,
): Array<{ section: FieldSection; fields: FieldConfig["fields"] }> {
  const sections = resolveSections(config);
  const sectionLookup = new Map(sections.map((s) => [s.id, s]));
  const groups = new Map<string, FieldConfig["fields"]>();
  for (const s of sections) groups.set(s.id, []);
  for (const field of config.fields) {
    const id = field.sectionId && sectionLookup.has(field.sectionId)
      ? field.sectionId
      : DEFAULT_SECTION_ID;
    const bucket = groups.get(id) ?? [];
    bucket.push(field);
    groups.set(id, bucket);
  }
  return sections
    .map((section) => ({ section, fields: groups.get(section.id) ?? [] }))
    .filter((g) => g.fields.length > 0);
}
