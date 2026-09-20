import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Everything the server remembers: who has a name, who is friends with whom,
 * who has challenged whom, and any match in progress.
 *
 * It is a plain object kept in memory and written to one JSON file whenever it
 * changes. That is the right size for a server a handful of friends share - no
 * database to run, and the whole state is readable in a text editor if anything
 * ever looks wrong.
 *
 * Tokens are never stored. Only a SHA-256 of the token goes in the file, so the
 * file leaking does not hand anyone an account.
 */

const NAME_PATTERN = /^[A-Za-z0-9 _-]{3,16}$/;
const RESERVED = new Set(['admin', 'moderator', 'system', 'server', 'minigamemania']);

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

/** Compares two hex digests without leaking where they first differ. */
function sameDigest(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/** A display name is trimmed, single-spaced, and unique ignoring case. */
export function normaliseName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!NAME_PATTERN.test(name)) return null;
  if (RESERVED.has(name.toLowerCase().replace(/[ _-]/g, ''))) return null;
  return name;
}

const nameKey = (name) => name.toLowerCase();
const now = () => Date.now();

export class Store {
  constructor({ file = null, clock = now } = {}) {
    this.file = file;
    this.clock = clock;
    this.data = { players: {}, friendships: {}, challenges: {}, matches: {} };
    this.dirty = false;
    if (file) this._load();
  }

  _load() {
    try {
      const raw = readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        this.data = { players: {}, friendships: {}, challenges: {}, matches: {}, ...parsed };
      }
    } catch {
      /* first run, or an unreadable file - start empty rather than refuse to boot */
    }
  }

  /** Writes through a temp file so a crash mid-write cannot truncate the real one. */
  save() {
    if (!this.file || !this.dirty) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify(this.data, null, 2));
    renameSync(temp, this.file);
    this.dirty = false;
  }

  _touch() {
    this.dirty = true;
  }

  /* ------------------------------------------------------------- players */

  findByName(name) {
    const key = nameKey(name);
    return Object.values(this.data.players).find((player) => nameKey(player.name) === key) || null;
  }

  getPlayer(id) {
    return this.data.players[id] || null;
  }

  /**
   * Claims a name. The token it returns is the only credential - there is no
   * password to forget and none to steal from the server, but it also means a
   * lost token is a lost account.
   */
  createPlayer(rawName) {
    const name = normaliseName(rawName);
    if (!name) return { error: 'bad-name' };
    if (this.findByName(name)) return { error: 'name-taken' };

    const id = randomBytes(9).toString('base64url');
    const token = randomBytes(24).toString('base64url');
    this.data.players[id] = {
      id,
      name,
      tokenHash: hashToken(token),
      createdAt: this.clock(),
      lastSeen: this.clock(),
      wins: 0,
      losses: 0,
    };
    this._touch();
    return { player: this.data.players[id], token };
  }

  /** The player this token belongs to, or null. */
  authenticate(token) {
    if (typeof token !== 'string' || token.length < 16) return null;
    const digest = hashToken(token);
    for (const player of Object.values(this.data.players)) {
      if (sameDigest(player.tokenHash, digest)) return player;
    }
    return null;
  }

  seen(playerId) {
    const player = this.getPlayer(playerId);
    if (player) {
      player.lastSeen = this.clock();
      this._touch();
    }
  }

  searchPlayers(query, exceptId) {
    const needle = String(query || '').trim().toLowerCase();
    if (needle.length < 2) return [];
    return Object.values(this.data.players)
      .filter((player) => player.id !== exceptId && nameKey(player.name).includes(needle))
      .slice(0, 20);
  }

  /* --------------------------------------------------------- friendships */

  /** One row per pair, keyed by the two ids in a fixed order. */
  _pairKey(a, b) {
    return [a, b].sort().join(':');
  }

  friendship(a, b) {
    return this.data.friendships[this._pairKey(a, b)] || null;
  }

  requestFriend(fromId, toId) {
    if (fromId === toId) return { error: 'self' };
    if (!this.getPlayer(toId)) return { error: 'no-such-player' };
    const key = this._pairKey(fromId, toId);
    const existing = this.data.friendships[key];
    if (existing && existing.state === 'accepted') return { error: 'already-friends' };

    // Asking someone who already asked you is the same as saying yes.
    if (existing && existing.state === 'pending' && existing.from === toId) {
      existing.state = 'accepted';
      existing.answeredAt = this.clock();
      this._touch();
      return { friendship: existing, accepted: true };
    }
    if (existing && existing.state === 'pending') return { error: 'already-asked' };

    this.data.friendships[key] = { key, from: fromId, to: toId, state: 'pending', askedAt: this.clock() };
    this._touch();
    return { friendship: this.data.friendships[key], accepted: false };
  }

  respondToFriend(playerId, fromId, accept) {
    const row = this.friendship(playerId, fromId);
    if (!row || row.state !== 'pending') return { error: 'no-such-request' };
    if (row.to !== playerId) return { error: 'not-yours' };
    row.state = accept ? 'accepted' : 'declined';
    row.answeredAt = this.clock();
    if (!accept) delete this.data.friendships[row.key];
    this._touch();
    return { friendship: row };
  }

  removeFriend(playerId, otherId) {
    const key = this._pairKey(playerId, otherId);
    if (!this.data.friendships[key]) return { error: 'no-such-friend' };
    delete this.data.friendships[key];
    this._touch();
    return { ok: true };
  }

  /** `{ friends, incoming, outgoing }`, each a list of player ids. */
  friendsOf(playerId) {
    const friends = [];
    const incoming = [];
    const outgoing = [];
    for (const row of Object.values(this.data.friendships)) {
      if (row.from !== playerId && row.to !== playerId) continue;
      const other = row.from === playerId ? row.to : row.from;
      if (row.state === 'accepted') friends.push(other);
      else if (row.state === 'pending' && row.to === playerId) incoming.push(other);
      else if (row.state === 'pending') outgoing.push(other);
    }
    return { friends, incoming, outgoing };
  }

  areFriends(a, b) {
    const row = this.friendship(a, b);
    return Boolean(row && row.state === 'accepted');
  }

  /* ---------------------------------------------------------- challenges */

  /** You may only challenge a friend, and only one challenge at a time per pair. */
  createChallenge(fromId, toId, gameId) {
    if (!this.areFriends(fromId, toId)) return { error: 'not-friends' };
    const open = Object.values(this.data.challenges).find((c) =>
      c.state === 'pending' && ((c.from === fromId && c.to === toId) || (c.from === toId && c.to === fromId)));
    if (open) return { error: 'already-challenged' };

    const id = randomBytes(9).toString('base64url');
    this.data.challenges[id] = { id, from: fromId, to: toId, gameId, state: 'pending', createdAt: this.clock() };
    this._touch();
    return { challenge: this.data.challenges[id] };
  }

  getChallenge(id) {
    return this.data.challenges[id] || null;
  }

  /** Answering a challenge you were sent. Accepting opens the match. */
  answerChallenge(playerId, challengeId, accept) {
    const challenge = this.getChallenge(challengeId);
    if (!challenge || challenge.state !== 'pending') return { error: 'no-such-challenge' };
    if (challenge.to !== playerId) return { error: 'not-yours' };
    challenge.state = accept ? 'accepted' : 'declined';
    challenge.answeredAt = this.clock();
    this._touch();
    if (!accept) return { challenge };
    const match = this.createMatch(challenge.gameId, [challenge.from, challenge.to]);
    challenge.matchId = match.id;
    this._touch();
    return { challenge, match };
  }

  /** Withdrawing a challenge you sent, or clearing one that was never answered. */
  cancelChallenge(playerId, challengeId) {
    const challenge = this.getChallenge(challengeId);
    if (!challenge || challenge.state !== 'pending') return { error: 'no-such-challenge' };
    if (challenge.from !== playerId) return { error: 'not-yours' };
    challenge.state = 'cancelled';
    this._touch();
    return { challenge };
  }

  challengesFor(playerId) {
    const incoming = [];
    const outgoing = [];
    for (const challenge of Object.values(this.data.challenges)) {
      if (challenge.state !== 'pending') continue;
      if (challenge.to === playerId) incoming.push(challenge);
      else if (challenge.from === playerId) outgoing.push(challenge);
    }
    return { incoming, outgoing };
  }

  /* ------------------------------------------------------------- matches */

  createMatch(gameId, players) {
    const id = randomBytes(12).toString('base64url');
    // Both sides seed their randomness from this, so the waves that walk in are
    // the same on both screens without anyone having to send them over.
    const seed = randomBytes(4).readUInt32BE(0);
    this.data.matches[id] = {
      id, gameId, players: [...players], seed,
      state: 'live', startedAt: this.clock(), results: {}, eventCount: 0,
    };
    this._touch();
    return this.data.matches[id];
  }

  getMatch(id) {
    return this.data.matches[id] || null;
  }

  /** Records one side's result. The match ends once both have reported. */
  reportResult(matchId, playerId, result) {
    const match = this.getMatch(matchId);
    if (!match) return { error: 'no-such-match' };
    if (!match.players.includes(playerId)) return { error: 'not-yours' };
    if (match.state !== 'live') return { match };

    match.results[playerId] = {
      score: Number(result?.score) || 0,
      lives: Number(result?.lives) || 0,
      survived: Boolean(result?.survived),
      at: this.clock(),
    };
    this._touch();

    if (Object.keys(match.results).length < match.players.length) return { match };

    match.state = 'over';
    match.endedAt = this.clock();
    match.winner = this._decideWinner(match);
    if (match.winner) {
      const loser = match.players.find((id) => id !== match.winner);
      const won = this.getPlayer(match.winner);
      const lost = this.getPlayer(loser);
      if (won) won.wins += 1;
      if (lost) lost.losses += 1;
    }
    this._touch();
    return { match };
  }

  /** Most lives left wins; level on lives, the higher score does; level on both is a draw. */
  _decideWinner(match) {
    const [a, b] = match.players;
    const left = match.results[a];
    const right = match.results[b];
    if (!left || !right) return null;
    if (left.lives !== right.lives) return left.lives > right.lives ? a : b;
    if (left.score !== right.score) return left.score > right.score ? a : b;
    return null;
  }

  /** Ends a match early - someone quit or dropped. The other side takes it. */
  abandonMatch(matchId, playerId) {
    const match = this.getMatch(matchId);
    if (!match || match.state !== 'live') return { error: 'no-such-match' };
    if (!match.players.includes(playerId)) return { error: 'not-yours' };
    match.state = 'over';
    match.endedAt = this.clock();
    match.abandonedBy = playerId;
    match.winner = match.players.find((id) => id !== playerId) || null;
    if (match.winner) {
      const won = this.getPlayer(match.winner);
      const lost = this.getPlayer(playerId);
      if (won) won.wins += 1;
      if (lost) lost.losses += 1;
    }
    this._touch();
    return { match };
  }
}
