import { describe, it, expect, beforeEach } from 'vitest';
import { Trie } from '../src/core/Trie.js';
import { SearchTerm } from '../src/core/types.js';

// Helper to create SearchTerm objects without repeating boilerplate
const makeTerm = (term: string, frequency = 1): SearchTerm => ({
  term,
  frequency,
  lastUpdated: Date.now(),
  clickThroughRate: 0,
});

describe('Trie', () => {
  let trie: Trie;

  // Runs before each test — gives every test a fresh empty trie
  beforeEach(() => {
    trie = new Trie();
  });

  // --- insert + has ---

  it('should insert a term and find it with has()', () => {
    trie.insert('spotify', makeTerm('spotify'));
    expect(trie.has('spotify')).toBe(true);
  });

  it('should return false for a term that was never inserted', () => {
    expect(trie.has('spotify')).toBe(false);
  });

  it('should not match a prefix as a complete term', () => {
    trie.insert('spotify', makeTerm('spotify'));
    expect(trie.has('spot')).toBe(false);
  });

  it('should handle multiple inserts', () => {
    trie.insert('spotify', makeTerm('spotify'));
    trie.insert('sports', makeTerm('sports'));
    trie.insert('netflix', makeTerm('netflix'));
    expect(trie.has('spotify')).toBe(true);
    expect(trie.has('sports')).toBe(true);
    expect(trie.has('netflix')).toBe(true);
  });

  // --- search ---

  it('should return all terms matching a prefix', () => {
    trie.insert('spotify', makeTerm('spotify'));
    trie.insert('sports', makeTerm('sports'));
    trie.insert('spongebob', makeTerm('spongebob'));
    trie.insert('netflix', makeTerm('netflix'));

    const results = trie.search('spo');
    const terms = results.map(r => r.term);

    expect(terms).toHaveLength(3);
    expect(terms).toContain('spotify');
    expect(terms).toContain('sports');
    expect(terms).toContain('spongebob');
  });

  it('should not include non-matching terms in search results', () => {
    trie.insert('spotify', makeTerm('spotify'));
    trie.insert('netflix', makeTerm('netflix'));

    const results = trie.search('spo');
    const terms = results.map(r => r.term);

    expect(terms).not.toContain('netflix');
  });

  it('should return empty array for a prefix with no matches', () => {
    trie.insert('spotify', makeTerm('spotify'));
    const results = trie.search('xyz');
    expect(results).toHaveLength(0);
  });

  it('should return all terms when prefix is empty string', () => {
    trie.insert('cat', makeTerm('cat'));
    trie.insert('car', makeTerm('car'));
    trie.insert('dog', makeTerm('dog'));

    const results = trie.search('');
    expect(results).toHaveLength(3);
  });

  it('should return exact match when full term is used as prefix', () => {
    trie.insert('cat', makeTerm('cat'));
    trie.insert('category', makeTerm('category'));

    const results = trie.search('cat');
    const terms = results.map(r => r.term);

    expect(terms).toHaveLength(2);
    expect(terms).toContain('cat');
    expect(terms).toContain('category');
  });

  it('should work with single character prefix', () => {
    trie.insert('apple', makeTerm('apple'));
    trie.insert('amazon', makeTerm('amazon'));
    trie.insert('banana', makeTerm('banana'));

    const results = trie.search('a');
    const terms = results.map(r => r.term);

    expect(terms).toHaveLength(2);
    expect(terms).toContain('apple');
    expect(terms).toContain('amazon');
  });

  it('should return correct metadata with search results', () => {
    trie.insert('spotify', makeTerm('spotify', 9500));

    const results = trie.search('spo');
    expect(results[0].term).toBe('spotify');
    expect(results[0].frequency).toBe(9500);
  });

  // --- delete ---

  it('should delete a term', () => {
    trie.insert('spotify', makeTerm('spotify'));
    expect(trie.delete('spotify')).toBe(true);
    expect(trie.has('spotify')).toBe(false);
  });

  it('should return false when deleting a non-existent term', () => {
    expect(trie.delete('spotify')).toBe(false);
  });

  it('should not delete terms that share a prefix', () => {
    trie.insert('cat', makeTerm('cat'));
    trie.insert('category', makeTerm('category'));

    trie.delete('cat');

    expect(trie.has('cat')).toBe(false);
    expect(trie.has('category')).toBe(true);
  });

  it('should remove deleted terms from search results', () => {
    trie.insert('spotify', makeTerm('spotify'));
    trie.insert('sports', makeTerm('sports'));

    trie.delete('spotify');

    const results = trie.search('spo');
    const terms = results.map(r => r.term);

    expect(terms).toHaveLength(1);
    expect(terms).toContain('sports');
    expect(terms).not.toContain('spotify');
  });

  it('should not delete a prefix that is not a complete term', () => {
    trie.insert('category', makeTerm('category'));
    expect(trie.delete('cat')).toBe(false);
    expect(trie.has('category')).toBe(true);
  });

  // --- getAllWithPrefix ---

  it('should return same results as search', () => {
    trie.insert('spotify', makeTerm('spotify'));
    trie.insert('sports', makeTerm('sports'));

    const searchResults = trie.search('spo');
    const getAllResults = trie.getAllWithPrefix('spo');

    expect(searchResults).toEqual(getAllResults);
  });
});
