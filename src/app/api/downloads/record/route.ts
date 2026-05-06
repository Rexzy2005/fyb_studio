import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import {
  recordDownload,
  requireActiveGrant,
} from "@/backend/services/payment.service";

export const runtime = "nodejs";

const bodySchema = z.object({
  templateId: z.string().min(1),
  userDesignId: z.string().min(1).nullable().optional(),
  scale: z.number().int().min(1).max(10).nullable().optional(),
});

/**
 * POST /api/downloads/record
 *
 * Authoritative server-side record of a download. The client calls this
 * AFTER it has rendered + downloaded the PNG; we use it to:
 *   1. Reject the download if the user doesn't have an active grant (defense
 *      in depth — the client also gates, but trust is server-side).
 *   2. Increment the grant counter + write a DownloadEvent row for the admin
 *      revenue dashboard.
 *
 * If the grant check fails, the client's already shown the user the file —
 * but the response is a clear PAYMENT_REQUIRED that the editor can use to
 * lock subsequent downloads down. We don't try to "unsend" the file.
 */
export const POST = withErrorHandler(async (req) => {
  const session = await requireSession();
  const body = bodySchema.parse(await req.json());

  const grant = await requireActiveGrant({
    userId: session.user.id,
    templateId: body.templateId,
    userDesignId: body.userDesignId ?? null,
  });

  await recordDownload({
    grantId: String(grant._id),
    scale: body.scale ?? null,
  });

  return NextResponse.json({ ok: true });
});
