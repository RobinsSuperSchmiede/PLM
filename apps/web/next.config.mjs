import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import bundleAnalyzer from '@next/bundle-analyzer';

// The npm workspace root (two levels up), where node_modules and the lockfile live. In the Docker image
// the app is built on its own, without the workspace around it.
const here = path.dirname(fileURLToPath(import.meta.url));
const inWorkspace = fs.existsSync(path.join(here, '../../package-lock.json'));
const workspaceRoot = inWorkspace ? path.resolve(here, '../..') : here;

// `npm run analyze` (or ANALYZE=true) writes an interactive size report per bundle to <distDir>/analyze.
const analyze = process.env.ANALYZE === 'true' || process.env.npm_lifecycle_event === 'analyze';
const withBundleAnalyzer = bundleAnalyzer({ enabled: analyze, openAnalyzer: false });

/** @type {import('next').NextConfig} */
const nextConfig = {
  // A separate build folder lets a production build (`npm run prod`) run next to `next dev`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
  // Notes, documents, files and images used to be separate pages; old links land in the explorer.
  // The query string (?id=…, ?folder=…) is carried over.
  async redirects() {
    return [
      { source: '/notes', destination: '/explorer', permanent: false },
      { source: '/knowledge', destination: '/explorer?view=docs', permanent: false },
      { source: '/files', destination: '/explorer?view=files', permanent: false },
      { source: '/images', destination: '/explorer?view=images', permanent: false },
    ];
  },
  experimental: {
    // /api/v1 passes through the middleware; uploads may be as large as the API allows (MAX_UPLOAD_MB, default 25).
    middlewareClientMaxBodySize: '30mb',
    // Import only the icons and primitives a page uses instead of the whole package.
    optimizePackageImports: ['lucide-react', 'motion'],
  },
};

export default withBundleAnalyzer(nextConfig);
