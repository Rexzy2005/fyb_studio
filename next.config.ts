import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Hide the floating Next.js dev indicator (the bottom-right widget that
  // includes the System / Dark / Light theme picker). The app is permanent
  // dark-mode, so the picker is misleading.
  devIndicators: false,
};

export default nextConfig;
