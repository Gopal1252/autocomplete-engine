import { describe, it, expect, beforeEach } from 'vitest';
import { AutocompleteService } from '../src/service/AutocompleteService.js';
import { AutocompleteConfig } from '../src/core/types.js';

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

function createService(configOverrides?: Partial<AutocompleteConfig>): AutocompleteService {
    return new AutocompleteService({ ...defaultConfig, ...configOverrides });
}

function seedService(service: AutocompleteService): void {
    service.ingest([
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

    beforeEach(() => {
        service = createService();
        seedService(service);
    });

    it('should return suggestions for a valid prefix', () => {
        const results = service.getSuggestions('spo');
        expect(results.length).toBeGreaterThan(0);
        for (const r of results) {
            expect(r.term.startsWith('spo')).toBe(true);
        }
    });

    it('should return results sorted by score descending', () => {
        const results = service.getSuggestions('spo');
        for (let i = 1; i < results.length; i++) {
            expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
        }
    });

    it('should return empty array for a prefix with no matches', () => {
        const results = service.getSuggestions('xyz');
        expect(results).toEqual([]);
    });

    it('should normalize the prefix (lowercase, trim)', () => {
        const results = service.getSuggestions('  SPO  ');
        expect(results.length).toBeGreaterThan(0);
        for (const r of results) {
            expect(r.term.startsWith('spo')).toBe(true);
        }
    });

    it('should respect the n parameter', () => {
        const results = service.getSuggestions('spo', 1);
        expect(results).toHaveLength(1);
    });

    it('should use maxSuggestions from config when n is not provided', () => {
        const service2 = createService({ maxSuggestions: 2 });
        seedService(service2);
        const results = service2.getSuggestions('spo');
        expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should return fewer than n if not enough matches exist', () => {
        const results = service.getSuggestions('goo', 10);
        expect(results.length).toBeLessThan(10);
        expect(results.length).toBeGreaterThan(0);
    });
});

describe('AutocompleteService - caching', () => {
    let service: AutocompleteService;

    beforeEach(() => {
        service = createService();
        seedService(service);
    });

    it('should cache results and return from cache on second call', () => {
        const first = service.getSuggestions('spo');
        const second = service.getSuggestions('spo');
        expect(second).toEqual(first);
        expect(service.getStats().cacheHits).toBe(1);
    });

    it('should track totalQueries across calls', () => {
        service.getSuggestions('spo');
        service.getSuggestions('spo');
        service.getSuggestions('net');
        expect(service.getStats().totalQueries).toBe(3);
    });

    it('should report correct cache hit rate', () => {
        service.getSuggestions('spo'); // miss
        service.getSuggestions('spo'); // hit
        service.getSuggestions('spo'); // hit
        const stats = service.getStats();
        expect(stats.cacheHitRate).toBeCloseTo(2 / 3);
    });
});

describe('AutocompleteService - ingest', () => {
    let service: AutocompleteService;

    beforeEach(() => {
        service = createService();
    });

    it('should make ingested terms searchable', () => {
        service.ingest([{ query: 'typescript', timestamp: now }]);
        const results = service.getSuggestions('type');
        expect(results.length).toBe(1);
        expect(results[0].term).toBe('typescript');
    });

    it('should invalidate cache after ingestion', () => {
        service.ingest([{ query: 'spotify', timestamp: now }]);
        service.getSuggestions('spo'); // cached
        service.ingest([{ query: 'spongebob', timestamp: now }]);
        const results = service.getSuggestions('spo'); // should not be from old cache
        const terms = results.map(r => r.term);
        expect(terms).toContain('spongebob');
    });

    it('should aggregate frequency for duplicate terms', () => {
        service.ingest([
            { query: 'spotify', timestamp: now },
            { query: 'spotify', timestamp: now - day },
            { query: 'spotify', timestamp: now - 2 * day },
        ]);
        const term = service.trie.get('spotify');
        expect(term!.frequency).toBe(3);
    });

    it('should update totalTerms in stats', () => {
        service.ingest([
            { query: 'spotify', timestamp: now },
            { query: 'netflix', timestamp: now },
        ]);
        expect(service.getStats().totalTerms).toBe(2);
    });
});

describe('AutocompleteService - fuzzy matching', () => {
    let service: AutocompleteService;

    beforeEach(() => {
        service = createService();
        seedService(service);
    });

    it('should return fuzzy matches for typos', () => {
        const results = service.getSuggestions('spotifu');
        const terms = results.map(r => r.term);
        expect(terms).toContain('spotify');
    });

    it('should not return fuzzy matches when fuzzy is disabled', () => {
        const service2 = createService({ fuzzyEnabled: false });
        seedService(service2);
        const results = service2.getSuggestions('spotifu');
        expect(results).toEqual([]);
    });

    it('should deduplicate results from trie and fuzzy', () => {
        // "spo" matches spotify via prefix, and fuzzy might also find it
        const results = service.getSuggestions('spo');
        const termNames = results.map(r => r.term);
        const uniqueTerms = new Set(termNames);
        expect(termNames.length).toBe(uniqueTerms.size);
    });
});

describe('AutocompleteService - trackEvent (CTR)', () => {
    let service: AutocompleteService;

    beforeEach(() => {
        service = createService();
        seedService(service);
    });

    it('should update CTR after impression and click events', () => {
        service.trackEvent({
            type: 'impression',
            terms: ['spotify', 'sports news', 'spongebob'],
            prefix: 'spo',
            timestamp: now,
        });
        service.trackEvent({
            type: 'click',
            terms: ['spotify'],
            prefix: 'spo',
            timestamp: now,
        });

        const entry = service.trie.get('spotify');
        expect(entry!.clickThroughRate).toBe(1 / 1); // 1 click / 1 impression

        const entry2 = service.trie.get('sports news');
        expect(entry2!.clickThroughRate).toBe(0); // 0 clicks / 1 impression
    });

    it('should accumulate impressions and clicks over multiple events', () => {
        for (let i = 0; i < 10; i++) {
            service.trackEvent({
                type: 'impression',
                terms: ['spotify'],
                prefix: 'spo',
                timestamp: now,
            });
        }
        for (let i = 0; i < 4; i++) {
            service.trackEvent({
                type: 'click',
                terms: ['spotify'],
                prefix: 'spo',
                timestamp: now,
            });
        }

        const entry = service.trie.get('spotify');
        expect(entry!.clickThroughRate).toBeCloseTo(0.4);
    });

    it('should not crash for terms not in the trie', () => {
        expect(() => {
            service.trackEvent({
                type: 'impression',
                terms: ['nonexistent'],
                prefix: 'non',
                timestamp: now,
            });
        }).not.toThrow();
    });
});

describe('AutocompleteService - getStats', () => {
    it('should return zeroes for a fresh service', () => {
        const service = createService();
        const stats = service.getStats();
        expect(stats.totalTerms).toBe(0);
        expect(stats.cacheSize).toBe(0);
        expect(stats.cacheHitRate).toBe(0);
        expect(stats.totalQueries).toBe(0);
        expect(stats.cacheHits).toBe(0);
        expect(stats.fuzzyEnabled).toBe(true);
    });

    it('should reflect state after operations', () => {
        const service = createService();
        seedService(service);
        service.getSuggestions('spo'); // miss
        service.getSuggestions('spo'); // hit

        const stats = service.getStats();
        expect(stats.totalTerms).toBeGreaterThan(0);
        expect(stats.cacheSize).toBe(1);
        expect(stats.totalQueries).toBe(2);
        expect(stats.cacheHits).toBe(1);
        expect(stats.cacheHitRate).toBe(0.5);
    });
});
