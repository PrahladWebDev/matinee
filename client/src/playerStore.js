import { useSyncExternalStore } from 'react';

// Tiny shared store so the Watch page and the persistent player host can talk
// without re-rendering each other.
//   session: what is playing (video, src and the callbacks the player needs)
//   slot:    the Watch page's placeholder element (null when we are not on a Watch page → mini-player)
let state = { session: null, slot: null };
const subs = new Set();

export const store = {
  get: () => state,
  set(patch) { state = { ...state, ...patch }; subs.forEach((f) => f()); },
  subscribe(f) { subs.add(f); return () => subs.delete(f); },
};

export const usePlayerStore = () => useSyncExternalStore(store.subscribe, store.get);
