// npm for the desktop app, run with the Node.js that `plm-node` chose (see openshell.json):
//
//   plm-node scripts/npm.mjs install --no-audit --no-fund
//
// Runs the npm that belongs to this node (next to it in the official builds, also the portable one
// that scripts/runtimes downloads) in the repository root, so the workspaces install together. When
// that npm is missing (some Linux packages ship it separately), the npm on the PATH is used.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const bin = path.dirname(process.execPath);
const cli = [
  path.join(bin, 'node_modules/npm/bin/npm-cli.js'), // Windows
  path.join(bin, '../lib/node_modules/npm/bin/npm-cli.js'), // macOS, Linux
].find((file) => fs.existsSync(file));

const args = process.argv.slice(2);
const child = cli
  ? spawn(process.execPath, [cli, ...args], { cwd: root, stdio: 'inherit' })
  : spawn('npm', args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', (error) => {
  console.error(`[npm] ${error.message}`);
  process.exit(1);
});
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
