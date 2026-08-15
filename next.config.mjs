import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },

  // TURBOPACK IS THE DEFAULT BUILDER FROM NEXT 16. Declaring it — even empty —
  // is what tells Next the webpack block below is a deliberate fallback rather
  // than an unmigrated leftover; without it the build aborts outright rather
  // than warning.
  //
  // Turbopack resolves `@/*` from tsconfig.json `paths` on its own, which is
  // why nothing is repeated here. That was NOT true of the Next 14 webpack
  // resolver — see the note on the webpack block.
  turbopack: {},

  // Kept for `next build --webpack`, which is still a supported escape hatch.
  //
  // The `@/*` -> `./*` alias is declared in tsconfig.json, and the Next 14
  // webpack resolver was not applying it: every `@/lib/...` import failed with
  // "Module not found" even though the files are present, correctly cased, and
  // tracked on main. Reproduced from a clean `npm install`, and adding `baseUrl`
  // to tsconfig did NOT fix it — so the alias is declared explicitly here.
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@': __dirname,
    };
    return config;
  },
};

export default nextConfig;
