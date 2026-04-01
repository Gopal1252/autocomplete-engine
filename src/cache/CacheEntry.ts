export interface CacheEntry<V> {
    value: V;           // the actual cached data
    insertedAt: number; // Date.now() when this was cached
  }