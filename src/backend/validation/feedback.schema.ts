import { z } from "zod";

import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_SOURCES,
} from "@/backend/db/models/feedback.model";

export const submitFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  categories: z.array(z.enum(FEEDBACK_CATEGORIES)).max(7).default([]),
  // 4000 chars caps the message at "long thoughtful paragraph" without
  // letting an automated abuser fill the DB. UI also enforces this.
  message: z.string().trim().max(4000).default(""),
  source: z.enum(FEEDBACK_SOURCES).default("other"),
  context: z
    .object({
      page: z.string().trim().max(256).optional(),
      templateId: z.string().trim().max(64).optional(),
      userDesignId: z.string().trim().max(64).optional(),
      userAgent: z.string().trim().max(512).optional(),
    })
    .partial()
    .optional(),
});

export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>;

export const updateFeedbackSchema = z.object({
  status: z
    .enum(["new", "reviewed", "actioned", "archived"])
    .optional(),
  adminNotes: z.string().trim().max(4000).optional(),
});

export type UpdateFeedbackInput = z.infer<typeof updateFeedbackSchema>;
