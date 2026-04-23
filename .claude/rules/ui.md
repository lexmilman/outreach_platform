# UI rules

## Design tokens
Brand palette (CSS variables defined in `src/app/globals.css` under `@theme`):
- `--color-brand-500: #016FFF` (primary electric blue)
- `--color-brand-700: #1D4FDA`
- `--color-brand-300: #4A7BFF`
- `--color-ink-950: #111119` (near-black)
- `--color-ink-500: #9AA0A7`
- `--color-mist-50: #F0F3F7` (near-white)

Gradients:
- `.bg-brand-gradient` — `linear-gradient(135deg, #016FFF 0%, #1D4FDA 100%)`
- `.text-brand-gradient` — same, applied to text via `background-clip: text`

Glassmorphism:
- `.glass` — `backdrop-blur-lg bg-white/60 dark:bg-ink-900/60 border border-white/30 dark:border-white/10`

## Fonts
- Headings: **Cygre** (local woff2 in `src/app/fonts/`).
- Body: **Manrope** (Google via `next/font`).
- Applied via root `<body>` classes from `src/app/fonts.ts`.

## Components
- Use shadcn/ui `new-york` variant. Generated components live in `src/components/ui/`.
- Feature components live in `src/components/features/<feature>/`.
- Layout components in `src/components/layout/`.
- Compose primitives — do not re-implement. Extend variants via `cva`.

## Conventions
- `"use client"` at the very top of any file with state, event handlers, or browser APIs.
- Server Components are the default. Avoid marking pages as client.
- Never inline SVGs larger than ~30 lines — reference `public/*.svg`.
- Prefer `lucide-react` icons. `size-4` / `size-5` Tailwind for consistent sizing.
- Use `cn()` from `@/lib/utils` for conditional classes.
- No CSS-in-JS — only Tailwind + CSS variables.

## Accessibility
- Every interactive element has a visible focus state (`focus-visible:ring-2 ring-brand-500`).
- Labels on every input. Use shadcn `Form` primitives.
- Color contrast ≥ 4.5:1 on body text. Run Lighthouse a11y ≥ 95.

## Tables
- Always use the `DataGrid` component for tabular data over 25 rows — it virtualizes both axes.
- Small lists use `Table` from `src/components/ui/table.tsx` directly.
