---
description: Regenerate Supabase TypeScript types from the linked project
allowed-tools: Bash(pnpm *), Bash(supabase *)
---

Regenerate types into `src/types/supabase.ts`:

1. Run `pnpm db:types`.
2. Print a summary of tables that changed (diff vs previous commit of `src/types/supabase.ts`).
3. Remind to update zod schemas in `src/lib/schemas/` if any table structure changed.
