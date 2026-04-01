import { describe, it, expect, beforeEach } from 'vitest';
import { Pipeline } from '../src/ingestion/Pipeline.js';
import { Trie } from '../src/core/Trie.js';
import { Cleaner } from '../src/ingestion/Cleaner.js';
import { RawSearchLog } from '../src/core/types.js';

const now = Date.now();
const day = 24 * 60 * 60 * 1000;

describe('Cleaner', () => {

  it('should lowercase, trim, and strip special characters', () => {
    expect(Cleaner.clean('  Best RESTAURANTS!! near me  ')).toBe('best restaurants near me');
  });

  it('should collapse multiple spaces', () => {
    expect(Cleaner.clean('hello    world')).toBe('hello world');
  });

  it('should keep numbers', () => {
    expect(Cleaner.clean('iphone 16 pro')).toBe('iphone 16 pro');
  });

  it('should reject empty strings', () => {
    expect(Cleaner.isValid('')).toBe(false);
  });

  it('should reject single character strings', () => {
    expect(Cleaner.isValid('a')).toBe(false);
  });

  it('should accept 2+ character strings', () => {
    expect(Cleaner.isValid('ai')).toBe(true);
  });

  it('should tokenize into words', () => {
    expect(Cleaner.tokenize('best restaurants near me')).toEqual(['best', 'restaurants', 'near', 'me']);
  });
});

describe('Pipeline', () => {
  let trie: Trie;
  let pipeline: Pipeline;

  beforeEach(() => {
    trie = new Trie();
    pipeline = new Pipeline(trie);
  });

  // --- basic ingestion ---

  it('should ingest a single log entry into the trie', () => {
    pipeline.ingestSingle({ query: 'spotify', timestamp: now });
    expect(trie.has('spotify')).toBe(true);
  });

  it('should clean the query before inserting', () => {
    pipeline.ingestSingle({ query: '  SPOTIFY!!  ', timestamp: now });
    expect(trie.has('spotify')).toBe(true);
    expect(trie.has('  SPOTIFY!!  ')).toBe(false);
  });

  it('should reject invalid queries', () => {
    pipeline.ingestSingle({ query: '!', timestamp: now }); // cleans to empty
    pipeline.ingestSingle({ query: 'a', timestamp: now }); // too short
    expect(trie.search('').length).toBe(0);
  });

  // --- frequency aggregation ---

  it('should increment frequency for duplicate terms', () => {
    pipeline.ingest([
      { query: 'spotify', timestamp: now - 3 * day },
      { query: 'spotify', timestamp: now - 2 * day },
      { query: 'spotify', timestamp: now - 1 * day },
    ]);

    const term = trie.get('spotify');
    expect(term).not.toBeNull();
    expect(term!.frequency).toBe(3);
  });

  it('should keep the most recent timestamp', () => {
    const oldest = now - 5 * day;
    const newest = now - 1 * day;

    pipeline.ingest([
      { query: 'spotify', timestamp: oldest },
      { query: 'spotify', timestamp: newest },
    ]);

    const term = trie.get('spotify');
    expect(term!.lastUpdated).toBe(newest);
  });

  // --- bulk ingestion ---

  it('should ingest multiple different terms', () => {
    pipeline.ingest([
      { query: 'spotify', timestamp: now },
      { query: 'netflix', timestamp: now },
      { query: 'youtube', timestamp: now },
    ]);

    expect(trie.has('spotify')).toBe(true);
    expect(trie.has('netflix')).toBe(true);
    expect(trie.has('youtube')).toBe(true);
  });

  it('should handle mixed valid and invalid entries', () => {
    pipeline.ingest([
      { query: 'spotify', timestamp: now },
      { query: '!!', timestamp: now },       // invalid after cleaning
      { query: 'x', timestamp: now },         // too short
      { query: 'netflix', timestamp: now },
    ]);

    expect(trie.has('spotify')).toBe(true);
    expect(trie.has('netflix')).toBe(true);
    expect(trie.search('').length).toBe(2); // only 2 valid terms
  });

  // --- updating existing terms ---

  it('should update an existing term without duplicating', () => {
    pipeline.ingestSingle({ query: 'spotify', timestamp: now });
    pipeline.ingestSingle({ query: 'spotify', timestamp: now });

    const results = trie.search('spotify');
    expect(results).toHaveLength(1); // one entry, not two
    expect(results[0].frequency).toBe(2);
  });

  it('should preserve clickThroughRate when updating frequency', () => {
    // Manually insert a term with CTR set
    trie.insert('spotify', {
      term: 'spotify',
      frequency: 5,
      lastUpdated: now - 2 * day,
      clickThroughRate: 0.7,
    });

    // Ingest another log for the same term
    pipeline.ingestSingle({ query: 'spotify', timestamp: now });

    const term = trie.get('spotify');
    expect(term!.frequency).toBe(6);
    expect(term!.clickThroughRate).toBe(0.7); // preserved
  });
});
