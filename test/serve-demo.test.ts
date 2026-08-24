import { resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveRequestPath } from '../scripts/serve-demo.js';

const ROOT = resolve('/srv/demo');

describe('resolveRequestPath', () => {
  it('resolves paths inside the root', () => {
    expect(resolveRequestPath(ROOT, '/')).toBe(ROOT);
    expect(resolveRequestPath(ROOT, '/index.html')).toBe(`${ROOT}${sep}index.html`);
    expect(resolveRequestPath(ROOT, '/assets/app.js')).toBe(`${ROOT}${sep}assets${sep}app.js`);
  });

  it('collapses traversal that stays inside the root', () => {
    expect(resolveRequestPath(ROOT, '/assets/../index.html')).toBe(`${ROOT}${sep}index.html`);
  });

  it('clamps traversal attempts back into the root instead of escaping it', () => {
    // `normalize` drops the leading `..` segments of an absolute pathname, so these
    // land inside the root (and 404 there) instead of reaching anything above it.
    expect(resolveRequestPath(ROOT, '/../package.json')).toBe(`${ROOT}${sep}package.json`);
    expect(resolveRequestPath(ROOT, '/../../srv/other/secret.txt')).toBe(
      `${ROOT}${sep}srv${sep}other${sep}secret.txt`,
    );
    expect(resolveRequestPath(ROOT, '/%2e%2e/%2e%2e/secret.txt')).toBe(`${ROOT}${sep}secret.txt`);
    expect(resolveRequestPath(ROOT, '/assets/../../secrets.env')).toBe(`${ROOT}${sep}secrets.env`);
  });

  it('rejects anything that would still resolve outside the root', () => {
    expect(resolveRequestPath(ROOT, '../escape.txt')).toBeUndefined();
    expect(resolveRequestPath(ROOT, '../demo-private/secret.txt')).toBeUndefined();
  });

  it('rejects null bytes and malformed percent-encoding', () => {
    expect(resolveRequestPath(ROOT, '/index.html%00.png')).toBeUndefined();
    expect(resolveRequestPath(ROOT, '/%')).toBeUndefined();
  });
});
