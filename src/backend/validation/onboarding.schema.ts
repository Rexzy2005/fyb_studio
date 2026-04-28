import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username must be at least 3 characters")
  .max(24, "Username must be at most 24 characters")
  .regex(
    /^[a-z0-9_]+$/,
    "Username may only contain lowercase letters, numbers, and underscores"
  );

export const objectIdSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/i, "Invalid id");

export const completeOnboardingSchema = z.object({
  username: usernameSchema,
  departmentId: objectIdSchema,
  isDepartmentHead: z.boolean(),
});

export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>;

export const checkUsernameSchema = z.object({
  username: usernameSchema,
});
