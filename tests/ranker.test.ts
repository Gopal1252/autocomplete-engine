import { describe, it, expect } from 'vitest';
import { Ranker } from '../src/ranking/Ranker.js';
import { SearchTerm, RankingWeights } from '../src/core/types.js';

const weights: RankingWeights = {
  frequency: 0.5,
  recency: 0.3,
  clickThrough: 0.2,
};

const now = Date.now();
const day = 24 * 60 * 60 * 1000;

// Helper to create SearchTerm with defaults
const makeTerm = (
  term: string,
  frequency: number,
  daysAgo: number,
  ctr: number = 0
): SearchTerm => ({
  term,
  frequency,
  lastUpdated: now - daysAgo * day,
  clickThroughRate: ctr,
});

describe('Ranker', () => {
  const ranker = new Ranker(weights);

  // --- score() ---

  it('should return a score between 0 and 1', () => {
    const term = makeTerm('spotify', 5000, 1, 0.5);
    const score = ranker.score(term, 10000);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('should give higher score to higher frequency', () => {
    const highFreq = makeTerm('spotify', 9000, 5, 0.5);
    const lowFreq = makeTerm('spongebob', 100, 5, 0.5);
    const maxFreq = 9000;

    expect(ranker.score(highFreq, maxFreq)).toBeGreaterThan(ranker.score(lowFreq, maxFreq));
  });

  it('should give higher score to more recent terms', () => {
    const recent = makeTerm('spotify', 1000, 1, 0.5);
    const stale = makeTerm('spongebob', 1000, 25, 0.5);
    const maxFreq = 1000;

    expect(ranker.score(recent, maxFreq)).toBeGreaterThan(ranker.score(stale, maxFreq));
  });

  it('should give higher score to higher CTR', () => {
    const highCtr = makeTerm('spotify', 1000, 5, 0.9);
    const lowCtr = makeTerm('spongebob', 1000, 5, 0.1);
    const maxFreq = 1000;

    expect(ranker.score(highCtr, maxFreq)).toBeGreaterThan(ranker.score(lowCtr, maxFreq));
  });

  // --- rank() ---

  it('should return results sorted by score descending', () => {
    const terms = [
      makeTerm('low', 10, 20, 0.1),
      makeTerm('high', 9000, 1, 0.8),
      makeTerm('mid', 500, 5, 0.4),
    ];

    const ranked = ranker.rank(terms);

    expect(ranked[0].term).toBe('high');
    expect(ranked[ranked.length - 1].term).toBe('low');
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    expect(ranked[1].score).toBeGreaterThan(ranked[2].score);
  });

  it('should return empty array for empty input', () => {
    expect(ranker.rank([])).toEqual([]);
  });

  it('should return ScoredSuggestion objects with term and score', () => {
    const terms = [makeTerm('spotify', 5000, 2, 0.6)];
    const ranked = ranker.rank(terms);

    expect(ranked[0]).toHaveProperty('term', 'spotify');
    expect(ranked[0]).toHaveProperty('score');
    expect(typeof ranked[0].score).toBe('number');
  });

  it('should handle single term', () => {
    const terms = [makeTerm('spotify', 5000, 1, 0.5)];
    const ranked = ranker.rank(terms);
    expect(ranked).toHaveLength(1);
  });

  // --- custom weights ---

  it('should respect different weight configurations', () => {
    // Ranker that only cares about recency
    const recencyRanker = new Ranker({ frequency: 0, recency: 1, clickThrough: 0 });

    const terms = [
      makeTerm('old but popular', 9000, 20, 0.9),
      makeTerm('recent but rare', 10, 1, 0.1),
    ];

    const ranked = recencyRanker.rank(terms);
    expect(ranked[0].term).toBe('recent but rare');
  });
});
