/**
 * Guards the promise `dist/bundled.js` makes: one file, loadable from a plain
 * `<script type="module">` with no bundler and no import map.
 *
 * Run after `npm run build`. It fails the build rather than letting a config
 * change quietly reintroduce a bare specifier or a second chunk — both of which
 * only surface as a runtime error on the host, and only for whoever opens the
 * JSON tab.
 *
 * Usage: node scripts/check-bundled.ts
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const BUNDLE = resolve(DIST, 'bundled.js');

/**
 * Every `from '...'` and `import('...')` specifier left in the built file.
 *
 * A regex is enough here because the input is minified output whose only job is
 * to have no imports at all: any match is a failure, so precision beyond
 * "something that looks like a specifier" would not change the verdict.
 */
function importSpecifiers(source: string): readonly string[] {
  const found: string[] = [];
  const patterns = [
    /(?:^|[\s;}])(?:import|export)[\s\S]{0,200}?from\s*["']([^"']+)["']/g,
    /(?:^|[^\w$.])import\s*\(\s*["']([^"']+)["']\s*\)/g,
    /(?:^|[\s;}])import\s*["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) {
        found.push(specifier);
      }
    }
  }
  return found;
}

function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} kB`;
}

async function main(): Promise<void> {
  const failures: string[] = [];

  let source: string;
  try {
    source = await readFile(BUNDLE, 'utf8');
  } catch {
    console.error('No dist/bundled.js. Build first: npm run build');
    process.exitCode = 1;
    return;
  }

  const specifiers = importSpecifiers(source);
  if (specifiers.length > 0) {
    failures.push(
      `dist/bundled.js still imports ${specifiers.map((one) => `"${one}"`).join(', ')}. ` +
        'A browser with no import map cannot resolve those.',
    );
  }

  // The build inlines dynamic imports, so a stray chunk means the config drifted.
  const strays = (await readdir(DIST)).filter(
    (name) => name.endsWith('.js') && /-[A-Za-z0-9_]{8}\.js$/.test(name),
  );
  if (strays.length > 0) {
    failures.push(
      `dist/ contains code-split chunks (${strays.join(', ')}). ` +
        'dist/bundled.js is meant to be the only file a static host copies.',
    );
  }

  // CodeMirror is the bulk of the payload; without it the JSON tab is broken.
  if (!source.includes('cm-editor')) {
    failures.push('dist/bundled.js does not contain CodeMirror. The JSON tab would not load.');
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`✗ ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  const { size } = await stat(BUNDLE);
  const gzipped = gzipSync(source).byteLength;
  console.log(
    `✓ dist/bundled.js is self-contained: ${formatKb(size)} raw, ${formatKb(gzipped)} gzipped.`,
  );
}

await main();
