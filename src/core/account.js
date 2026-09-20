/**
 * Your name on this machine, and the line to the friends server.
 *
 * The server hands out one token when you claim a name, and that token is the
 * whole login - there is no password. It lives in this browser and nowhere
 * else, so claiming the same name on a second device is not possible; you
 * carry the token over or you pick another name. Simple, and nothing worth
 * stealing ever leaves the machine.
 */
import { read, write } from './storage.js';

const DEFAULT_SERVER = 'http://localhost:8787';

let listeners = new Set();
let stream = null;
let state = {
  server: read('server') || DEFAULT_SERVER,
  player: read('player') || null,      // { id, name }
  token: read('token') || null,
  roster: { friends: [], incoming: [], outgoing: [], challenges: { incoming: [], outgoing: [] } },
  connected: false,
  error: null,
};

export const getState = () => state;
export const signedIn = () => Boolean(state.token && state.player);

function update(patch) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

export function subscribe(listener) {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

/* -------------------------------------------------------------- the wire */

export function setServer(url) {
  const trimmed = String(url || '').trim().replace(/\/+$/, '');
  write('server', trimmed);
  update({ server: trimmed });
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(state.server + path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(state.token ? { authorization: `Bearer ${state.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!res.ok) throw Object.assign(new Error(parsed?.error || `http-${res.status}`), { code: parsed?.error, status: res.status });
  return parsed;
}

/** Anything the server says about friends and challenges lands here. */
function takeRoster(payload) {
  if (!payload) return;
  const { friends, incoming, outgoing, challenges } = payload;
  if (!friends && !incoming && !outgoing && !challenges) return;
  update({
    roster: {
      friends: friends || [],
      incoming: incoming || [],
      outgoing: outgoing || [],
      challenges: challenges || { incoming: [], outgoing: [] },
    },
  });
}

/* ------------------------------------------------------------- the calls */

export async function claimName(name) {
  const made = await api('/api/signup', { method: 'POST', body: { name } });
  write('player', made.player);
  write('token', made.token);
  update({ player: made.player, token: made.token, error: null });
  connect();
  return made.player;
}

export function signOut() {
  disconnect();
  write('player', null);
  write('token', null);
  update({ player: null, token: null, connected: false, roster: { friends: [], incoming: [], outgoing: [], challenges: { incoming: [], outgoing: [] } } });
}

export async function refresh() {
  if (!signedIn()) return null;
  const me = await api('/api/me');
  update({ player: me.player });
  write('player', me.player);
  takeRoster(me);
  return me;
}

export const searchPlayers = (q) => api(`/api/players?q=${encodeURIComponent(q)}`).then((r) => r.players);
export const askToBeFriends = (name) => api('/api/friends/request', { method: 'POST', body: { name } }).then((r) => (takeRoster(r), r));
export const answerFriend = (id, accept) => api('/api/friends/respond', { method: 'POST', body: { id, accept } }).then((r) => (takeRoster(r), r));
export const removeFriend = (id) => api('/api/friends/remove', { method: 'POST', body: { id } }).then((r) => (takeRoster(r), r));

export const challenge = (id, gameId) => api('/api/challenges', { method: 'POST', body: { id, gameId } });
export const answerChallenge = (id, accept) => api('/api/challenges/respond', { method: 'POST', body: { id, accept } });
export const cancelChallenge = (id) => api('/api/challenges/cancel', { method: 'POST', body: { id } });

export const sendMatchEvent = (matchId, event) => api('/api/match/send', { method: 'POST', body: { matchId, event } });
export const finishMatch = (matchId, result) => api('/api/match/finish', { method: 'POST', body: { matchId, result } });
export const quitMatch = (matchId) => api('/api/match/quit', { method: 'POST', body: { matchId } });

/* ------------------------------------------------------------ the stream */

const pushHandlers = new Map();

/** Listens for one kind of server push: `on('challenge', fn)`. */
export function on(type, handler) {
  if (!pushHandlers.has(type)) pushHandlers.set(type, new Set());
  pushHandlers.get(type).add(handler);
  return () => pushHandlers.get(type).delete(handler);
}

function emit(type, data) {
  for (const handler of pushHandlers.get(type) || []) handler(data);
}

export function connect() {
  if (!signedIn() || stream) return;
  // EventSource cannot set headers, so the token rides in the query string.
  const url = `${state.server}/api/stream?token=${encodeURIComponent(state.token)}`;
  stream = new EventSource(url);

  stream.addEventListener('open', () => update({ connected: true, error: null }));
  stream.addEventListener('error', () => update({ connected: false }));

  const relay = (type, handle) => stream.addEventListener(type, (event) => {
    let data = null;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }
    if (handle) handle(data);
    emit(type, data);
  });

  relay('ready', (data) => { takeRoster(data); update({ connected: true }); });
  relay('presence', () => { refresh().catch(() => {}); });
  relay('friend-request', () => { refresh().catch(() => {}); });
  relay('friend-accepted', () => { refresh().catch(() => {}); });
  relay('friend-removed', () => { refresh().catch(() => {}); });
  relay('challenge', () => { refresh().catch(() => {}); });
  relay('challenge-declined', () => { refresh().catch(() => {}); });
  relay('challenge-cancelled', () => { refresh().catch(() => {}); });
  relay('match-start');
  relay('match-event');
  relay('match-result');
  relay('match-abandoned');
}

export function disconnect() {
  if (!stream) return;
  stream.close();
  stream = null;
  update({ connected: false });
}

/** Called once at boot: reconnects if this browser already has a name. */
export function restore() {
  if (signedIn()) {
    connect();
    refresh().catch((error) => update({ error: error.code || 'offline' }));
  }
}
