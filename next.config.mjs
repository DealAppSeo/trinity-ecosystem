/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        turbo: {
            enabled: false,
        },
    },
    transpilePackages: ['@trinity/agent-core'],
};

export default nextConfig;
