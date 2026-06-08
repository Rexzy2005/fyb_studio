import { z } from "zod";

export const createDepartmentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Department name must be at least 2 characters")
    .max(120, "Department name must be at most 120 characters"),
  abbreviation: z
    .string()
    .trim()
    .min(2, "Abbreviation must be at least 2 characters")
    .max(12, "Abbreviation must be at most 12 characters")
    .regex(/^[a-z0-9]+$/i, "Abbreviation may only contain letters and numbers"),
});

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
