import { z } from "zod";

/**
 * LeadSchema — minimum shape we require to insert a row into `people`.
 * Stricter than the canonical alias list — we need at least a LinkedIn URL OR
 * a name + company to have any hope of dedup.
 */
export const LeadSchema = z
  .object({
    first_name: z.string().trim().optional(),
    last_name: z.string().trim().optional(),
    full_name: z.string().trim().optional(),
    linkedin_url: z.string().trim().optional(),
    public_identifier: z.string().trim().optional(),
    headline: z.string().trim().optional(),
    about: z.string().trim().optional(),
    current_title: z.string().trim().optional(),
    current_company_name: z.string().trim().optional(),
    current_company_linkedin_url: z.string().trim().optional(),
    current_company_website: z.string().trim().optional(),
    current_company_industry: z.string().trim().optional(),
    location: z.string().trim().optional(),
    country: z.string().trim().optional(),
    photo_url: z.string().trim().optional(),
    email: z.string().email().optional().or(z.literal("").transform(() => undefined)),
    phone: z.string().trim().optional(),
    connections_count: z.coerce.number().int().nonnegative().optional(),
    followers_count: z.coerce.number().int().nonnegative().optional(),
  })
  .refine(
    (d) =>
      Boolean(d.linkedin_url) ||
      Boolean((d.first_name || d.full_name) && (d.current_company_name || d.email)),
    { message: "Row must have a LinkedIn URL, or a name with a company/email." },
  );

export type Lead = z.infer<typeof LeadSchema>;
