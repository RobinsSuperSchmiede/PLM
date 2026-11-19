// Runs the web app under OpenShell (see `openshell.json` in the repository root).
//
//   node scripts/openshell-web.mjs dev   [next options]   development server with hot reload
//   node scripts/openshell-web.mjs build                  production build
//   node scripts/openshell-web.mjs start [next options]   production server; builds first if the
//                                                         source changed since the last build
//
// The build records a hash of the web app's source in .next/openshell-source. So `start` rebuilds
// exactly when someone (a person or a coding tool) changed the code, and an installed app whose
// build was shipped starts right away.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(web, '../..');
// A build folder of its own, so the desktop app never collides with a `next dev` or `next build`
// someone runs in apps/web at the same time (they use .next). next.config.mjs reads NEXT_DIST_DIR.
process.env.NEXT_DIST_DIR ||= '.next-desktop';
const distDir = path.join(web, process.env.NEXT_DIST_DIR);
const marker = path.join(distDir, 'openshell-source');
const next = createRequire(path.join(web, 'package.json')).resolve('next/dist/bin/next');

const [mode, ...options] = process.argv.slice(2);

/**
 * Hash over the source files of the web app (and the shared packages and the lockfile). Files that do
 * not go into the build are left out, also because an installer does not ship all of them
 * (`package.exclude` in openshell.json): with them, an installed app would rebuild on its first start.
 */
function sourceHash() {
  const hash = createHash('sha256');
  const skipped = new Set(['node_modules', '.git', 'scripts', 'next-env.d.ts', 'tsconfig.tsbuildinfo', 'Dockerfile', '.dockerignore']);
  const walk = (folder) => {
    if (!fs.existsSync(folder)) return;
    for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (skipped.has(entry.name) || entry.name.startsWith('.next') || entry.name.startsWith('.env') || entry.name.endsWith('.md')) continue;
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) hash.update(path.relative(root, file).replaceAll('\\', '/')).update('\0').update(fs.readFileSync(file));
    }
  };
  walk(web);
  walk(path.join(root, 'packages'));
  for (const file of ['package.json', 'package-lock.json']) {
    const full = path.join(root, file);
    if (fs.existsSync(full)) hash.update(file).update(fs.readFileSync(full));
  }
  return hash.digest('hex');
}

/** Runs Next.js with the given arguments; resolves with its exit code. */
function runNext(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [next, ...args], { cwd: web, stdio: 'inherit' });
    // OpenShell stops the process tree; forward a polite stop where signals exist.
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

async function build() {
  const source = sourceHash();
  const code = await runNext(['build']);
  if (code === 0) fs.writeFileSync(marker, source);
  return code;
}

function isBuilt() {
  if (!fs.existsSync(path.join(distDir, 'BUILD_ID')) || !fs.existsSync(marker)) return false;
  return fs.readFileSync(marker, 'utf8').trim() === sourceHash();
}

let code;
if (mode === 'dev') {
  // The development server writes into the same folder; the build is not trustworthy afterwards.
  fs.rmSync(marker, { force: true });
  code = await runNext(['dev', '--turbopack', ...options]);
} else if (mode === 'build') {
  code = await build();
} else if (mode === 'start') {
  if (!isBuilt()) {
    console.log('[openshell-web] the source changed since the last build (or there is none); building');
    code = await build();
  }
  if (!code) code = await runNext(['start', ...options]);
} else {
  console.error('usage: node scripts/openshell-web.mjs dev|build|start [next options]');
  code = 2;
}
process.exit(code);
