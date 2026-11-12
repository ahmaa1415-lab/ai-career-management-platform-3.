/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3', 'pdf-parse'],
  reactStrictMode: true,
};

export default nextConfig;
