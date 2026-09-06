/**
 * The catalogue of minigames the shell knows how to run.
 *
 * A minigame is registered as `{ ...meta, create(ctx) }` where `create` returns
 * an instance implementing the contract documented in `shell.js`.
 */
const games = new Map();

export function registerGame(definition) {
  const { id, name, create } = definition;
  if (!id) throw new Error('A minigame needs an id');
  if (typeof create !== 'function') throw new Error(`Minigame "${id}" needs a create() factory`);
  if (games.has(id)) throw new Error(`Minigame "${id}" is already registered`);
  games.set(id, { tagline: '', description: '', howTo: [], status: 'ready', ...definition, name: name || id });
  return definition;
}

export function getGame(id) {
  return games.get(id) || null;
}

export function listGames() {
  return [...games.values()];
}
