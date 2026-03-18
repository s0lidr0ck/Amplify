/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['api-client'],
  output: 'standalone',
};

module.exports = nextConfig;
