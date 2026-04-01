import { describe, it, expect, vi } from 'vitest';
import { LRUCache } from '../src/cache/LRUCache.js';

describe('LRUCache', () => {

  // --- basic get/set ---

  it('should store and retrieve a value', () => {
    const cache = new LRUCache<string, number>(5, 60000);
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
  });

  it('should return null for a missing key', () => {
    const cache = new LRUCache<string, number>(5, 60000);
    expect(cache.get('nope')).toBeNull();
  });

  it('should overwrite value on duplicate set', () => {
    const cache = new LRUCache<string, number>(5, 60000);
    cache.set('a', 1);
    cache.set('a', 2);
    expect(cache.get('a')).toBe(2);
    expect(cache.size()).toBe(1);
  });

  // --- capacity / LRU eviction ---

  it('should evict the least recently used entry when full', () => {
    const cache = new LRUCache<string, number>(3, 60000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('d', 4); // evicts 'a' (oldest)

    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('d')).toBe(4);
    expect(cache.size()).toBe(3);
  });

  it('should refresh access order on get', () => {
    const cache = new LRUCache<string, number>(3, 60000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    cache.get('a'); // 'a' is now most recent, 'b' is now oldest

    cache.set('d', 4); // should evict 'b', not 'a'

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeNull();
  });

  it('should refresh access order on set of existing key', () => {
    const cache = new LRUCache<string, number>(3, 60000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    cache.set('a', 10); // refreshes 'a', 'b' is now oldest

    cache.set('d', 4); // should evict 'b'

    expect(cache.get('a')).toBe(10);
    expect(cache.get('b')).toBeNull();
  });

  // --- TTL expiration ---

  it('should return null for expired entries', () => {
    const cache = new LRUCache<string, number>(5, 100); // 100ms TTL
    cache.set('a', 1);

    // vi.advanceTimersByTime doesn't work with Date.now() by default,
    // so we use a real short TTL and wait
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(cache.get('a')).toBeNull();
        resolve();
      }, 150);
    });
  });

  it('should not expire entries within TTL', () => {
    const cache = new LRUCache<string, number>(5, 5000);
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
  });

  it('has() should return false for expired entries', () => {
    const cache = new LRUCache<string, number>(5, 100);
    cache.set('a', 1);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(cache.has('a')).toBe(false);
        resolve();
      }, 150);
    });
  });

  // --- has ---

  it('should return true for existing key', () => {
    const cache = new LRUCache<string, number>(5, 60000);
    cache.set('a', 1);
    expect(cache.has('a')).toBe(true);
  });

  it('should return false for missing key', () => {
    const cache = new LRUCache<string, number>(5, 60000);
    expect(cache.has('nope')).toBe(false);
  });

  // --- delete ---

  it('should delete an existing entry', () => {
    const cache = new LRUCache<string, number>(5, 60000);
    cache.set('a', 1);
    expect(cache.delete('a')).toBe(true);
    expect(cache.get('a')).toBeNull();
  });

  it('should return false when deleting a non-existent key', () => {
    const cache = new LRUCache<string, number>(5, 60000);
    expect(cache.delete('nope')).toBe(false);
  });

  // --- clear and size ---

  it('should clear all entries', () => {
    const cache = new LRUCache<string, number>(5, 60000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.get('a')).toBeNull();
  });

  it('should report correct size', () => {
    const cache = new LRUCache<string, number>(5, 60000);
    expect(cache.size()).toBe(0);
    cache.set('a', 1);
    expect(cache.size()).toBe(1);
    cache.set('b', 2);
    expect(cache.size()).toBe(2);
    cache.delete('a');
    expect(cache.size()).toBe(1);
  });
});
