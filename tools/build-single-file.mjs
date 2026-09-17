/**
 * Bundles the app into one self-contained HTML file that runs from anywhere -
 * a double-clicked file, a static host, or a published page.
 *
 *   node tools/build-single-file.mjs [outfile] [--fragment]
 *
 * --fragment omits the <!doctype>/<html>/<head>/<body> wrapper, for hosts that
 * supply their own document shell.
 *
 * Each module keeps its own scope: modules are emitted as IIFEs that return
 * their exports into a registry, and imports become destructuring from it. That
 * matters because separate games legitimately use the same local names.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = 'src/main.js';

const IMPORT_RE = /^import\s+(?:([\w$]+)\s*,\s*)?(?:\{([\s\S]*?)\}\s+)?(?:from\s+)?['"]([^'"]+)['"];?[ \t]*$/gm;
const EXPORT_DECL_RE = /^export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([\w$]+)/gm;
const EXPORT_LIST_RE = /^export\s*\{([^}]*)\};?[ \t]*$/gm;

function parseModule(path, source) {
  const imports = [];
  const body = source.replace(IMPORT_RE, (match, defaultName, named, specifier) => {
    if (defaultName) throw new Error(`${path}: default imports are not supported (${match.trim()})`);
    imports.push({
      specifier,
      bindings: (named || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
          const [name, alias] = entry.split(/\s+as\s+/).map((part) => part.trim());
          return { name, alias: alias || name };
        }),
    });
    return '';
  });

  if (/^\s*export\s+default/m.test(body)) throw new Error(`${path}: default exports are not supported`);

  const exports = new Set();
  for (const match of body.matchAll(EXPORT_DECL_RE)) exports.add(match[1]);
  for (const match of body.matchAll(EXPORT_LIST_RE)) {
    for (const entry of match[1].split(',').map((part) => part.trim()).filter(Boolean)) {
      const [name, alias] = entry.split(/\s+as\s+/).map((part) => part.trim());
      exports.add(alias || name);
    }
  }

  const code = body
    .replace(EXPORT_LIST_RE, '')
    .replace(/^export\s+(?=(?:async\s+)?(?:const|let|var|function|class)\s)/gm, '');

  if (/^\s*(import|export)\b/m.test(code)) {
    throw new Error(`${path}: module syntax survived the rewrite - check the bundler`);
  }
  return { imports, exports: [...exports], code: code.trim() };
}

/** Depth-first walk from the entry point, so dependencies are emitted first. */
async function collect(entry) {
  const modules = new Map();
  const visiting = new Set();

  async function visit(path) {
    if (modules.has(path)) return;
    if (visiting.has(path)) throw new Error(`Import cycle through ${path}`);
    visiting.add(path);

    const source = await readFile(resolve(root, path), 'utf8');
    const parsed = parseModule(path, source);
    const resolved = parsed.imports.map((entryImport) => ({
      ...entryImport,
      path: relative(root, resolve(root, dirname(path), entryImport.specifier)).split('\\').join('/'),
    }));
    for (const dependency of resolved) await visit(dependency.path);

    visiting.delete(path);
    modules.set(path, { ...parsed, imports: resolved });
  }

  await visit(entry);
  return modules;
}

function emit(modules) {
  const chunks = ['const __modules = {};'];
  for (const [path, module] of modules) {
    const bindings = module.imports
      .filter((entry) => entry.bindings.length > 0)
      .map((entry) => {
        const list = entry.bindings
          .map(({ name, alias }) => (name === alias ? name : `${name}: ${alias}`))
          .join(', ');
        return `  const { ${list} } = __modules[${JSON.stringify(entry.path)}];`;
      })
      .join('\n');

    chunks.push(
      `// ---- ${path} ${'-'.repeat(Math.max(0, 60 - path.length))}\n` +
      `__modules[${JSON.stringify(path)}] = (function () {\n` +
      (bindings ? `${bindings}\n\n` : '') +
      `${module.code}\n\n` +
      `  return { ${module.exports.join(', ')} };\n` +
      `})();`
    );
  }
  return chunks.join('\n\n');
}

async function build() {
  const [, , outArg, ...flags] = process.argv;
  const fragment = flags.includes('--fragment');
  const out = resolve(root, outArg && !outArg.startsWith('--') ? outArg : 'dist/minigame-mania.html');

  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  const css = await readFile(resolve(root, 'src/styles.css'), 'utf8');
  const markup = html.match(/<body>([\s\S]*?)<script/)?.[1]?.trim();
  if (!markup) throw new Error('Could not find the page markup in index.html');

  const modules = await collect(ENTRY);
  const script = emit(modules);

  const head = `<title>Minigame Mania</title>\n<style>\n${css.trim()}\n</style>`;
  const bodyContent = `${markup}\n\n<script type="module">\n${script}\n</script>`;

  const page = fragment
    ? `${head}\n\n${bodyContent}\n`
    : `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
${head}
</head>
<body>
${bodyContent}
</body>
</html>
`;

  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, page, 'utf8');
  console.log(`${out} (${(Buffer.byteLength(page) / 1024).toFixed(1)} kB, ${modules.size} modules${fragment ? ', fragment' : ''})`);
}

await build();
