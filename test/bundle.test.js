import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { glob } from 'node:fs/promises';

const run = promisify(execFile);
const OUT = join(tmpdir(), `mm-bundle-test-${process.pid}.html`);

/**
 * The single-file build is what gets published, and nothing else exercises it:
 * a module that bundles wrongly still passes every other test in here, because
 * every other test imports the source directly.
 */
let bundle;
test.before(async () => {
  await run('node', ['tools/build-single-file.mjs', OUT], { cwd: process.cwd() });
  bundle = await readFile(OUT, 'utf8');
});
test.after(() => rm(OUT, { force: true }));

test('every namespace import survives into the bundle', async () => {
  const sources = [];
  for await (const path of glob('src/**/*.js')) sources.push(path);
  assert.ok(sources.length > 10, 'found the source files');

  let checked = 0;
  for (const path of sources) {
    const text = await readFile(path, 'utf8');
    for (const match of text.matchAll(/^import\s+\*\s+as\s+([\w$]+)\s+from/gm)) {
      const name = match[1];
      assert.ok(
        bundle.includes(`const ${name} = __modules[`),
        `${path} imports * as ${name}, but the bundle never binds it`,
      );
      checked += 1;
    }
  }
  assert.ok(checked > 0, 'there is at least one namespace import to protect');
});

test('no import or export statement is left in the bundled script', () => {
  const script = bundle.slice(bundle.indexOf('<script type="module">'));
  assert.ok(!/^\s*import\s+[\w{*]/m.test(script), 'an import statement survived bundling');
  assert.ok(!/^\s*export\s/m.test(script), 'an export statement survived bundling');
});

test('every registered game ends up in the bundle', () => {
  for (const name of ['Catchmon', 'Nopoly', 'Shubat', 'Defensele', 'Strike Cards', 'Bumpers']) {
    assert.ok(bundle.includes(`'${name}'`) || bundle.includes(`"${name}"`), `${name} is missing`);
  }
});
