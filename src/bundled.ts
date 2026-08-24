/**
 * Self-contained entry point for hosts without a bundler.
 *
 * Importing it defines the custom elements, exactly like `./register`. The
 * difference is what ships: `vite.bundled.config.ts` builds this module into a
 * single `dist/bundled.js` with every dependency inlined — CodeMirror included,
 * and the dynamic import that normally splits it flattened away — so the file
 * resolves no bare specifiers, needs no import map, and issues no request of its
 * own once loaded.
 */
import { defineStateMachineEditor } from './index.js';

defineStateMachineEditor();
