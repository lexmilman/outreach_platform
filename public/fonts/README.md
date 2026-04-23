# Cygre font files

Drop the licensed Cygre woff2 files here to activate the heading font:

- `Cygre-Regular.woff2`   (400)
- `Cygre-Medium.woff2`    (500)
- `Cygre-Semibold.woff2`  (600)
- `Cygre-Bold.woff2`      (700)

`@font-face` declarations in `src/app/globals.css` point here. Until these
files are present, headings fall back to Manrope via the `--font-display`
variable.
