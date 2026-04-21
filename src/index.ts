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
import { getPool } from "./db/connection.js";

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
    redis.on('error', (err) => {                                                                                 
        const msg = err.message || (err as AggregateError).errors?.[0]?.message || String(err);                  
        console.error('[Redis]', msg);                                                                           
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
    const app = createServer(service);
    const httpServer = app.listen(PORT, () => {
        console.log(`Autocomplete engine ready — ${service.getStats().totalTerms} terms indexed, listening on port ${PORT}`);
    });

    // graceful shutdown
    const shutdown = async (signal: string) => {
        console.log(`${signal} received, shutting down...`);
        const forceExit = setTimeout(() => {
            console.error("Shutdown timed out, forcing exit");
            process.exit(1);
        }, 10_000);
        httpServer.close(async () => {
            await getPool().end();
            await redis.quit();
            clearTimeout(forceExit);
            process.exit(0);
        });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch(console.error); 