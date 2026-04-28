# Copilot instructions (FYB Studio)

## Big picture

- This is a **Next.js App Router** app (Next 16) with **client-only** template editing/rendering.
- There is **no backend**: templates persist in **localStorage + IndexedDB** only.
- Primary flow: **Import Figma JSON → normalize → configure editable fields → publish (generates PNG preview) → users fill form + export PNG**.

## Dev workflows

- Run locally: `npm run dev` (App Router at `http://localhost:3000`).
- Lint: `npm run lint`.
- Production build: `npm run build` then `npm run start`.

## Architecture map (start here)

- Storage boundary: `src/lib/storage/templateRepo.ts` (`createLocalTemplateRepository`) wraps all persistence.
  - Metadata index in localStorage key `fyb:studio:templates:index` (`src/lib/storage/keys.ts`).
  - Full records + preview blobs in IndexedDB (`src/lib/storage/idb.ts`, stores: `templates`, `previews`).
- Figma normalization: `src/lib/figma/normalize.ts` → `NormalizedDesignV1` (`src/lib/figma/normalized.ts`).
  - Captures gradients/images as data + warnings (image bytes not present in export JSON).
- Rendering model (hybrid): shapes in Canvas + text in SVG.
  - Interactive workspace: `src/components/editor/DesignWorkspace.tsx`.
  - PNG export: `src/lib/render/exportPng.ts` (Canvas draw + Canvg for SVG text).
  - Hit testing: `src/lib/render/hitTest.ts`.
- Editor state: `src/lib/stores/templateEditorStore.ts` (Zustand: zoom/pan/selection).

## Route/feature entrypoints

- Admin import: `src/app/admin/templates/new/page.tsx` (paste/upload JSON → `normalizeFigmaExport` → `repo.upsertDraft`).
- Admin editor: `src/app/admin/templates/[id]/page.tsx` (DesignWorkspace + FieldConfigPanel; debounced `upsertDraft` for config).
- Publish: admin editor calls `exportTemplatePng(..., scale: 2)` then `repo.attachPreview`.
- Public browse/use:
  - List: `src/app/templates/page.tsx` (filters `status === "published"`).
  - Preview: `src/app/templates/[id]/page.tsx` (loads preview blob).
  - Use + export: `src/app/templates/[id]/use/page.tsx` (form from `fieldConfig`, export `scale: 3`).
- Preview blob URLs: `src/components/admin/usePreviewUrl.ts`.

## Project conventions & gotchas

- **Browser-only modules**: storage (`src/lib/storage/*`) throws if `window` is undefined. When using repository/storage, ensure the file is a **client component** (`"use client"`) and create the repo inside hooks (commonly `useMemo(() => createLocalTemplateRepository(), [])`).
- Path alias: import from `@/*` (see `tsconfig.json` `paths`).
- Params pattern: dynamic routes often type params as a Promise and unwrap with React `use(params)`.
- Tailwind CSS is used for UI styling; keep components functional + hooks-based.
- Local UI prefs are persisted via localStorage keys like `fyb:admin:sidebar` and `fyb:use:sidebar`.
- Key deps you’ll see in core paths: `idb` (IndexedDB), `canvg` (SVG→Canvas for PNG), `zustand` (viewport/selection), `zod` (Figma export validation), `nanoid` (IDs).

## When changing behavior

- Prefer extending `TemplateRepository` + `src/lib/storage/types.ts` rather than reaching into localStorage/IDB directly.
- If you add new persisted data, update both IndexedDB schema (`idb.ts`) and the metadata index logic (`templateRepo.ts`).
- Keep rendering changes consistent between **interactive** workspace (`DesignWorkspace.tsx`) and **export** (`exportPng.ts`).
