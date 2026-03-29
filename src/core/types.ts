// Represents a single search term stored in the trie with its metadata
export interface SearchTerm {
  term: string;
  frequency: number;          // how often this term has been searched
  lastUpdated: number;        // Unix timestamp (ms)
  clickThroughRate: number;   // 0 to 1
}

// A suggestion returned to the client, with its computed score
export interface ScoredSuggestion {
  term: string;
  score: number;
}

// Weights for the ranking formula
export interface RankingWeights {
  frequency: number;    // α — weight for search frequency
  recency: number;      // β — weight for how recently the term was popular
  clickThrough: number; // γ — weight for click-through rate
}

// Global config for the autocomplete system
export interface AutocompleteConfig {
  maxSuggestions: number;       // default: 10
  cacheTTLMs: number;           // cache entry time-to-live in ms (e.g., 300000 = 5 min)
  cacheMaxSize: number;         // max entries in LRU cache
  fuzzyMaxDistance: number;     // max Levenshtein distance for fuzzy matches (1 or 2)
  fuzzyEnabled: boolean;        // whether to fall back to fuzzy matching
  rankingWeights: RankingWeights;
}

// Raw input that the ingestion pipeline receives
export interface RawSearchLog {
  query: string;
  timestamp: number;
  clicked?: boolean;  // whether the user clicked a result (undefined = unknown)
}

// Event tracking for CTR computation
// "impression" = suggestions were shown to the user
// "click" = user picked a specific suggestion
export interface AutocompleteEvent {
  type: 'impression' | 'click';
  terms: string[];       // for impression: all terms shown. for click: single-element array of the clicked term
  prefix: string;        // the prefix that triggered these suggestions
  timestamp: number;
}
