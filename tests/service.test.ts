import { describe, it, expect, beforeEach } from 'vitest';
import { AutocompleteService } from '../src/service/AutocompleteService.js';
import { AutocompleteConfig, ScoredSuggestion } from '../src/core/types.js';
import { SearchTermRepo } from '../src/db/SearchTermRepo.js';
import { BlocklistRepo } from '../src/db/BlocklistRepo.js';
import { RedisCache } from '../src/cache/RedisCache.js';

const now = Date.now();
const day = 24 * 60 * 60 * 1000;

const defaultConfig: AutocompleteConfig = {
    maxSuggestions: 10,
    cacheTTLMs: 5 * 60 * 1000,
    cacheMaxSize: 100,
    fuzzyMaxDistance: 2,
    fuzzyEnabled: true,
    rankingWeights: {
        frequency: 0.5,
        recency: 0.3,
        clickThrough: 0.2,
    },
};

// Mock repo — no-ops, no real DB
const mockRepo = {
    upsert: async () => {},
    bulkUpsert: async () => {},
    getAll: async () => [],
    updateCTR: async () => {},
    delete: async () => {},
    deleteAll: async () => {},
    ping: async () => {},
} as unknown as SearchTermRepo;

// Mock blocklist repo — in-memory Set stand-in
function createMockBlocklistRepo(): BlocklistRepo {
    const store = new Set<string>();
    return {
        add: async (terms: string[]) => { for (const t of terms) store.add(t); },
        getAll: async () => Array.from(store),
        remove: async (term: string) => {
            const had = store.has(term);
            store.delete(term);
            return had;
        },
    } as unknown as BlocklistRepo;
}

// Mock Redis cache — in-memory stand-in
function createMockRedisCache(): RedisCache {
    const store = new Map<string, string>();
    return {
        get: async (key: string) => {
            const data = store.get(key);
            return data ? JSON.parse(data) : null;
        },
        set: async (key: string, value: ScoredSuggestion[]) => {
            store.set(key, JSON.stringify(value));
        },
        delete: async (key: string) => { store.delete(key); },
        clear: async () => { store.clear(); },
        ping: async () => {},
    } as unknown as RedisCache;
}

function createService(configOverrides?: Partial<AutocompleteConfig>): AutocompleteService {
    return new AutocompleteService(
        { ...defaultConfig, ...configOverrides },
        mockRepo,
        createMockRedisCache(),
        createMockBlocklistRepo(),
    );
}

async function seedService(service: AutocompleteService): Promise<void> {
    await service.ingest([
        { query: 'spotify', timestamp: now },
        { query: 'spotify', timestamp: now - 1 * day },
        { query: 'spotify', timestamp: now - 2 * day },
        { query: 'sports news', timestamp: now },
        { query: 'sports news', timestamp: now - 1 * day },
        { query: 'spongebob', timestamp: now - 3 * day },
        { query: 'netflix', timestamp: now },
        { query: 'netflix', timestamp: now - 1 * day },
        { query: 'google', timestamp: now },
    ]);
}

describe('AutocompleteService - getSuggestions', () => {
    let service: AutocompleteService;

    beforeEach(async () => {
        service = createService();
        await seedService(service);
    });

    it('should return suggestions for a valid prefix', async () => {
        const results = await service.getSuggestions('spo');
        expect(results.length).toBeGreaterThan(0);
        for (const r of results) {
            expect(r.term.startsWith('spo')).toBe(true);
        }
    });

    it('should return results sorted by score descending', async () => {
        const results = await service.getSuggestions('spo');
        for (let i = 1; i < results.length; i++) {
            expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
        }
    });

    it('should return empty array for a prefix with no matches', async () => {
        const results = await service.getSuggestions('xyz');
        expect(results).toEqual([]);
    });

    it('should normalize the prefix (lowercase, trim)', async () => {
        const results = await service.getSuggestions('  SPO  ');
        expect(results.length).toBeGreaterThan(0);
        for (const r of results) {
            expect(r.term.startsWith('spo')).toBe(true);
        }
    });

    it('should respect the n parameter', async () => {
        const results = await service.getSuggestions('spo', 1);
        expect(results).toHaveLength(1);
    });

    it('should use maxSuggestions from config when n is not provided', async () => {
        const service2 = createService({ maxSuggestions: 2 });
        await seedService(service2);
        const results = await service2.getSuggestions('spo');
        expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should return fewer than n if not enough matches exist', async () => {
        const results = await service.getSuggestions('goo', 10);
        expect(results.length).toBeLessThan(10);
        expect(results.length).toBeGreaterThan(0);
    });
});

describe('AutocompleteService - caching', () => {
    let service: AutocompleteService;

    beforeEach(async () => {
        service = createService();
        await seedService(service);
    });

    it('should cache results in L1 and return from L1 on second call', async () => {
        const first = await service.getSuggestions('spo');
        const second = await service.getSuggestions('spo');
        expect(second).toEqual(first);
        expect(service.getStats().l1Hits).toBe(1);
    });

    it('should track totalQueries across calls', async () => {
        await service.getSuggestions('spo');
        await service.getSuggestions('spo');
        await service.getSuggestions('net');
        expect(service.getStats().totalQueries).toBe(3);
    });

    it('should report correct cache hit rate', async () => {
        await service.getSuggestions('spo'); // miss
        await service.getSuggestions('spo'); // L1 hit
        await service.getSuggestions('spo'); // L1 hit
        const stats = service.getStats();
        expect(stats.cacheHitRate).toBeCloseTo(2 / 3);
    });

    it('should promote L2 hit to L1', async () => {
        await service.getSuggestions('spo'); // miss — caches in L1 + L2
        service.lruCache.clear(); // clear L1 only
        await service.getSuggestions('spo'); // L2 hit, promoted to L1
        expect(service.getStats().l2Hits).toBe(1);
        await service.getSuggestions('spo'); // now L1 hit
        expect(service.getStats().l1Hits).toBe(1);
    });
});

describe('AutocompleteService - ingest', () => {
    let service: AutocompleteService;

    beforeEach(() => {
        service = createService();
    });

    it('should make ingested terms searchable', async () => {
        await service.ingest([{ query: 'typescript', timestamp: now }]);
        const results = await service.getSuggestions('type');
        expect(results.length).toBe(1);
        expect(results[0].term).toBe('typescript');
    });

    it('should invalidate cache after ingestion', async () => {
        await service.ingest([{ query: 'spotify', timestamp: now }]);
        await service.getSuggestions('spo'); // cached
        await service.ingest([{ query: 'spongebob', timestamp: now }]);
        const results = await service.getSuggestions('spo'); // should not be from old cache
        const terms = results.map(r => r.term);
        expect(terms).toContain('spongebob');
    });

    it('should aggregate frequency for duplicate terms', async () => {
        await service.ingest([
            { query: 'spotify', timestamp: now },
            { query: 'spotify', timestamp: now - day },
            { query: 'spotify', timestamp: now - 2 * day },
        ]);
        const term = service.trie.get('spotify');
        expect(term!.frequency).toBe(3);
    });

    it('should update totalTerms in stats', async () => {
        await service.ingest([
            { query: 'spotify', timestamp: now },
            { query: 'netflix', timestamp: now },
        ]);
        expect(service.getStats().totalTerms).toBe(2);
    });
});

describe('AutocompleteService - fuzzy matching', () => {
    let service: AutocompleteService;

    beforeEach(async () => {
        service = createService();
        await seedService(service);
    });

    it('should return fuzzy matches for typos', async () => {
        const results = await service.getSuggestions('spotifu');
        const terms = results.map(r => r.term);
        expect(terms).toContain('spotify');
    });

    it('should not return fuzzy matches when fuzzy is disabled', async () => {
        const service2 = createService({ fuzzyEnabled: false });
        await seedService(service2);
        const results = await service2.getSuggestions('spotifu');
        expect(results).toEqual([]);
    });

    it('should deduplicate results from trie and fuzzy', async () => {
        const results = await service.getSuggestions('spo');
        const termNames = results.map(r => r.term);
        const uniqueTerms = new Set(termNames);
        expect(termNames.length).toBe(uniqueTerms.size);
    });
});

describe('AutocompleteService - trackEvent (CTR)', () => {
    let service: AutocompleteService;

    beforeEach(async () => {
        service = createService();
        await seedService(service);
    });

    it('should update CTR after impression and click events', async () => {
        await service.trackEvent({
            type: 'impression',
            terms: ['spotify', 'sports news', 'spongebob'],
            prefix: 'spo',
            timestamp: now,
        });
        await service.trackEvent({
            type: 'click',
            terms: ['spotify'],
            prefix: 'spo',
            timestamp: now,
        });

        const entry = service.trie.get('spotify');
        expect(entry!.clickThroughRate).toBe(1 / 1);

        const entry2 = service.trie.get('sports news');
        expect(entry2!.clickThroughRate).toBe(0);
    });

    it('should accumulate impressions and clicks over multiple events', async () => {
        for (let i = 0; i < 10; i++) {
            await service.trackEvent({
                type: 'impression',
                terms: ['spotify'],
                prefix: 'spo',
                timestamp: now,
            });
        }
        for (let i = 0; i < 4; i++) {
            await service.trackEvent({
                type: 'click',
                terms: ['spotify'],
                prefix: 'spo',
                timestamp: now,
            });
        }

        const entry = service.trie.get('spotify');
        expect(entry!.clickThroughRate).toBeCloseTo(0.4);
    });

    it('should not crash for terms not in the trie', async () => {
        await expect(
            service.trackEvent({
                type: 'impression',
                terms: ['nonexistent'],
                prefix: 'non',
                timestamp: now,
            })
        ).resolves.not.toThrow();
    });
});

describe('AutocompleteService - getStats', () => {
    it('should return zeroes for a fresh service', () => {
        const service = createService();
        const stats = service.getStats();
        expect(stats.totalTerms).toBe(0);
        expect(stats.l1CacheSize).toBe(0);
        expect(stats.cacheHitRate).toBe(0);
        expect(stats.totalQueries).toBe(0);
        expect(stats.l1Hits).toBe(0);
        expect(stats.l2Hits).toBe(0);
        expect(stats.totalCacheHits).toBe(0);
        expect(stats.fuzzyEnabled).toBe(true);
    });

    it('should reflect state after operations', async () => {
        const service = createService();
        await seedService(service);
        await service.getSuggestions('spo'); // miss
        await service.getSuggestions('spo'); // L1 hit

        const stats = service.getStats();
        expect(stats.totalTerms).toBeGreaterThan(0);
        expect(stats.l1CacheSize).toBe(1);
        expect(stats.totalQueries).toBe(2);
        expect(stats.l1Hits).toBe(1);
        expect(stats.totalCacheHits).toBe(1);
        expect(stats.cacheHitRate).toBe(0.5);
    });
});

describe('AutocompleteService - getTerm', () => {
    let service: AutocompleteService;

    beforeEach(async () => {
        service = createService();
        await seedService(service);
    });

    it('should return an existing term with metadata', () => {
        const term = service.getTerm('spotify');
        expect(term).not.toBeNull();
        expect(term!.term).toBe('spotify');
        expect(term!.frequency).toBeGreaterThan(0);
    });

    it('should return null for a non-existent term', () => {
        expect(service.getTerm('nonexistent')).toBeNull();
    });

    it('should normalize the lookup via Cleaner', () => {
        const term = service.getTerm('  SPOTIFY!!  ');
        expect(term).not.toBeNull();
        expect(term!.term).toBe('spotify');
    });
});

describe('AutocompleteService - putTerm', () => {
    let service: AutocompleteService;

    beforeEach(() => {
        service = createService();
    });

    it('should create a new term and make it searchable', async () => {
        const entry = await service.putTerm('brandnew', { frequency: 50 });
        expect(entry.term).toBe('brandnew');
        expect(entry.frequency).toBe(50);

        const results = await service.getSuggestions('bra');
        expect(results.map(r => r.term)).toContain('brandnew');
    });

    it('should use defaults when metadata is omitted for a new term', async () => {
        const entry = await service.putTerm('fresh', {});
        expect(entry.frequency).toBe(1);
        expect(entry.clickThroughRate).toBe(0);
    });

    it('should preserve existing metadata when fields are omitted on update', async () => {
        await service.putTerm('preserved', { frequency: 100, clickThroughRate: 0.5 });
        const updated = await service.putTerm('preserved', { frequency: 200 });
        expect(updated.frequency).toBe(200);
        expect(updated.clickThroughRate).toBe(0.5); // untouched
    });

    it('should normalize term via Cleaner', async () => {
        const entry = await service.putTerm('  HELLO World!  ', {});
        expect(entry.term).toBe('hello world');
    });

    it('should reject invalid terms', async () => {
        await expect(service.putTerm('a', {})).rejects.toThrow('Invalid term');
    });

    it('should invalidate cache after put', async () => {
        await service.ingest([{ query: 'spotify', timestamp: now }]);
        await service.getSuggestions('spo'); // cache populated
        await service.putTerm('spongebob', { frequency: 10 });
        const results = await service.getSuggestions('spo');
        expect(results.map(r => r.term)).toContain('spongebob');
    });
});

describe('AutocompleteService - deleteTerm', () => {
    let service: AutocompleteService;

    beforeEach(async () => {
        service = createService();
        await seedService(service);
    });

    it('should remove the term from search results', async () => {
        const before = await service.getSuggestions('spo');
        expect(before.map(r => r.term)).toContain('spotify');

        const deleted = await service.deleteTerm('spotify');
        expect(deleted).toBe(true);

        const after = await service.getSuggestions('spo');
        expect(after.map(r => r.term)).not.toContain('spotify');
    });

    it('should return false for a non-existent term', async () => {
        const deleted = await service.deleteTerm('nonexistent');
        expect(deleted).toBe(false);
    });

    it('should reject invalid terms', async () => {
        await expect(service.deleteTerm('a')).rejects.toThrow('Invalid term');
    });
});

describe('AutocompleteService - deleteAllTerms', () => {
    let service: AutocompleteService;

    beforeEach(async () => {
        service = createService();
        await seedService(service);
    });

    it('should return the number of terms that were deleted', async () => {
        const before = service.getStats().totalTerms;
        const count = await service.deleteAllTerms();
        expect(count).toBe(before);
    });

    it('should leave the service empty and searchable', async () => {
        await service.deleteAllTerms();
        expect(service.getStats().totalTerms).toBe(0);
        const results = await service.getSuggestions('spo');
        expect(results).toEqual([]);
    });

    it('should allow new ingests to flow into the fresh trie (Pipeline rewired)', async () => {
        await service.deleteAllTerms();
        await service.ingest([{ query: 'postreset', timestamp: now }]);
        const results = await service.getSuggestions('post');
        expect(results.map(r => r.term)).toContain('postreset');
    });
});

describe('AutocompleteService - blocklist', () => {
    let service: AutocompleteService;

    beforeEach(async () => {
        service = createService();
        await seedService(service);
    });

    it('should filter blocked terms from suggestions', async () => {
        await service.addToBlocklist(['spotify']);
        const results = await service.getSuggestions('spo');
        expect(results.map(r => r.term)).not.toContain('spotify');
    });

    it('should still return N results when a blocked term is in the raw top (filter-before-slice)', async () => {
        await service.addToBlocklist(['spotify']);
        const results = await service.getSuggestions('spo', 2);
        // two remaining spo-prefixed terms: "sports news" and "spongebob"
        expect(results.length).toBe(2);
        expect(results.map(r => r.term)).not.toContain('spotify');
    });

    it('should normalize terms when blocking', async () => {
        await service.addToBlocklist(['  SPOTIFY!  ']);
        const list = service.getBlocklist();
        expect(list).toContain('spotify');
    });

    it('should invalidate cache on add (blocked term should vanish immediately)', async () => {
        await service.getSuggestions('spo'); // populate cache (includes spotify)
        await service.addToBlocklist(['spotify']);
        const results = await service.getSuggestions('spo');
        expect(results.map(r => r.term)).not.toContain('spotify');
    });

    it('should allow unblocking a term', async () => {
        await service.addToBlocklist(['spotify']);
        const removed = await service.removeFromBlocklist('spotify');
        expect(removed).toBe(true);

        const results = await service.getSuggestions('spo');
        expect(results.map(r => r.term)).toContain('spotify');
    });

    it('should return false when unblocking a term not on the list', async () => {
        const removed = await service.removeFromBlocklist('nonexistent');
        expect(removed).toBe(false);
    });

    it('should report current blocklist via getBlocklist()', async () => {
        await service.addToBlocklist(['one', 'two']);
        const list = service.getBlocklist();
        expect(list.sort()).toEqual(['one', 'two']);
    });

    it('should skip invalid terms when adding (returns 0 if all invalid)', async () => {
        const count = await service.addToBlocklist(['a', 'x']); // both below minLen
        expect(count).toBe(0);
        expect(service.getBlocklist()).toEqual([]);
    });
});
