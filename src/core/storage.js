/**
 * Thin, failure-tolerant wrapper around localStorage. Private browsing and
 * blocked site data both throw on access, so every call falls back to memory.
 */
const PREFIX = 'minigamemania:';
const memory = new Map();

function read(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? null : JSON.parse(raw);
  } catch {
    return memory.has(key) ? memory.get(key) : null;
  }
}

function write(key, value) {
  memory.set(key, value);
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* memory-only for this session */
  }
}

export function getHighScore(gameId) {
  const value = read(`highscore:${gameId}`);
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Stores the score when it beats the record. Returns true if it did. */
export function submitHighScore(gameId, score) {
  if (!Number.isFinite(score) || score <= getHighScore(gameId)) return false;
  write(`highscore:${gameId}`, Math.round(score));
  return true;
}

/** Per-game collection of things the player has found, as `{ [entryId]: count }`. */
export function getCollection(gameId) {
  const value = read(`collection:${gameId}`);
  return value && typeof value === 'object' ? value : {};
}

/** Merges `{ [entryId]: count }` into the stored collection; returns newly discovered ids. */
export function addToCollection(gameId, counts) {
  const collection = getCollection(gameId);
  const discovered = [];
  for (const [entryId, count] of Object.entries(counts)) {
    if (!count) continue;
    if (!collection[entryId]) discovered.push(entryId);
    collection[entryId] = (collection[entryId] || 0) + count;
  }
  write(`collection:${gameId}`, collection);
  return discovered;
}
