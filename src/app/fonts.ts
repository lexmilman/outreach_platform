import { Manrope } from "next/font/google";
import localFont from "next/font/local";

export const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

/**
 * Cygre — replace these .woff2 files under `src/app/fonts/` with the licensed
 * woff2 files from your license provider before building production.
 * Until then, Cygre falls back to Manrope gracefully.
 */
export const cygre = localFont({
  src: [
    { path: "./fonts/Cygre-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Cygre-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/Cygre-Semibold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/Cygre-Bold.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-cygre",
  fallback: ["Manrope", "ui-sans-serif", "system-ui"],
});
