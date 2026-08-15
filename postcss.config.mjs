// Tailwind v4 moved the PostCSS entry point to `@tailwindcss/postcss`; the bare
// `tailwindcss` package is no longer a valid PostCSS plugin. Both are in
// dependencies (tailwindcss ^4.2.2), and with NO postcss config present Next 14
// auto-detected `tailwindcss` and tried to load it the v3 way, which fails while
// compiling app/globals.css.
//
// Declaring the config explicitly is the v4-correct setup and stops Next guessing.
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
