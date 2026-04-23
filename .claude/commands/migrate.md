---
description: Create a new Supabase migration
argument-hint: "<migration_name>"
allowed-tools: Bash(supabase *), Bash(pnpm *)
---

1. Create a new migration file: `supabase migration new $ARGUMENTS`
2. Open the generated SQL file and wait for the user to edit it.
3. After the user signals the migration is ready, run `pnpm db:push` to apply to the linked remote.
4. Run `pnpm db:types` to regenerate types.
5. Update the matching zod schema in `src/lib/schemas/` if columns/tables changed.
