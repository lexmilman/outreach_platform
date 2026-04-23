# CSV import rules

## Pipeline
1. **Parse** — `src/lib/csv/parse.ts` uses papaparse with `header:true, skipEmptyLines:'greedy', dynamicTyping:false`. Streams rows for files > 10 MB.
2. **Auto-map** — `src/lib/csv/auto-map.ts` uses Fuse.js (threshold 0.35, includeScore) against the canonical alias corpus in `src/lib/csv/linked-helper.ts` to propose canonical → CSV column pairings.
3. **Preview** — first 5 rows with a per-field confidence indicator (green ≥ 0.8, amber 0.5–0.8, red < 0.5). Operator can override any mapping.
4. **Validate** — each row runs through `LeadSchema.safeParse`. Rejects go to an error list; never silent-drop.
5. **Dedup** — normalize LinkedIn URL (Sales Nav → public) via `src/lib/dedup/linkedin-url.ts`, compute `dedup_key = sha256(lower(first_name + last_name + domain))`, upsert into `people` on conflict `(linkedin_url)`.
6. **Insert** — bulk insert in 500-row chunks via `.upsert({ onConflict: "linkedin_url" })`. Create a `people_in_campaign` row per lead with the selected `client_id`.
7. **Report** — return `{ totalRows, insertedPeople, matchedExistingPeople, insertedCompanies, rejected: [{row, reason}] }`. Show toast + detailed panel.

## LinkedHelper alias corpus
Source of truth: `src/lib/csv/linked-helper.ts`. Each canonical field lists ≥ 3 aliases found in LinkedHelper exports. Examples:
- `first_name` → ["first name", "firstname", "first"]
- `last_name` → ["last name", "lastname", "surname"]
- `linkedin_url` → ["profile url", "linkedin", "linkedin url", "sales navigator url"]
- `current_title` → ["title", "position", "current position", "headline role"]
- `current_company_name` → ["company name", "organization 1", "current company", "employer"]
- `email` → ["email", "email 1", "primary email"]
- `about` → ["summary", "about", "bio"]

## LinkedIn URL normalization
- Sales Navigator `https://www.linkedin.com/sales/lead/ACwAA...,NAME_SEARCH,xxxx` → keep the `ACw...` hash as `linkedin_hash_id`, leave `linkedin_url` null until SignalHire resolves it.
- Public `https://www.linkedin.com/in/<slug>` → trim trailing slash, lowercase host, strip query/fragment.
- Company: `https://www.linkedin.com/company/<slug>` → same normalization.

## Forbidden
- Never silently drop rows. Every rejected row is surfaced in the UI.
- Never coerce numbers via `Number(x)` without a zod `z.coerce.number()` at the boundary.
- Never trust the CSV's email — mark `verification_status='unverified'` until a verifier confirms.
