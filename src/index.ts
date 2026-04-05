import dotenv from "dotenv";
dotenv.config();

import { AutocompleteService } from "./service/AutocompleteService.js";
import { AutocompleteConfig } from "./core/types.js";
import { createServer } from "./api/server.js";
import { seedData } from "./data/seed.js";
import { Redis } from "ioredis";
import { migrate } from "./db/migrate.js";
import { SearchTermRepo } from "./db/SearchTermRepo.js";
import { RedisCache } from "./cache/RedisCache.js";

const DEFAULT_CONFIG: AutocompleteConfig = {                                                                                                               
    maxSuggestions: 10,                                                                                                                                    
    cacheTTLMs: 5 * 60 * 1000,       // 5 minutes                                                                                                          
    cacheMaxSize: 10000,                                                                                                                                   
    fuzzyMaxDistance: 2,
    fuzzyEnabled: true,                                                                                                                                    
    rankingWeights: {                                                                                                                                      
        frequency: 0.5,
        recency: 0.3,                                                                                                                                      
        clickThrough: 0.2,
    },                                                                                                                                                     
};

async function main() {
    // run database migrations
    await migrate();

    // create dependencies
    const repo = new SearchTermRepo();
    const redis = new Redis({
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT!),
    });
    const redisCache = new RedisCache(redis, 300); // 5 min TTL

    // create service and boot from DB
    const service = new AutocompleteService(DEFAULT_CONFIG, repo, redisCache);
    await service.boot();

    // seed DB on first run if empty
    if (service.getStats().totalTerms === 0) {
        console.log("No terms in database, ingesting seed data...");
        await service.ingest(seedData);
    }

    // start server
    const PORT = 3000;
    const server = createServer(service);
    server.listen(PORT, () => {
        console.log(`Autocomplete engine ready — ${service.getStats().totalTerms} terms indexed, listening on port ${PORT}`);
    });
}

main().catch(console.error); 