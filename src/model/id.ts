let counter = 0;

function hasRandomUUID(value: Crypto): value is Crypto & { randomUUID: () => string } {
  return 'randomUUID' in value && typeof value.randomUUID === 'function';
}

/** Creates a reasonably unique id, falling back to a counter where `crypto` is absent. */
export function createId(prefix: string): string {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef !== undefined && hasRandomUUID(cryptoRef)) {
    return `${prefix}_${cryptoRef.randomUUID()}`;
  }
  counter += 1;
  return `${prefix}_${counter.toString(36)}${Date.now().toString(36)}`;
}
