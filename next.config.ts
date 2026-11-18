import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Only the app itself and Gopinath's portfolio (which shows it in a phone frame) may embed it.
  { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://tgopinath.github.io" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Lets a production build run alongside the dev server (NEXT_DIST_DIR=.next-build).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["web-push", "bcryptjs", "@electric-sql/pglite", "pglite-prisma-adapter"],
  // Demo mode (no DATABASE_URL) builds its in-memory database from the migrations at run time.
  outputFileTracingIncludes: { "/**": ["./prisma/migrations/**/*.sql", "./node_modules/@electric-sql/pglite/dist/**"] },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/sw.js", headers: [{ key: "Service-Worker-Allowed", value: "/" }, { key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};

export default nextConfig;
