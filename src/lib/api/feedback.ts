export const FEEDBACK_CATEGORY_LABELS: Record<string, string> = {
  design_templates: "Design templates",
  editor_experience: "Editor experience",
  payment_download: "Payment & download",
  performance: "Speed & performance",
  bug_report: "Bug report",
  feature_request: "Feature request",
  other: "Other",
};

export type FeedbackCategoryKey = keyof typeof FEEDBACK_CATEGORY_LABELS;
export const FEEDBACK_CATEGORY_KEYS = Object.keys(
  FEEDBACK_CATEGORY_LABELS
) as FeedbackCategoryKey[];

export type FeedbackSource =
  | "dashboard_card"
  | "floating_button"
  | "post_download"
  | "other";

export type SubmitFeedbackBody = {
  rating: 1 | 2 | 3 | 4 | 5;
  categories: FeedbackCategoryKey[];
  message: string;
  source: FeedbackSource;
  context?: {
    page?: string;
    templateId?: string;
    userDesignId?: string;
    userAgent?: string;
  };
};

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string } };
    return data?.error?.message ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export async function submitFeedback(body: SubmitFeedbackBody): Promise<{
  ok: true;
  feedbackId: string;
}> {
  const res = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as { ok: true; feedbackId: string };
}
