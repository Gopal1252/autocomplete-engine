import { SearchTerm, ScoredSuggestion } from "./types.js";

export class TrieNode {
  children: Map<string, TrieNode>;
  isEndOfWord: boolean;
  metadata: SearchTerm | null; //stores the searchterm if endOfWord
  topSuggestions: ScoredSuggestion[]; //cache the suggestions

  constructor() {
    this.children = new Map();
    this.isEndOfWord = false;
    this.metadata = null;
    this.topSuggestions = [];
  }
}