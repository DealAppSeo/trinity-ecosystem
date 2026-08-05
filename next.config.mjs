import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  // The `@/*` -> `./*` alias is declared in tsconfig.json, and Next was not
  // applying it: every `@/lib/...` import failed with "Module not found" even
  // though the files are present, correctly cased, and tracked on main.
  // Reproduced locally from a clean `npm install`, and adding `baseUrl` to
  // tsconfig did NOT fix it — so the alias is declared here explicitly, where
  // webpack is guaranteed to honour it.
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@': __dirname,
    };
    return config;
  },
};

export default nextConfig;
