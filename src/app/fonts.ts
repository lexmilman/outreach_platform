import { Manrope } from "next/font/google";

export const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

/**
 * Headings use Cygre. Cygre is a licensed font — we load it via @font-face
 * in `src/app/globals.css` (not via `next/font/local`) so missing woff2 files
 * don't break the build. Drop the licensed files into `public/fonts/` to
 * activate:
 *   - public/fonts/Cygre-Regular.woff2   (400)
 *   - public/fonts/Cygre-Medium.woff2    (500)
 *   - public/fonts/Cygre-Semibold.woff2  (600)
 *   - public/fonts/Cygre-Bold.woff2      (700)
 * Until they're present, headings fall back to Manrope via the `--font-display`
 * CSS variable defined in `globals.css`.
 */
