import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Усі сторінки персональні (залежать від сесії), тож Cache Components не потрібні.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
