export type IsoDateTime = string;

export type TemplateStatus = "draft" | "published";

export type TemplateMeta = {
  id: string;
  name: string;
  /**
   * Optional template category/type for filtering and labeling (e.g. "FYB", "Sign-out", or custom).
   * Older templates may not have this set.
   */
  category?: string;
  status: TemplateStatus;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  previewId?: string;
  bytesDesign?: number;
  bytesPreview?: number;
};

/**
 * A logical grouping of fields shown to the end user as a section in the
 * template form (e.g. "Personal Details", "Photos", "Socials"). Sections
 * give admins control over how the form is broken up so users aren't
 * overwhelmed by a long flat list.
 *
 * `icon` is a Lucide icon name resolved at render time. When undefined the
 * UI falls back to a generic folder icon.
 *
 * Old configs without `sections` render as a single virtual "Details"
 * section — no migration required.
 */
export type FieldSection = {
  id: string;
  label: string;
  icon?: string;
  order: number;
};

export type FieldConfig = {
  version: 1;
  /** Optional grouping of fields. Backward-compatible — undefined → single default section. */
  sections?: FieldSection[];
  fields: Array<
    | {
        id: string;
        nodeId: string;
        kind: "text";
        label: string;
        editable: boolean;
        maxChars?: number;
        lockTypography?: boolean;
        lockColor?: boolean;
        lockAlignment?: boolean;
        /** ID of the FieldSection this field belongs to. Undefined → default section. */
        sectionId?: string;

        // Phase 3.5: behavior constraints (optional; defaults applied at render-time)
        textBehavior?: {
          autoScale: boolean;
          minFontSize?: number;
          maxFontSize?: number;
          overflow: "shrink" | "wrap" | "clip";
          case?: "as_design" | "upper" | "lower" | "title";
        };
      }
    | {
        id: string;
        nodeId: string;
        kind: "image";
        label: string;
        editable: boolean;
        role: "logo" | "user_photo";
        allowMultiple?: boolean;
        required?: boolean;
        aspectRatio?: number;
        cropRule?: "contain" | "cover";
        sectionId?: string;

        /**
         * Phase 3.5+: classifies the image slot.
         * - "user": end users upload at template-use time (current behavior, default when absent).
         * - "design_asset": admin uploads once at config time; locked at user side.
         * The admin-uploaded blob is stored in IndexedDB keyed by (templateId, nodeId).
         */
        imageSource?: "user" | "design_asset";

        // Phase 3.5: behavior constraints (optional; defaults applied at render-time)
        imageBehavior?: {
          fit: "cover" | "contain";
          lockAspectRatio: boolean;
          allowReplace: boolean;
        };
      }
    | {
        id: string;
        nodeId: string;
        kind: "color";
        label: string;
        editable: boolean;
        role: "background" | "accent";
        sectionId?: string;

        // Phase 3.5: behavior constraints (optional; defaults applied at render-time)
        colorBehavior?: {
          enabled: boolean;
          palette?: string[];
        };
      }
  >;
};

export type ImageAssetBinding = {
  nodeId: string;
  mode: "cover" | "contain";
  overflowHidden: true;
};

export type TemplateRecord = {
  id: string;
  name: string;
  /** Optional category/type (e.g. "FYB", "Sign-out", or custom). */
  category?: string;
  status: TemplateStatus;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  designJson: unknown;
  normalized?: unknown;
  fieldConfig: FieldConfig;
  previewId?: string;
};

export type PreviewRecord = {
  id: string;
  templateId: string;
  createdAt: IsoDateTime;
  mime: string;
  blob: Blob;
  width: number;
  height: number;
};

export type FontAssetRecord = {
  family: string;
  mime: string;
  blob: Blob;
  updatedAt: IsoDateTime;
};

export type DesignAssetRecord = {
  /** Composite key formatted as `${templateId}:${nodeId}`. */
  id: string;
  templateId: string;
  nodeId: string;
  mime: string;
  blob: Blob;
  updatedAt: IsoDateTime;
};

export type StorageStats = {
  templates: number;
  published: number;
  drafts: number;
  totalBytesDesign: number;
  totalBytesPreview: number;
};

export type UserDesignAssetUrlMap = Record<string, string>;

export type UserDesignInputs = {
  textByNodeId: Record<string, string>;
  colorByNodeId: Record<string, string>;
  imageBlobsByNodeId: Record<
    string,
    {
      blob: Blob;
      mime: string;
      objectFit: "cover" | "contain";
    }
  >;
};

export type UserDesignRecord = {
  id: string;
  templateId: string;
  name: string;
  categoryLabel: string;
  designJson: unknown;
  normalized: unknown;
  fieldConfig: FieldConfig;
  assetUrlsByNodeId: UserDesignAssetUrlMap;
  inputs: UserDesignInputs;
  createdAt: IsoDateTime;
  expiresAt: IsoDateTime;
  downloaded: boolean;
  lastDownloadedAt: IsoDateTime | null;
  thumbnail: { blob: Blob; mime: string; width: number; height: number } | null;
};
