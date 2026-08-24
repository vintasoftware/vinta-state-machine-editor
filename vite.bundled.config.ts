/**
 * Builds `dist/bundled.js`: the no-bundler entry point.
 *
 * `npm run build` runs this after `tsc`, so `dist/` ends up holding both routes
 * — the tree-shakeable module graph that bundler consumers import through `.`
 * and `./register`, and this single file for hosts that serve static assets
 * verbatim (the Django admin, say). The two never collide: `src/bundled.ts` is
 * excluded from `tsconfig.build.json`, so nothing here overwrites tsc output.
 *
 * `scripts/check-bundled.ts` asserts the guarantees this config exists to make.
 */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const ROOT = import.meta.dirname;
const OUT_DIR = resolve(ROOT, 'dist');

/**
 * Rolldown emits no declarations, and the entry has none to emit — it is
 * imported for its side effect. Writing the stub keeps `"types"` on the
 * `./bundled` export honest for anyone who imports it from TypeScript.
 */
function bundledTypes(): Plugin {
  return {
    name: 'bundled-types',
    async closeBundle() {
      await writeFile(
        resolve(OUT_DIR, 'bundled.d.ts'),
        '// Side-effect only: importing this module registers the custom elements.\nexport {};\n',
      );
    },
  };
}

export default defineConfig({
  plugins: [bundledTypes()],
  build: {
    outDir: OUT_DIR,
    // tsc has already written the rest of dist/ by the time this runs.
    emptyOutDir: false,
    target: 'es2022',
    // A source map would be a second file to copy, and a devtools 404 for
    // anyone who copied only the first. The point of this build is one file.
    sourcemap: false,
    lib: {
      entry: resolve(ROOT, 'src/bundled.ts'),
      formats: ['es'],
      fileName: () => 'bundled.js',
    },
    rollupOptions: {
      // Nothing is external: a browser with no import map cannot resolve a bare
      // specifier, so every dependency has to be inside the file.
      external: [],
      output: {
        // Flattens `import('./json-text-editor.js')` into this chunk. Left
        // split, CodeMirror lands in a second, hash-named file that the JSON
        // tab fetches on first open — a request a static host only serves if
        // whoever deployed it knew to copy that file too.
        codeSplitting: false,
        // Vite's own `build.minify` mangles but leaves the output pretty-printed
        // (525 kB). Asking for the whitespace pass too brings it to 408 kB.
        minify: {
          module: true,
          compress: true,
          mangle: true,
          codegen: { removeWhitespace: true },
        },
      },
    },
  },
});
