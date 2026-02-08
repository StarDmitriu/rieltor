import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // один бандл для запуска — не нужен второй npm ci в Docker
  // Отключено: React Compiler в связке с RSC даёт ReferenceError: returnNaN is not defined
  // reactCompiler: true,
  async rewrites() {
    // В Docker используем внутренний хост backend; локально — localhost
    const backendHost =
      process.env.BACKEND_INTERNAL_URL || "http://localhost:3000";
    return [
      {
        source: "/api/:path*",
        destination: `${backendHost.replace(/\/$/, "")}/:path*`,
      },
    ];
  },
};

export default nextConfig;