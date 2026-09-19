/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Hackathon speed: don't fail prod builds on lint warnings.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
