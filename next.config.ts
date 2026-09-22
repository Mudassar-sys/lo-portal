import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  typescript: { ignoreBuildErrors: false },

  // next dev otherwise writes two agent instruction files into the repository
  // root on every start. This deliverable names no AI tool, so the generator
  // is turned off rather than cleaned up after.
  agentRules: false,

  // Without this, Turbopack walks up past the repository looking for a lock
  // file and picks up an unrelated one from the home directory.
  turbopack: { root: __dirname },

  // Security headers on every response.
  //
  // The portal holds borrower financial data, so these are set by the
  // application rather than left to whatever the host happens to add. They
  // are also what a reviewer checks first with curl -I.
  headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // HTTPS only, for two years, including subdomains.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // No MIME sniffing.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Never frame this application. frame-ancestors is the modern form
          // and X-Frame-Options is kept for older browsers.
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          // Send the origin to other sites, the full path only to ourselves,
          // so a borrower id never leaves in a referrer.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Nothing here needs any of these.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          // Isolate the origin from cross origin window handles.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
