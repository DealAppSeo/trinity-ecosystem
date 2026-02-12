/** @type {import('next').NextConfig} */
const nextConfig = {
    eslint: {
        ignoreDuringBuilds: true,
    },
    typescript: {
        ignoreBuildErrors: true,
    },
    webpack: (config) => {
        return config;
    },
    transpilePackages: ['@trinity/agent-core'],
    outputFileTracingRoot: process.cwd(),
    experimental: {},
};

export default nextConfig;
