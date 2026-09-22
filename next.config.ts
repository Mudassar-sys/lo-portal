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
};

export default nextConfig;
