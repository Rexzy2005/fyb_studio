import { z } from "zod";

const fieldConfigSchema = z.looseObject({
  version: z.literal(1),
  fields: z.array(z.unknown()),
});

const pluginImageMetaSchema = z.object({
  hash: z.string().min(1),
  mime: z.string().min(1).optional().nullable(),
  width: z.number().optional().nullable(),
  height: z.number().optional().nullable(),
});

export const publishTemplateMetaSchema = z.object({
  name: z.string().trim().min(1, "Template name is required").max(120),
  category: z.string().trim().max(80).optional().nullable(),
  designJson: z.unknown(),
  normalized: z.unknown().optional().nullable(),
  fieldConfig: fieldConfigSchema,
  pluginImages: z.array(pluginImageMetaSchema).optional().default([]),
});
export type PublishTemplateMeta = z.infer<typeof publishTemplateMetaSchema>;

export const updateTemplateMetaSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().max(80).optional().nullable(),
  designJson: z.unknown().optional(),
  normalized: z.unknown().optional().nullable(),
  fieldConfig: fieldConfigSchema.optional(),
  replaceCover: z.boolean().default(false),
  pluginImages: z.array(pluginImageMetaSchema).optional().default([]),
});
export type UpdateTemplateMeta = z.infer<typeof updateTemplateMetaSchema>;

export const unpublishConfirmSchema = z.object({
  confirmName: z.string().min(1),
});
