import { Trie } from "../core/Trie.js";
import { AutocompleteConfig, ScoredSuggestion, SearchTerm, RawSearchLog, AutocompleteEvent } from "../core/types.js";
import { LRUCache } from "../cache/LRUCache.js";
import { Ranker } from "../ranking/Ranker.js";
import { BKTree } from "../fuzzy/BKTree.js";
import { levenshteinDistance } from "../fuzzy/Levenshtein.js";
import { Pipeline } from "../ingestion/Pipeline.js";

export class AutocompleteService {
    trie: Trie;
    cache: LRUCache<string, ScoredSuggestion[]>;
    ranker: Ranker;
    bkTree: BKTree;
    fuzzyEnabled: boolean;
    fuzzyMaxDistance: number;
    maxSuggestions: number;
    pipeline: Pipeline;

    private impressions: Map<string, number>;
    private clicks: Map<string, number>;

    private cacheHits: number;
    private totalQueries: number;

    constructor(config: AutocompleteConfig) {
        this.trie = new Trie();
        this.cache = new LRUCache<string, ScoredSuggestion[]>(config.cacheMaxSize, config.cacheTTLMs);
        this.ranker = new Ranker(config.rankingWeights);
        this.bkTree = new BKTree(levenshteinDistance);
        this.fuzzyEnabled = config.fuzzyEnabled;
        this.fuzzyMaxDistance = config.fuzzyMaxDistance;
        this.maxSuggestions = config.maxSuggestions;
        this.pipeline = new Pipeline(this.trie, this.bkTree);

        this.impressions = new Map<string, number>();
        this.clicks = new Map<string, number>();

        this.cacheHits = 0;
        this.totalQueries = 0;
    }

    getSuggestions(prefix: string, n?: number): ScoredSuggestion[] {
        const searchTerm = prefix.toLowerCase().trim();
        const requiredSuggestions = n ?? this.maxSuggestions;
        this.totalQueries++;

        if(this.cache.has(searchTerm)){//cache hit
            this.cacheHits++;
            return this.cache.get(searchTerm)!;
        }

        const suggestions : SearchTerm[] = this.trie.getAllWithPrefix(searchTerm);

        //use fuzzy matching if the suggestions are less than the required suggestions
        if(suggestions.length < requiredSuggestions){
            if(this.fuzzyEnabled){
                const fuzzySuggestions = this.bkTree.search(searchTerm, this.fuzzyMaxDistance);
                for(const fuzzySuggestion of fuzzySuggestions){
                    const fuzzySearchTerm = fuzzySuggestion.toLowerCase().trim();
                    const fuzzyTrieResults = this.trie.getAllWithPrefix(fuzzySearchTerm);
                    suggestions.push(...fuzzyTrieResults);
                }
            }
        }

        //de duplicate the suggestions (duplicates possible from trie and bkTree)
        const seen = new Set<string>();
        const uniqueSuggestions = suggestions.filter(s => {
            if (seen.has(s.term)) return false;
            seen.add(s.term);
            return true;
        });

        //rank the suggestions
        const scoredSuggestions = this.ranker.rank(uniqueSuggestions);
        
        //take the top N suggestions
        const topSuggestions = scoredSuggestions.slice(0, requiredSuggestions);

        //cache the result
        this.cache.set(searchTerm, topSuggestions);

        return topSuggestions;
    }

    ingest(logs: RawSearchLog[]): void {
        this.pipeline.ingest(logs);
        this.cache.clear();
    }

    trackEvent(event: AutocompleteEvent): void{
        if(event.type === 'impression'){
            for(const term of event.terms){
                this.impressions.set(term, (this.impressions.get(term) ?? 0) + 1);
            }
        }
        else{
            for(const term of event.terms){
                this.clicks.set(term, (this.clicks.get(term) ?? 0) + 1);
            }
        }

        //recompute the click through rate for the affected terms
        for (const term of event.terms) {                                                                                                                          
            const impressions = this.impressions.get(term) ?? 0;                                                                                                   
            if (impressions === 0) continue;                                                                                                                       
            const clicks = this.clicks.get(term) ?? 0;

            //update only ctr
            const entry = this.trie.get(term);//object is passed by reference  
            if(entry){
                entry.clickThroughRate = clicks/impressions;
            }                                                                                                                                                                                                                       
        } 
    }

    getStats(){
        return {
            totalTerms: this.trie.count,
            cacheSize: this.cache.size(),
            cacheHitRate: this.totalQueries === 0 ? 0 : this.cacheHits / this.totalQueries,
            totalQueries: this.totalQueries,
            cacheHits: this.cacheHits,
            fuzzyEnabled: this.fuzzyEnabled
        };
    }
}