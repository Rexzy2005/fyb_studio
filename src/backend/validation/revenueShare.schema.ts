import { z } from "zod";

const HEX_COLOR = /^#([0-9a-fA-F]{6})$/;
const ID = z
  .string()
  .trim()
  .min(1, "id is required")
  .max(64, "id is too long")
  .regex(/^[a-zA-Z0-9_-]+$/, "id may only contain letters, numbers, _ and -");

const categorySchema = z.object({
  id: ID,
  name: z.string().trim().min(1, "Category name is required").max(60),
  weightBps: z
    .number()
    .int("Category weight must be a whole number of basis points")
    .min(0)
    .max(10_000),
  color: z.string().regex(HEX_COLOR, "Color must be a 6-digit hex value"),
});

const memberSchema = z.object({
  id: ID,
  name: z.string().trim().min(1, "Member name is required").max(60),
  role: z
    .string()
    .trim()
    .max(40)
    .nullable()
    .optional()
    .transform((value) => {
      if (value == null) return null;
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed;
    }),
  color: z.string().regex(HEX_COLOR, "Color must be a 6-digit hex value"),
});

const assignmentSchema = z.object({
  memberId: ID,
  categoryId: ID,
});

export const revenueFrameworkSchema = z
  .object({
    categories: z.array(categorySchema).min(1, "Add at least one category").max(12),
    members: z.array(memberSchema).min(1, "Add at least one person").max(20),
    assignments: z.array(assignmentSchema).max(240),
  })
  .superRefine((value, ctx) => {
    const categoryIds = new Set<string>();
    for (const category of value.categories) {
      if (categoryIds.has(category.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["categories"],
          message: `Duplicate category id "${category.id}"`,
        });
      }
      categoryIds.add(category.id);
    }

    const memberIds = new Set<string>();
    const memberNames = new Set<string>();
    for (const member of value.members) {
      if (memberIds.has(member.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["members"],
          message: `Duplicate member id "${member.id}"`,
        });
      }
      memberIds.add(member.id);
      const key = member.name.toLowerCase();
      if (memberNames.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["members"],
          message: `Two people share the name "${member.name}"`,
        });
      }
      memberNames.add(key);
    }

    const weightSum = value.categories.reduce(
      (sum, category) => sum + category.weightBps,
      0
    );
    if (weightSum !== 10_000) {
      ctx.addIssue({
        code: "custom",
        path: ["categories"],
        message: `Category weights must add up to 100% (currently ${(weightSum / 100).toFixed(2)}%)`,
      });
    }

    const seenAssignments = new Set<string>();
    for (const assignment of value.assignments) {
      if (!memberIds.has(assignment.memberId)) {
        ctx.addIssue({
          code: "custom",
          path: ["assignments"],
          message: "Assignment points at an unknown person",
        });
      }
      if (!categoryIds.has(assignment.categoryId)) {
        ctx.addIssue({
          code: "custom",
          path: ["assignments"],
          message: "Assignment points at an unknown category",
        });
      }
      const key = `${assignment.memberId}:${assignment.categoryId}`;
      if (seenAssignments.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["assignments"],
          message: "Duplicate category assignment",
        });
      }
      seenAssignments.add(key);
    }

    for (const category of value.categories) {
      if (category.weightBps <= 0) continue;
      const hasContributor = value.assignments.some(
        (assignment) => assignment.categoryId === category.id
      );
      if (!hasContributor) {
        ctx.addIssue({
          code: "custom",
          path: ["assignments"],
          message: `"${category.name}" has a weight but nobody is assigned to it`,
        });
      }
    }
  });

export type RevenueFrameworkInput = z.infer<typeof revenueFrameworkSchema>;
