import { withBotId } from "botid/next/config";

/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Keep preview / *.vercel.app copies of the site out of search results (thecampcheck.com is canonical).
      { source: "/:path*", has: [{ type: "host", value: "(?<sub>.*)\\.vercel\\.app" }], headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

// BotID: Vercel routes its challenge/detection requests automatically; the wrapper keeps the
// rewrites explicit so protection also works if automatic routing is ever unavailable.
export default withBotId(nextConfig);
