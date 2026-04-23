# Cygre font files

Drop the licensed woff2 files here before production build:

- `Cygre-Regular.woff2`   (400)
- `Cygre-Medium.woff2`    (500)
- `Cygre-Semibold.woff2`  (600)
- `Cygre-Bold.woff2`      (700)

Until these files exist, `src/app/fonts.ts` will fall back to Manrope via
`next/font/local`'s fallback chain.
