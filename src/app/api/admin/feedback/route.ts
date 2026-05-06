import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import {
  listFeedback,
  type ListFeedbackFilters,
} from "@/backend/services/feedback.service";
import { FEEDBACK_CATEGORIES } from "@/backend/db/models/feedback.model";

export const runtime = "nodejs";

const querySchema = z.object({
  status: z.enum(["new", "reviewed", "actioned", "archived"]).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  category: z.enum(FEEDBACK_CATEGORIES).optional(),
  search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

/**
 * GET /api/admin/feedback
 *
 * Cursor-paginated list, filterable by status / rating / category / message
 * search.
 */
export const GET = withErrorHandler(async (req) => {
  await requireAdmin();
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.parse(Object.fromEntries(searchParams.entries()));
  const filters: ListFeedbackFilters = {
    status: parsed.status,
    rating: parsed.rating,
    category: parsed.category,
    search: parsed.search,
    limit: parsed.limit,
    cursor: parsed.cursor ?? null,
  };
  const result = await listFeedback(filters);
  return NextResponse.json(result);
});
