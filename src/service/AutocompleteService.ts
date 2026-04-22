import { Trie } from "../core/Trie.js";
import { AutocompleteConfig, ScoredSuggestion, SearchTerm, RawSearchLog, AutocompleteEvent } from "../core/types.js";
import { LRUCache } from "../cache/LRUCache.js";
import { Ranker } from "../ranking/Ranker.js";
import { BKTree } from "../fuzzy/BKTree.js";
import { levenshteinDistance } from "../fuzzy/Levenshtein.js";
import { Pipeline } from "../ingestion/Pipeline.js";
import { Cleaner } from "../ingestion/Cleaner.js";
import { SearchTermRepo } from "../db/SearchTermRepo.js";
import { RedisCache } from "../cache/RedisCache.js";
import { withTimeout } from "../utils/withTimeout.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger('Service');

export class AutocompleteService {
    trie: Trie;
    lruCache: LRUCache<string, ScoredSuggestion[]>;
    ranker: Ranker;
    bkTree: BKTree;
    fuzzyEnabled: boolean;
    fuzzyMaxDistance: number;
    maxSuggestions: number;
    pipeline: Pipeline;
    redisCache : RedisCache;
    repo : SearchTermRepo;

    private impressions: Map<string, number>;
    private clicks: Map<string, number>;

    private l1Hits: number;
    private l2Hits: number;
    private totalQueries: number;

    private booted = false;

    constructor(config: AutocompleteConfig, repo: SearchTermRepo, redisCache: RedisCache) {
        this.trie = new Trie();
        this.lruCache = new LRUCache<string, ScoredSuggestion[]>(config.cacheMaxSize, config.cacheTTLMs);
        this.ranker = new Ranker(config.rankingWeights);
        this.bkTree = new BKTree(levenshteinDistance);
        this.fuzzyEnabled = config.fuzzyEnabled;
        this.fuzzyMaxDistance = config.fuzzyMaxDistance;
        this.maxSuggestions = config.maxSuggestions;
        this.pipeline = new Pipeline(this.trie, this.bkTree);
        this.redisCache = redisCache;
        this.repo = repo;

        this.impressions = new Map<string, number>();
        this.clicks = new Map<string, number>();

        this.l1Hits = 0;
        this.l2Hits = 0;
        this.totalQueries = 0;
    }

    //Load all terms from Postgres into trie + BK-tree on boot
    async boot(): Promise<void>{
        const terms = await this.repo.getAll();
        for(const term of terms){
            this.trie.insert(term.term, term);
            this.bkTree.insert(term.term);
        }
        this.booted = true;
        log.info(`Loaded ${terms.length} terms from database`);
    }

    async getSuggestions(prefix: string, n?: number): Promise<ScoredSuggestion[]> {
        const searchTerm = prefix.toLowerCase().trim();
        const requiredSuggestions = n ?? this.maxSuggestions;
        this.totalQueries++;

        //L1: in-memory LRU cache
        if(this.lruCache.has(searchTerm)){
            this.l1Hits++;
            return this.lruCache.get(searchTerm)!;
        }

        //L2: Redis cache
        const redisResult = await this.redisCache.get(searchTerm);
        if(redisResult){
            this.l2Hits++;
            this.lruCache.set(searchTerm, redisResult); // promote to L1
            return redisResult;
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

        //cache in both L1 and L2
        this.lruCache.set(searchTerm, topSuggestions);
        await this.redisCache.set(searchTerm, topSuggestions);

        return topSuggestions;
    }

    async ingest(logs: RawSearchLog[]): Promise<void> {
        this.pipeline.ingest(logs);

        // collect cleaned terms and persist in a single DB call
        const termsToUpsert: SearchTerm[] = [];
        for (const log of logs) {
            const term = this.trie.get(Cleaner.clean(log.query));
            if (term && !termsToUpsert.some(t => t.term === term.term)) {
                termsToUpsert.push(term);
            }
        }
        await this.repo.bulkUpsert(termsToUpsert); 

        this.lruCache.clear();
        await this.redisCache.clear();
    }

    async trackEvent(event: AutocompleteEvent): Promise<void>{
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
            const ctr = clicks / impressions;

            //update only ctr in trie
            const entry = this.trie.get(term);//object is passed by reference  
            if(entry){
                entry.clickThroughRate = ctr;
                //persist CTR to Postgres
                await this.repo.updateCTR(term, ctr); 
            }                                                                                                                                                                                                                       
        } 
    }

    getStats(){
        return {
            totalTerms: this.trie.count,
            l1CacheSize: this.lruCache.size(),
            l1Hits: this.l1Hits,
            l2Hits: this.l2Hits,
            totalCacheHits: this.l1Hits + this.l2Hits,
            cacheHitRate: this.totalQueries === 0 ? 0 : (this.l1Hits + this.l2Hits) / this.totalQueries,
            totalQueries: this.totalQueries,
            fuzzyEnabled: this.fuzzyEnabled
        };
    }

    //health check (pings Postgres and Redis)
    async healthCheck(){
        const checks = {postgres : "ok", redis: "ok", booted : this.booted};
        try{
            await withTimeout(this.repo.ping(), 2000, 'postgres');
        }
        catch(e){
            checks.postgres = `error: ${e instanceof Error ? e.message : String(e)}`;
        }

        try{
            await withTimeout(this.redisCache.ping(), 2000, 'redis');
        }
        catch(e){
            checks.redis = `error: ${e instanceof Error ? e.message : String(e)}`;
        }
        return checks;
    }
}