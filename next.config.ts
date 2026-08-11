import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Uten dette plukker Turbopack opp package-lock.json i hjemmekatalogen som prosjektrot.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
