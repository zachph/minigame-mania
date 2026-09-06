/**
 * Bundles the game into one self-contained HTML file that runs from anywhere -
 * a double-clicked file, a static host, or a published page. No dependencies:
 * the modules form a small acyclic graph, so inlining them in dependency order
 * and dropping the import/export keywords is enough.
 *
 *   node tools/build-single-file.mjs [outfile] [--fragment]
 *
 * --fragment omits the <!doctype>/<html>/<head>/<body> wrapper, for hosts that
 * supply their own document shell.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Dependency order: every module appears after everything it imports.
const MODULES = [
  'src/core/utils.js',
  'src/core/storage.js',
  'src/core/input.js',
  'src/core/registry.js',
  'src/core/shell.js',
  'src/games/catchmon/types.js',
  'src/games/catchmon/moves.js',
  'src/games/catchmon/roster.js',
  'src/games/catchmon/battle.js',
  'src/games/catchmon/ai.js',
  'src/games/catchmon/art.js',
  'src/games/catchmon/scene.js',
  'src/games/catchmon/ui.js',
  'src/games/catchmon/game.js',
  'src/games/catchmon/index.js',
  'src/main.js',
];

/** Strips module syntax so the file can be concatenated into one scope. */
function stripModuleSyntax(source, path) {
  let code = source
    .replace(/^import\s+\{[\s\S]*?\}\s+from\s+['"][^'"]+['"];\s*$/gm, '')
    .replace(/^import\s+['"][^'"]+['"];\s*$/gm, '')
    .replace(/^import\s+\w+\s+from\s+['"][^'"]+['"];\s*$/gm, '')
    .replace(/^export\s+\{[^}]*\};\s*$/gm, '')
    .replace(/^export\s+(const|let|function|class|async)\b/gm, '$1');
  if (/^\s*(import|export)\b/m.test(code)) {
    throw new Error(`${path}: module syntax survived the strip - check the bundler`);
  }
  return `// ---- ${path} ${'-'.repeat(Math.max(0, 62 - path.length))}\n${code.trim()}\n`;
}

async function build() {
  const [, , outArg, ...flags] = process.argv;
  const fragment = flags.includes('--fragment');
  const out = resolve(root, outArg && !outArg.startsWith('--') ? outArg : 'dist/catchmon.html');

  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  const css = await readFile(resolve(root, 'src/styles.css'), 'utf8');
  const bodyMatch = html.match(/<body>([\s\S]*?)<script/);
  if (!bodyMatch) throw new Error('Could not find the page markup in index.html');
  const markup = bodyMatch[1].trim();

  const modules = [];
  for (const path of MODULES) {
    modules.push(stripModuleSyntax(await readFile(resolve(root, path), 'utf8'), path));
  }

  const inner = `<title>Catchmon</title>
<style>
${css.trim()}
</style>

${markup}

<script type="module">
${modules.join('\n')}
</script>
`;

  const page = fragment
    ? inner
    : `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
${inner.slice(0, inner.indexOf('</style>') + 9)}</head>
<body>
${inner.slice(inner.indexOf('</style>') + 9).trim()}
</body>
</html>
`;

  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, page, 'utf8');
  const kb = (Buffer.byteLength(page) / 1024).toFixed(1);
  console.log(`${out} (${kb} kB, ${MODULES.length} modules${fragment ? ', fragment' : ''})`);
}

await build();
