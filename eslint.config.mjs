// Flat config. Replaces `.eslintrc.json`, which ESLint 10 no longer reads at
// all — the eslintrc format was removed, not merely deprecated, so a project
// left on the old file lints zero rules while still exiting 0. That is the
// failure shape this repo keeps finding: a green run that checked nothing.
//
// `next lint` was removed in Next 16 and now reads its first argument as a
// directory, so `next lint` fails with "no such directory: ./lint". The lint
// script therefore invokes ESLint directly.

import coreWebVitals from 'eslint-config-next/core-web-vitals';

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      // Deno runtime, its own toolchain — tsconfig excludes these for the same
      // reason.
      'supabase/functions/**',
    ],
  },
  ...coreWebVitals,
];

export default config;
