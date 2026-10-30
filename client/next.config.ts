import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: { root: here },
  // On Vercel: send /api requests to the Render server (keeps the login cookie on one site)
  async rewrites() {
    const target = process.env.API_PROXY_TARGET;
    return target
      ? [{ source: "/api/:path*", destination: `${target}/api/:path*` }]
      : [];
  },
};
export default nextConfig;
