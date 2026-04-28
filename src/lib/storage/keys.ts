export const STORAGE_NAMESPACE = "fyb:studio" as const;

export const LS_KEYS = {
  templateIndex: `${STORAGE_NAMESPACE}:templates:index`,
} as const;

export type LocalStorageKey = (typeof LS_KEYS)[keyof typeof LS_KEYS];
