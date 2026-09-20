import { createServer } from 'node:http';
import { Store, normaliseName } from './store.js';

/**
 * The Minigame Mania friends server.
 *
 * Node builtins only - no framework, no database, no build step, in keeping
 * with the rest of the project. It does four things: hands out names, keeps
 * friend lists, passes challenges between friends, and relays the handful of
 * messages two people need to play a match against each other.
 *
 * Push goes out over Server-Sent Events rather than WebSocket. A browser has
 * EventSource built in, it survives proxies that mangle upgrades, and it needs
 * no dependency. The client posts actions and reads the stream.
 */

const JSON_TYPE = { 'content-type': 'application/json; charset=utf-8' };

/** Permissive by design: the site is on one origin and this server on another,
 *  and every call is authorised by a bearer token rather than a cookie, so
 *  there is no cross-site request to forge. */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-max-age': '86400',
};

const MAX_BODY = 8 * 1024;

/* --------------------------------------------------------------- limiting */

/**
 * A token bucket per address. Enough to stop a loop hammering the thing;
 * not pretending to be protection against someone determined.
 */
class RateLimiter {
  constructor({ capacity = 40, refillPerSecond = 4, clock = Date.now } = {}) {
    this.capacity = capacity;
    this.refill = refillPerSecond;
    this.clock = clock;
    this.buckets = new Map();
  }

  take(key, cost = 1) {
    const now = this.clock();
    const bucket = this.buckets.get(key) || { tokens: this.capacity, at: now };
    bucket.tokens = Math.min(this.capacity, bucket.tokens + ((now - bucket.at) / 1000) * this.refill);
    bucket.at = now;
    if (bucket.tokens < cost) {
      this.buckets.set(key, bucket);
      return false;
    }
    bucket.tokens -= cost;
    this.buckets.set(key, bucket);
    return true;
  }
}

/* ----------------------------------------------------------------- server */

export function createApp({ file = null, clock = Date.now, limiter = new RateLimiter({ clock }) } = {}) {
  const store = new Store({ file, clock });
  /** playerId -> Set of open SSE responses. Someone is online if they have one. */
  const streams = new Map();

  const isOnline = (id) => streams.has(id) && streams.get(id).size > 0;

  function publicPlayer(player) {
    if (!player) return null;
    return { id: player.id, name: player.name, online: isOnline(player.id), wins: player.wins, losses: player.losses };
  }

  /** Pushes one event to every screen a player has open. */
  function push(playerId, type, payload) {
    const open = streams.get(playerId);
    if (!open) return;
    const frame = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of open) {
      try {
        res.write(frame);
      } catch {
        open.delete(res);
      }
    }
  }

  /** Tells a player's friends that they came online or went away. */
  function announcePresence(playerId) {
    const { friends } = store.friendsOf(playerId);
    const player = store.getPlayer(playerId);
    for (const friendId of friends) push(friendId, 'presence', publicPlayer(player));
  }

  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { ...JSON_TYPE, ...CORS, ...headers });
    res.end(JSON.stringify(body));
  };
  const fail = (res, status, error) => send(res, status, { error });

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY) {
          reject(new Error('too-large'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (chunks.length === 0) return resolve({});
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new Error('bad-json'));
        }
      });
      req.on('error', reject);
    });
  }

  const bearer = (req, url) => {
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) return header.slice(7).trim();
    // EventSource cannot set headers, so the stream passes its token in the query.
    return url.searchParams.get('token') || '';
  };

  /** Everything a client needs to draw the friends screen in one call. */
  function roster(playerId) {
    const { friends, incoming, outgoing } = store.friendsOf(playerId);
    const challenges = store.challengesFor(playerId);
    const nameOf = (id) => publicPlayer(store.getPlayer(id));
    return {
      friends: friends.map(nameOf).filter(Boolean).sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name)),
      incoming: incoming.map(nameOf).filter(Boolean),
      outgoing: outgoing.map(nameOf).filter(Boolean),
      challenges: {
        incoming: challenges.incoming.map((c) => ({ ...c, fromPlayer: nameOf(c.from) })),
        outgoing: challenges.outgoing.map((c) => ({ ...c, toPlayer: nameOf(c.to) })),
      },
    };
  }

  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const address = req.socket.remoteAddress || 'unknown';

    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      res.end();
      return;
    }

    if (path === '/' || path === '/health') {
      send(res, 200, { ok: true, players: Object.keys(store.data.players).length, online: [...streams.keys()].filter(isOnline).length });
      return;
    }

    if (!path.startsWith('/api/')) return fail(res, 404, 'not-found');
    if (req.method !== 'GET' && !limiter.take(address)) return fail(res, 429, 'slow-down');

    /* ---- claiming a name is the only call that needs no token ---- */
    if (path === '/api/signup' && req.method === 'POST') {
      let body;
      try {
        body = await readBody(req);
      } catch (error) {
        return fail(res, 400, error.message);
      }
      if (!normaliseName(body.name)) return fail(res, 400, 'bad-name');
      const made = store.createPlayer(body.name);
      if (made.error) return fail(res, 409, made.error);
      store.save();
      return send(res, 201, { player: publicPlayer(made.player), token: made.token });
    }

    const me = store.authenticate(bearer(req, url));
    if (!me) return fail(res, 401, 'no-name-yet');
    store.seen(me.id);

    /* ---- the live stream ---- */
    if (path === '/api/stream' && req.method === 'GET') {
      res.writeHead(200, {
        ...CORS,
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      res.write(`retry: 3000\n\n`);
      res.write(`event: ready\ndata: ${JSON.stringify(roster(me.id))}\n\n`);

      if (!streams.has(me.id)) streams.set(me.id, new Set());
      const wasOffline = streams.get(me.id).size === 0;
      streams.get(me.id).add(res);
      if (wasOffline) announcePresence(me.id);

      // Proxies drop a connection that says nothing for a while. The timer is
      // unref'd so a forgotten stream can never hold the process open.
      const beat = setInterval(() => {
        try {
          res.write(': beat\n\n');
        } catch {
          clearInterval(beat);
        }
      }, 25000);
      beat.unref?.();

      const close = () => {
        clearInterval(beat);
        const open = streams.get(me.id);
        if (!open) return;
        open.delete(res);
        if (open.size === 0) {
          streams.delete(me.id);
          announcePresence(me.id);
        }
      };
      req.on('close', close);
      res.on('close', close);
      res.on('error', close);
      return undefined;
    }

    if (path === '/api/me' && req.method === 'GET') return send(res, 200, { player: publicPlayer(me), ...roster(me.id) });

    if (path === '/api/players' && req.method === 'GET') {
      const found = store.searchPlayers(url.searchParams.get('q'), me.id).map(publicPlayer);
      return send(res, 200, { players: found });
    }

    let body = {};
    if (req.method !== 'GET') {
      try {
        body = await readBody(req);
      } catch (error) {
        return fail(res, 400, error.message);
      }
    }

    /* ---- friends ---- */
    if (path === '/api/friends/request' && req.method === 'POST') {
      const target = body.name ? store.findByName(String(body.name).trim()) : store.getPlayer(body.id);
      if (!target) return fail(res, 404, 'no-such-player');
      const asked = store.requestFriend(me.id, target.id);
      if (asked.error) return fail(res, 409, asked.error);
      store.save();
      push(target.id, asked.accepted ? 'friend-accepted' : 'friend-request', publicPlayer(me));
      if (asked.accepted) push(me.id, 'friend-accepted', publicPlayer(target));
      return send(res, 200, { ...roster(me.id), accepted: asked.accepted });
    }

    if (path === '/api/friends/respond' && req.method === 'POST') {
      const answered = store.respondToFriend(me.id, String(body.id || ''), Boolean(body.accept));
      if (answered.error) return fail(res, 404, answered.error);
      store.save();
      if (body.accept) push(String(body.id), 'friend-accepted', publicPlayer(me));
      return send(res, 200, roster(me.id));
    }

    if (path === '/api/friends/remove' && req.method === 'POST') {
      const removed = store.removeFriend(me.id, String(body.id || ''));
      if (removed.error) return fail(res, 404, removed.error);
      store.save();
      push(String(body.id), 'friend-removed', publicPlayer(me));
      return send(res, 200, roster(me.id));
    }

    /* ---- challenges ---- */
    if (path === '/api/challenges' && req.method === 'POST') {
      const made = store.createChallenge(me.id, String(body.id || ''), String(body.gameId || ''));
      if (made.error) return fail(res, 409, made.error);
      store.save();
      push(made.challenge.to, 'challenge', { ...made.challenge, fromPlayer: publicPlayer(me) });
      return send(res, 200, { challenge: made.challenge });
    }

    if (path === '/api/challenges/respond' && req.method === 'POST') {
      const answered = store.answerChallenge(me.id, String(body.id || ''), Boolean(body.accept));
      if (answered.error) return fail(res, 404, answered.error);
      store.save();
      const { challenge, match } = answered;
      const other = store.getPlayer(challenge.from);
      if (!match) {
        push(challenge.from, 'challenge-declined', { ...challenge, byPlayer: publicPlayer(me) });
        return send(res, 200, { challenge });
      }
      const view = (forId) => ({
        match: { id: match.id, gameId: match.gameId, seed: match.seed, players: match.players },
        opponent: publicPlayer(store.getPlayer(match.players.find((id) => id !== forId))),
      });
      push(challenge.from, 'match-start', view(challenge.from));
      return send(res, 200, view(me.id));
    }

    if (path === '/api/challenges/cancel' && req.method === 'POST') {
      const cancelled = store.cancelChallenge(me.id, String(body.id || ''));
      if (cancelled.error) return fail(res, 404, cancelled.error);
      store.save();
      push(cancelled.challenge.to, 'challenge-cancelled', cancelled.challenge);
      return send(res, 200, { challenge: cancelled.challenge });
    }

    /* ---- in-match relay ---- */
    if (path === '/api/match/send' && req.method === 'POST') {
      const match = store.getMatch(String(body.matchId || ''));
      if (!match || !match.players.includes(me.id)) return fail(res, 404, 'no-such-match');
      if (match.state !== 'live') return fail(res, 409, 'match-over');
      match.eventCount += 1;
      const other = match.players.find((id) => id !== me.id);
      push(other, 'match-event', { matchId: match.id, from: me.id, event: body.event ?? null });
      return send(res, 200, { ok: true });
    }

    if (path === '/api/match/finish' && req.method === 'POST') {
      const done = store.reportResult(String(body.matchId || ''), me.id, body.result || {});
      if (done.error) return fail(res, 404, done.error);
      store.save();
      const match = done.match;
      const other = match.players.find((id) => id !== me.id);
      push(other, 'match-result', { matchId: match.id, from: me.id, result: match.results[me.id], state: match.state, winner: match.winner || null });
      return send(res, 200, { match: { id: match.id, state: match.state, results: match.results, winner: match.winner || null } });
    }

    if (path === '/api/match/quit' && req.method === 'POST') {
      const done = store.abandonMatch(String(body.matchId || ''), me.id);
      if (done.error) return fail(res, 404, done.error);
      store.save();
      const other = done.match.players.find((id) => id !== me.id);
      push(other, 'match-abandoned', { matchId: done.match.id, by: publicPlayer(me), winner: done.match.winner });
      return send(res, 200, { ok: true });
    }

    return fail(res, 404, 'not-found');
  };

  const server = createServer((req, res) => {
    handler(req, res).catch(() => {
      if (!res.headersSent) fail(res, 500, 'server-error');
      else res.end();
    });
  });

  return { server, store, streams, isOnline, roster };
}

export { RateLimiter };

/* Started directly rather than imported by a test. */
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  const port = Number(process.env.PORT) || 8787;
  const file = process.env.DATA_FILE || new URL('./data/players.json', import.meta.url).pathname;
  const app = createApp({ file });
  app.server.listen(port, () => {
    console.log(`Minigame Mania friends server listening on :${port} (state in ${file})`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      app.store.save();
      app.server.close(() => process.exit(0));
    });
  }
}
