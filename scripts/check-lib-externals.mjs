/**
 * Post-build gate for dist-lib: 3D must stay on host `three`, never R3F.
 *
 * Usage: node scripts/check-lib-externals.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist-lib');

const FORBIDDEN = ['@react-three', 'react-reconciler', 'three-stdlib'];

/** ESM import of host `three` (package or subpath). */
const THREE_EXTERNAL_RE = /(?:from|import)\s+['"]three(?:\/[^'"]*)?['"]/g;

/**
 * @param {string} dir
 * @param {string[]} files
 */
function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(full, files);
      continue;
    }
    if (ent.name.endsWith('.js') || ent.name.endsWith('.d.ts')) files.push(full);
  }
  return files;
}

if (!fs.existsSync(DIST)) {
  console.error('check-lib-externals: dist-lib/ is missing; run the library build first');
  process.exit(1);
}

const files = walk(DIST);
if (files.length === 0) {
  console.error('check-lib-externals: dist-lib/ has no .js or .d.ts files');
  process.exit(1);
}

const errors = [];
const threeExternalFiles = [];

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const content = fs.readFileSync(file, 'utf8');
  for (const needle of FORBIDDEN) {
    if (content.includes(needle)) {
      errors.push(`${rel}: forbidden "${needle}"`);
    }
  }
  if (file.endsWith('.js')) {
    THREE_EXTERNAL_RE.lastIndex = 0;
    if (THREE_EXTERNAL_RE.test(content)) threeExternalFiles.push(rel);
  }
}

if (threeExternalFiles.length === 0) {
  errors.push(
    'no external `three` imports found in dist-lib/**/*.js (from "three" / from \'three\' / from "three/…"); three appears inlined',
  );
}

if (errors.length > 0) {
  console.error('check-lib-externals: failed');
  for (const err of errors) console.error(`  ${err}`);
  process.exit(1);
}

console.log(
  `check-lib-externals: ok (${files.length} files; three external in ${threeExternalFiles.length} js chunks)`,
);
