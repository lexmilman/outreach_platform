import { z } from "zod";

const nonEmpty = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? undefined : v))
  .optional();

const emailOrEmpty = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? undefined : v))
  .pipe(z.string().email().optional());

/**
 * LeadSchema — minimum shape to insert a row into `people`.
 * A row must have at least:
 *   - a LinkedIn URL (public or sales-nav hash), OR
 *   - a name + (company OR email), so dedup_key / email fallback can pair them.
 */
export const LeadSchema = z
  .object({
    first_name: nonEmpty,
    last_name: nonEmpty,
    full_name: nonEmpty,

    linkedin_url: nonEmpty,
    linkedin_hash_id: nonEmpty,
    public_identifier: nonEmpty,

    headline: nonEmpty,
    about: nonEmpty,
    current_title: nonEmpty,
    location: nonEmpty,
    country: nonEmpty,
    photo_url: nonEmpty,

    connections_count: z.coerce.number().int().nonnegative().optional(),
    followers_count: z.coerce.number().int().nonnegative().optional(),

    email: emailOrEmpty,
    phone: nonEmpty,

    current_company_name: nonEmpty,
    current_company_linkedin_url: nonEmpty,
    current_company_website: nonEmpty,
    current_company_industry: nonEmpty,
    current_company_employees: z.coerce.number().int().nonnegative().optional(),
    current_company_hq_city: nonEmpty,
    current_company_hq_country: nonEmpty,
    current_company_description: nonEmpty,
    current_company_logo_url: nonEmpty,
    current_company_founded: z.coerce.number().int().min(1800).max(2100).optional(),

    source_list: nonEmpty,
    added_at: nonEmpty,
  })
  .refine(
    (d) =>
      Boolean(d.linkedin_url) ||
      Boolean((d.first_name || d.full_name) && (d.current_company_name || d.email)),
    { message: "Row must have a LinkedIn URL, or a name with a company/email." },
  );

export type Lead = z.infer<typeof LeadSchema>;
