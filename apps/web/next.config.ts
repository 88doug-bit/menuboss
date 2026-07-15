import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship raw TypeScript source (main -> ./src/index.ts) and
  // use `.js`-extension ESM specifiers internally. Transpiling them here lets
  // Next/Turbopack resolve those specifiers to the `.ts` sources instead of
  // treating the symlinked packages as opaque externals.
  transpilePackages: ["@menu-boss/schemas", "@menu-boss/portion-calc"],
};

export default nextConfig;
