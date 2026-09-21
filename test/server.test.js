import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { createApp } from '../server/server.js';
import { Store, normaliseName } from '../server/store.js';
import { isPublic, resolveInRoot } from '../server/static.js';

/* --------------------------------------------------------------- helpers */

/**
 * Boots the app on a free port and hands back a little client for it.
 *
 * The client speaks node:http rather than fetch on purpose: fetch keeps its
 * sockets in a pool that outlives the test, and the run then hangs waiting for
 * handles nobody is using. With `agent: false` every call gets its own socket
 * and closes it.
 */
async function boot() {
  const app = createApp();
  app.server.listen(0);
  await once(app.server, 'listening');
  const port = app.server.address().port;
  const sockets = new Set();

  const call = (method, path, { token, body } = {}) => new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = httpRequest({
      host: '127.0.0.1', port, path, method, agent: false,
      headers: {
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });

  const signup = async (name) => (await call('POST', '/api/signup', { body: { name } })).body;

  /** Like `call`, but for things that are not JSON - the game's own files. */
  const raw = (method, path) => new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, method, agent: false }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on('error', reject);
    req.end();
  });

  /** Opens a player's event stream and lets a test wait for a named event. */
  const listen = (token) => {
    const seen = [];
    const waiters = [];
    let buffer = '';

    const req = httpRequest({
      host: '127.0.0.1', port, path: `/api/stream?token=${encodeURIComponent(token)}`,
      method: 'GET', agent: false,
    });
    sockets.add(req);

    const ready = new Promise((resolve, reject) => {
      req.on('response', (res) => {
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          buffer += chunk;
          let split;
          while ((split = buffer.indexOf('\n\n')) !== -1) {
            const frame = buffer.slice(0, split);
            buffer = buffer.slice(split + 2);
            const type = /^event: (.+)$/m.exec(frame)?.[1];
            const data = /^data: (.*)$/m.exec(frame)?.[1];
            if (!type) continue;
            const entry = { type, data: data ? JSON.parse(data) : null };
            seen.push(entry);
            for (const [index, waiter] of [...waiters.entries()].reverse()) {
              if (waiter.type !== type) continue;
              waiters.splice(index, 1);
              waiter.resolve(entry);
            }
          }
        });
        resolve(res);
      });
      req.on('error', reject);
      req.end();
    });

    return {
      ready,
      seen,
      waitFor(type, ms = 2000) {
        const found = seen.find((entry) => entry.type === type);
        if (found) return Promise.resolve(found);
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`no "${type}" event arrived`)), ms);
          waiters.push({ type, resolve: (entry) => { clearTimeout(timer); resolve(entry); } });
        });
      },
      close: () => req.destroy(),
    };
  };

  return {
    call,
    raw,
    signup,
    listen,
    /** Every stream has to be let go before the server can shut down. */
    close: async () => {
      for (const req of sockets) req.destroy();
      app.server.closeAllConnections();
      await new Promise((resolve) => app.server.close(resolve));
    },
    app,
  };
}

/* ----------------------------------------------------------------- names */

test('a name has to look like a name', () => {
  assert.equal(normaliseName('Zach'), 'Zach');
  assert.equal(normaliseName('  Zach  Ph '), 'Zach Ph', 'trimmed and single-spaced');
  assert.equal(normaliseName('ab'), null, 'too short');
  assert.equal(normaliseName('a'.repeat(17)), null, 'too long');
  assert.equal(normaliseName('<script>'), null, 'no markup');
  assert.equal(normaliseName('drop\u0000table'), null, 'no control characters');
  assert.equal(normaliseName('admin'), null, 'nor anything that could pass for staff');
});

test('the store keeps a hash, never the token itself', () => {
  const store = new Store();
  const { player, token } = store.createPlayer('Zach');
  assert.ok(token.length > 20);
  assert.notEqual(player.tokenHash, token);
  assert.equal(JSON.stringify(store.data).includes(token), false, 'the token is nowhere in the file');
  assert.equal(store.authenticate(token).id, player.id);
  assert.equal(store.authenticate('not-the-token-at-all'), null);
});

test('two people cannot hold the same name', () => {
  const store = new Store();
  assert.ok(store.createPlayer('Zach').player);
  assert.equal(store.createPlayer('zach').error, 'name-taken', 'case does not make it a different name');
  assert.equal(store.createPlayer('ZACH  ').error, 'name-taken');
});

/* ------------------------------------------------- serving the game too */

test('a path can never climb out of the site folder', () => {
  const root = '/srv/game';
  assert.equal(resolveInRoot(root, '/index.html'), '/srv/game/index.html');
  assert.equal(resolveInRoot(root, '/src/core/shell.js'), '/srv/game/src/core/shell.js');
  assert.equal(resolveInRoot(root, '/'), '/srv/game');

  for (const attempt of [
    '/../../etc/passwd',
    '/..%2f..%2fetc%2fpasswd',
    '/src/../../../etc/passwd',
    '/%2e%2e/%2e%2e/etc/shadow',
    '/\u0000secret',
  ]) {
    const resolved = resolveInRoot(root, attempt);
    assert.ok(resolved === null || resolved.startsWith('/srv/game'), `"${attempt}" stayed inside (got ${resolved})`);
  }

  // Staying inside the folder is not enough on its own.
  assert.equal(isPublic(root, '/srv/game/src/main.js'), true);
  assert.equal(isPublic(root, '/srv/game/index.html'), true);
  assert.equal(isPublic(root, '/srv/game/dist/minigame-mania.html'), true);
  assert.equal(isPublic(root, '/srv/game/server/data/players.json'), false, 'never the token file');
  assert.equal(isPublic(root, '/srv/game/package.json'), false);
  assert.equal(isPublic(root, '/srv/game/srcevil/x.js'), false, 'a prefix is not a folder');
});

test('the server hands out the game as well as the API', async (t) => {
  const api = await boot();
  t.after(api.close);

  const page = await api.raw('GET', '/');
  assert.equal(page.status, 200);
  assert.match(page.headers['content-type'], /text\/html/);
  assert.match(page.text, /Minigame/, 'that is the game page');

  const script = await api.raw('GET', '/src/main.js');
  assert.equal(script.status, 200);
  assert.match(script.headers['content-type'], /javascript/);

  // Still an API underneath.
  assert.equal((await api.call('GET', '/health')).status, 200);

  // Only what the page is made of. Everything else in the repo stays private -
  // above all the server's own data file, which holds the token hashes.
  for (const attempt of [
    '/server/data/players.json',
    '/server/store.js',
    '/package.json',
    '/%2e%2e/package.json',
    '/../../etc/passwd',
    '/README.md',
    '/test/server.test.js',
  ]) {
    const sneaky = await api.raw('GET', attempt);
    assert.notEqual(sneaky.status, 200, `${attempt} is not served`);
  }
});

/* ------------------------------------------------------------ the server */

test('signing up hands back a name and a token, and nothing works without one', async (t) => {
  const api = await boot();
  t.after(api.close);

  const made = await api.call('POST', '/api/signup', { body: { name: 'Zach' } });
  assert.equal(made.status, 201);
  assert.equal(made.body.player.name, 'Zach');
  assert.ok(made.body.token);

  assert.equal((await api.call('GET', '/api/me')).status, 401, 'no token, no answer');
  assert.equal((await api.call('GET', '/api/me', { token: 'made-up-token-value' })).status, 401);

  const me = await api.call('GET', '/api/me', { token: made.body.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.player.name, 'Zach');
  assert.deepEqual(me.body.friends, []);

  const clash = await api.call('POST', '/api/signup', { body: { name: 'ZACH' } });
  assert.equal(clash.status, 409);
  assert.equal((await api.call('POST', '/api/signup', { body: { name: '<b>' } })).status, 400);
});

test('you find someone by name, ask, and they say yes', async (t) => {
  const api = await boot();
  t.after(api.close);
  const zach = await api.signup('Zach');
  const pal = await api.signup('Pal');

  const found = await api.call('GET', '/api/players?q=pa', { token: zach.token });
  assert.equal(found.body.players.length, 1);
  assert.equal(found.body.players[0].name, 'Pal');

  const stream = api.listen(pal.token);
  await stream.ready;

  const asked = await api.call('POST', '/api/friends/request', { token: zach.token, body: { name: 'Pal' } });
  assert.equal(asked.status, 200);
  assert.equal(asked.body.outgoing[0].name, 'Pal');

  const pushed = await stream.waitFor('friend-request');
  assert.equal(pushed.data.name, 'Zach', 'it reached Pal without Pal asking for it');

  const said = await api.call('POST', '/api/friends/respond', { token: pal.token, body: { id: zach.player.id, accept: true } });
  assert.equal(said.body.friends[0].name, 'Zach');

  const back = await api.call('GET', '/api/me', { token: zach.token });
  assert.equal(back.body.friends[0].name, 'Pal');
  assert.equal(back.body.outgoing.length, 0);
});

test('asking back someone who asked you is the same as saying yes', async (t) => {
  const api = await boot();
  t.after(api.close);
  const a = await api.signup('Zach');
  const b = await api.signup('Pal');
  await api.call('POST', '/api/friends/request', { token: a.token, body: { name: 'Pal' } });
  const mutual = await api.call('POST', '/api/friends/request', { token: b.token, body: { name: 'Zach' } });
  assert.equal(mutual.body.accepted, true);
  assert.equal(mutual.body.friends[0].name, 'Zach');
});

test('a challenge only goes to a friend, and accepting opens a match on both screens', async (t) => {
  const api = await boot();
  t.after(api.close);
  const a = await api.signup('Zach');
  const b = await api.signup('Pal');

  const tooSoon = await api.call('POST', '/api/challenges', { token: a.token, body: { id: b.player.id, gameId: 'defensele' } });
  assert.equal(tooSoon.status, 409);
  assert.equal(tooSoon.body.error, 'not-friends');

  await api.call('POST', '/api/friends/request', { token: a.token, body: { name: 'Pal' } });
  await api.call('POST', '/api/friends/respond', { token: b.token, body: { id: a.player.id, accept: true } });

  const streamA = api.listen(a.token);
  const streamB = api.listen(b.token);
  await Promise.all([streamA.ready, streamB.ready]);

  const sent = await api.call('POST', '/api/challenges', { token: a.token, body: { id: b.player.id, gameId: 'defensele' } });
  assert.equal(sent.status, 200);

  const got = await streamB.waitFor('challenge');
  assert.equal(got.data.fromPlayer.name, 'Zach');
  assert.equal(got.data.gameId, 'defensele');

  const accepted = await api.call('POST', '/api/challenges/respond', { token: b.token, body: { id: got.data.id, accept: true } });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.opponent.name, 'Zach');
  assert.equal(typeof accepted.body.match.seed, 'number', 'both sides get the same seed');

  const startedForA = await streamA.waitFor('match-start');
  assert.equal(startedForA.data.match.id, accepted.body.match.id);
  assert.equal(startedForA.data.match.seed, accepted.body.match.seed);
  assert.equal(startedForA.data.opponent.name, 'Pal');
});

test('what one side sends in a match comes out on the other', async (t) => {
  const api = await boot();
  t.after(api.close);
  const a = await api.signup('Zach');
  const b = await api.signup('Pal');
  await api.call('POST', '/api/friends/request', { token: a.token, body: { name: 'Pal' } });
  await api.call('POST', '/api/friends/respond', { token: b.token, body: { id: a.player.id, accept: true } });

  const streamA = api.listen(a.token);
  const streamB = api.listen(b.token);
  await Promise.all([streamA.ready, streamB.ready]);

  const sent = await api.call('POST', '/api/challenges', { token: a.token, body: { id: b.player.id, gameId: 'defensele' } });
  const accepted = await api.call('POST', '/api/challenges/respond', { token: b.token, body: { id: sent.body.challenge.id, accept: true } });
  const matchId = accepted.body.match.id;
  await streamA.waitFor('match-start');

  await api.call('POST', '/api/match/send', { token: a.token, body: { matchId, event: { kind: 'send', enemy: 'brute' } } });
  const relayed = await streamB.waitFor('match-event');
  assert.equal(relayed.data.event.enemy, 'brute');
  assert.equal(relayed.data.from, a.player.id);

  // A stranger cannot push anything into someone else's match.
  const nosy = await api.signup('Nosy');
  const blocked = await api.call('POST', '/api/match/send', { token: nosy.token, body: { matchId, event: { kind: 'send', enemy: 'colossus' } } });
  assert.equal(blocked.status, 404);
});

test('the match ends when both report, and most lives left takes it', async (t) => {
  const api = await boot();
  t.after(api.close);
  const a = await api.signup('Zach');
  const b = await api.signup('Pal');
  await api.call('POST', '/api/friends/request', { token: a.token, body: { name: 'Pal' } });
  await api.call('POST', '/api/friends/respond', { token: b.token, body: { id: a.player.id, accept: true } });
  const sent = await api.call('POST', '/api/challenges', { token: a.token, body: { id: b.player.id, gameId: 'defensele' } });
  const accepted = await api.call('POST', '/api/challenges/respond', { token: b.token, body: { id: sent.body.challenge.id, accept: true } });
  const matchId = accepted.body.match.id;

  const half = await api.call('POST', '/api/match/finish', { token: a.token, body: { matchId, result: { lives: 12, score: 400 } } });
  assert.equal(half.body.match.state, 'live', 'still waiting on the other side');

  const full = await api.call('POST', '/api/match/finish', { token: b.token, body: { matchId, result: { lives: 3, score: 9000 } } });
  assert.equal(full.body.match.state, 'over');
  assert.equal(full.body.match.winner, a.player.id, 'lives beat score');

  const record = await api.call('GET', '/api/me', { token: a.token });
  assert.equal(record.body.player.wins, 1);
});

test('walking out hands the match to the other side', async (t) => {
  const api = await boot();
  t.after(api.close);
  const a = await api.signup('Zach');
  const b = await api.signup('Pal');
  await api.call('POST', '/api/friends/request', { token: a.token, body: { name: 'Pal' } });
  await api.call('POST', '/api/friends/respond', { token: b.token, body: { id: a.player.id, accept: true } });
  const sent = await api.call('POST', '/api/challenges', { token: a.token, body: { id: b.player.id, gameId: 'defensele' } });
  const accepted = await api.call('POST', '/api/challenges/respond', { token: b.token, body: { id: sent.body.challenge.id, accept: true } });

  const streamB = api.listen(b.token);
  await streamB.ready;

  await api.call('POST', '/api/match/quit', { token: a.token, body: { matchId: accepted.body.match.id } });
  const told = await streamB.waitFor('match-abandoned');
  assert.equal(told.data.by.name, 'Zach');
  assert.equal(told.data.winner, b.player.id);
});

test('friends see each other come online', async (t) => {
  const api = await boot();
  t.after(api.close);
  const a = await api.signup('Zach');
  const b = await api.signup('Pal');
  await api.call('POST', '/api/friends/request', { token: a.token, body: { name: 'Pal' } });
  await api.call('POST', '/api/friends/respond', { token: b.token, body: { id: a.player.id, accept: true } });

  const streamA = api.listen(a.token);
  await streamA.ready;

  const before = await api.call('GET', '/api/me', { token: a.token });
  assert.equal(before.body.friends[0].online, false);

  const streamB = api.listen(b.token);
  await streamB.ready;

  const presence = await streamA.waitFor('presence');
  assert.equal(presence.data.name, 'Pal');
  assert.equal(presence.data.online, true);
});
