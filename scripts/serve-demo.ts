/**
 * Minimal zero-dependency static file server for the built demo.
 *
 * Usage: node scripts/serve-demo.ts [--port 4173] [--host 0.0.0.0] [--root dev-dist]
 *
 * It binds to every interface by default so the demo can be opened from other
 * devices on the same network (phones, tablets, another laptop).
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

interface Options {
  readonly port: number;
  readonly host: string;
  readonly root: string;
}

function readOptions(argv: readonly string[]): Options {
  const values = new Map<string, string>();
  argv.forEach((argument, index) => {
    if (argument.startsWith('--')) {
      const inline = argument.indexOf('=');
      if (inline === -1) {
        values.set(argument.slice(2), argv[index + 1] ?? '');
      } else {
        values.set(argument.slice(2, inline), argument.slice(inline + 1));
      }
    }
  });

  const port = Number.parseInt(values.get('port') ?? '4173', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid --port "${values.get('port') ?? ''}".`);
  }
  return {
    port,
    host: values.get('host') ?? '0.0.0.0',
    root: resolve(process.cwd(), values.get('root') ?? 'dev-dist'),
  };
}

/**
 * Resolves a request path inside `root`, or `undefined` when it would escape it.
 *
 * Leading `..` segments of an absolute pathname are dropped by `normalize`, so a
 * traversal attempt is clamped inside the root (and simply 404s there). The
 * explicit prefix check below is the backstop for anything that still points out.
 */
export function resolveRequestPath(root: string, pathname: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  if (decoded.includes('\0')) {
    return undefined;
  }
  const candidate = resolve(join(root, normalize(decoded)));
  if (candidate !== root && !candidate.startsWith(root + sep)) {
    return undefined;
  }
  return candidate;
}

function contentType(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

function sendText(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
}

async function sendFile(
  request: IncomingMessage,
  response: ServerResponse,
  filePath: string,
  size: number,
): Promise<void> {
  response.writeHead(200, {
    'content-type': contentType(filePath),
    'content-length': size,
    'cache-control': 'no-store',
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(filePath)
    .on('error', () => {
      response.destroy();
    })
    .pipe(response);
}

async function handle(
  options: Options,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendText(response, 405, 'Only GET and HEAD are supported.');
    return;
  }

  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const target = resolveRequestPath(options.root, url.pathname);
  if (target === undefined) {
    sendText(response, 403, 'Forbidden.');
    return;
  }

  try {
    const stats = await stat(target);
    if (stats.isDirectory()) {
      const index = join(target, 'index.html');
      const indexStats = await stat(index);
      await sendFile(request, response, index, indexStats.size);
      return;
    }
    await sendFile(request, response, target, stats.size);
  } catch {
    sendText(response, 404, `Not found: ${url.pathname}`);
  }
}

function networkUrls(port: number): readonly string[] {
  const urls: string[] = [];
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        urls.push(`http://${address.address}:${port}`);
      }
    }
  }
  return urls;
}

async function main(): Promise<void> {
  const options = readOptions(process.argv.slice(2));

  try {
    const stats = await stat(join(options.root, 'index.html'));
    if (!stats.isFile()) {
      throw new Error('index.html is not a file');
    }
  } catch {
    console.error(`No index.html in ${options.root}.\nBuild the demo first: npm run demo:build`);
    process.exitCode = 1;
    return;
  }

  const server = createServer((request, response) => {
    void handle(options, request, response).catch(() => {
      sendText(response, 500, 'Internal error.');
    });
  });

  server.listen(options.port, options.host, () => {
    console.log(`Serving ${options.root}\n`);
    console.log(`  local:    http://localhost:${options.port}`);
    for (const url of networkUrls(options.port)) {
      console.log(`  network:  ${url}`);
    }
    console.log('\nAnyone on this network can reach it. Ctrl+C to stop.');
  });

  server.on('error', (error: Error) => {
    console.error(`Could not start the server: ${error.message}`);
    process.exitCode = 1;
  });
}

/** Only boot the server when this file is the entry point, so tests can import it. */
const entryPoint = process.argv[1];
if (entryPoint !== undefined && resolve(entryPoint) === fileURLToPath(import.meta.url)) {
  await main();
}
