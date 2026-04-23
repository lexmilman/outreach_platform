import { z } from "zod";

export const ClientNameSchema = z.string().trim().min(2, "Name is too short").max(120);
export const ClientSlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase kebab-case");

export const ClientCreateSchema = z.object({
  name: ClientNameSchema,
  slug: ClientSlugSchema.optional(),
  icp_description: z.string().trim().max(4000).optional().nullable(),
  brand_voice: z.string().trim().max(4000).optional().nullable(),
});
export type ClientCreateInput = z.infer<typeof ClientCreateSchema>;

export const ClientUpdateSchema = ClientCreateSchema.partial().extend({
  id: z.string().uuid(),
  is_archived: z.boolean().optional(),
});
export type ClientUpdateInput = z.infer<typeof ClientUpdateSchema>;

export const ClientIdSchema = z.object({ id: z.string().uuid() });
