---
description: Run checks, commit (conventional), push
argument-hint: "<type(scope): message>"
allowed-tools: Bash(pnpm *), Bash(git *)
---

Run in order and abort on first failure:

1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm test`

If all pass:
- `git add -A`
- `git commit -m "$ARGUMENTS"`
- `git push origin HEAD`

Print the resulting commit SHA.
