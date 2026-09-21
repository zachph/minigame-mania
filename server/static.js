import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

/**
 * Serves the game itself, so one running copy is the whole thing: open its
 * address and you get the site, the friends list and the matches from the same
 * place. No second host to configure, no cross-origin calls, and no page on
 * https trying to reach a server on http.
 */

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * The only things a browser needs to run the game. Serving the repo root
 * instead would put the server's own data file - the one with the token
 * hashes in it - one URL away, so the list is explicit rather than a matter
 * of which extensions happen to be allowed.
 */
export const PUBLIC_PATHS = ['index.html', 'src', 'dist'];

/** True if `full` is one of the public files, or inside one of the public folders. */
export function isPublic(root, full) {
  const base = resolve(root);
  return PUBLIC_PATHS.some((entry) => {
    const allowed = resolve(base, entry);
    return full === allowed || full.startsWith(allowed + sep);
  });
}

/**
 * Resolves a request path inside `root`, or null if it points anywhere else.
 * Decoding first and normalising after is what stops `..%2f` walking out.
 */
export function resolveInRoot(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const relative = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '');
  const full = resolve(root, `.${sep}${relative}`);
  const base = resolve(root);
  if (full !== base && !full.startsWith(base + sep)) return null;
  return full;
}

/** Tries to answer `req` from disk. Returns false if there is nothing to send. */
export async function serveStatic(root, req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;

  const path = new URL(req.url, 'http://localhost').pathname;
  let target = resolveInRoot(root, path === '/' ? '/index.html' : path);
  if (!target || !isPublic(root, target)) return false;

  let info = await stat(target).catch(() => null);
  if (info?.isDirectory()) {
    target = join(target, 'index.html');
    if (!isPublic(root, target)) return false;
    info = await stat(target).catch(() => null);
  }
  if (!info?.isFile()) return false;

  const type = TYPES[extname(target).toLowerCase()];
  if (!type) return false;   // only the handful of kinds a web page is made of

  res.writeHead(200, {
    'content-type': type,
    'content-length': info.size,
    // The page is edited constantly while this is in use; never cache the HTML.
    'cache-control': extname(target) === '.html' ? 'no-cache' : 'public, max-age=300',
  });
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  createReadStream(target).pipe(res);
  return true;
}
