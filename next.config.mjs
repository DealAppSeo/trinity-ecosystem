/** @type {import('next').NextConfig} */
const nextConfig = {
    turbopack: {},
    webpack: (config) => {
        return config;
    },
    transpilePackages: ['@trinity/agent-core'],
};

export default nextConfig;
