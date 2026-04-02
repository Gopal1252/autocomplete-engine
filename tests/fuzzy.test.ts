import { describe, it, expect } from 'vitest';
import { levenshteinDistance } from '../src/fuzzy/levenshtein.js';
import { BKTree } from '../src/fuzzy/BKTree.js';

describe('levenshteinDistance', () => {

  it('should return 0 for identical strings', () => {
    expect(levenshteinDistance('spotify', 'spotify')).toBe(0);
  });

  it('should handle single character replacement', () => {
    expect(levenshteinDistance('cat', 'car')).toBe(1);
  });

  it('should handle insertion', () => {
    expect(levenshteinDistance('cat', 'cats')).toBe(1);
  });

  it('should handle deletion', () => {
    expect(levenshteinDistance('cats', 'cat')).toBe(1);
  });

  it('should handle multiple edits', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
  });

  it('should handle empty strings', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
    expect(levenshteinDistance('', '')).toBe(0);
  });

  it('should handle completely different strings', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(3);
  });
});

describe('BKTree', () => {
  const makeTree = (...words: string[]): BKTree => {
    const tree = new BKTree(levenshteinDistance);
    for (const word of words) {
      tree.insert(word);
    }
    return tree;
  };

  // --- basic search ---

  it('should find exact match', () => {
    const tree = makeTree('spotify', 'google', 'netflix');
    const results = tree.search('spotify', 0);
    expect(results).toEqual(['spotify']);
  });

  it('should find words within distance 1', () => {
    const tree = makeTree('spotify', 'google', 'netflix');
    const results = tree.search('spotifu', 1);
    expect(results).toContain('spotify');
    expect(results).not.toContain('google');
  });

  it('should find words within distance 2', () => {
    const tree = makeTree('google', 'spotify', 'netflix');
    const results = tree.search('googel', 2);
    expect(results).toContain('google');
  });

  it('should return multiple matches', () => {
    const tree = makeTree('cat', 'car', 'bar', 'bat', 'dog');
    const results = tree.search('cat', 1);
    expect(results).toContain('cat');
    expect(results).toContain('car');
    expect(results).toContain('bat');
    expect(results).not.toContain('dog');
  });

  // --- edge cases ---

  it('should return empty array for empty tree', () => {
    const tree = new BKTree(levenshteinDistance);
    expect(tree.search('anything', 2)).toEqual([]);
  });

  it('should return empty when nothing is close enough', () => {
    const tree = makeTree('spotify', 'netflix');
    const results = tree.search('python', 1);
    expect(results).toHaveLength(0);
  });

  it('should not insert duplicates', () => {
    const tree = makeTree('spotify', 'spotify', 'spotify');
    const results = tree.search('spotify', 0);
    expect(results).toHaveLength(1);
  });

  it('should handle single character words', () => {
    const tree = makeTree('a', 'b', 'c');
    const results = tree.search('a', 1);
    expect(results).toContain('a');
    expect(results).toContain('b');
    expect(results).toContain('c');
  });

  // --- real autocomplete typo scenarios ---

  it('should find "spotify" from "spotifu"', () => {
    const tree = makeTree('spotify', 'sports news', 'spongebob', 'netflix', 'youtube');
    const results = tree.search('spotifu', 2);
    expect(results).toContain('spotify');
  });

  it('should find "restaurants near me" from "restraunts near me"', () => {
    const tree = makeTree('restaurants near me', 'flights to london', 'hotels in paris');
    const results = tree.search('restraunts near me', 3);
    expect(results).toContain('restaurants near me');
  });
});
