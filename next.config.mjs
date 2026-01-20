/** @type {import('next').NextConfig} */
const nextConfig = {
    webpack: (config) => {
        return config;
    },
    experimental: {
        turbopack: false,
    },
    transpilePackages: ['@trinity/agent-core'],
};

export default nextConfig;
