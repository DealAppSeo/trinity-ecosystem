/** @type {import('next').NextConfig} */
const nextConfig = {
    webpack: (config) => {
        return config;
    },
    transpilePackages: ['@trinity/agent-core'],
};

export default nextConfig;
