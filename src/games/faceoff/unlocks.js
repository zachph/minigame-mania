import { read, write } from '../../core/storage.js';
import { FIGHTERS, UNLOCKABLES } from './content.js';

/**
 * Characters won in Story, kept between visits. The first nine are always
 * there; the rest arrive one chapter at a time.
 */
const KEY = 'faceoff:unlocked';

export function unlockedIds() {
  const saved = read(KEY);
  return Array.isArray(saved) ? saved.filter((id) => UNLOCKABLES.some((f) => f.id === id)) : [];
}

export const isUnlocked = (id) => FIGHTERS.some((f) => f.id === id) || unlockedIds().includes(id);

/** Unlocks these ids and returns the ones that were new. */
export function unlock(ids) {
  const have = unlockedIds();
  const fresh = ids.filter((id) => !have.includes(id));
  if (fresh.length) write(KEY, [...have, ...fresh]);
  return fresh;
}
