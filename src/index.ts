import dotenv from "dotenv";
dotenv.config();

import { AutocompleteService } from "./service/AutocompleteService.js";
import { AutocompleteConfig } from "./core/types.js";
import { createServer } from "./api/server.js";
import { seedData } from "./data/seed.js";
import { Redis } from "ioredis";
import { migrate } from "./db/migrate.js";
import { SearchTermRepo } from "./db/SearchTermRepo.js";
import { BlocklistRepo } from "./db/BlocklistRepo.js";
import { RedisCache } from "./cache/RedisCache.js";
import { getPool } from "./db/connection.js";
import { createLogger } from "./utils/logger.js";

const log = createLogger('Server');
const redisLog = createLogger('Redis');

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
    const blocklistRepo = new BlocklistRepo();
    const redis = process.env.REDIS_URL
        ? new Redis(process.env.REDIS_URL)
        : new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
        });
    redis.on('error', (err) => {
        const msg = err.message || (err as AggregateError).errors?.[0]?.message || String(err);
        redisLog.error(msg);
    });
    const redisCache = new RedisCache(redis, 300); // 5 min TTL

    // create service and boot from DB
    const service = new AutocompleteService(DEFAULT_CONFIG, repo, redisCache, blocklistRepo);
    await service.boot();

    // seed DB on first run if empty
    if (service.getStats().totalTerms === 0) {
        log.info("No terms in database, ingesting seed data...");
        await service.ingest(seedData);
    }

    // start server
    const PORT = parseInt(process.env.PORT || '3000', 10);
    const app = createServer(service);
    const httpServer = app.listen(PORT, () => {
        log.info(`Autocomplete engine ready — ${service.getStats().totalTerms} terms indexed, listening on port ${PORT}`);
    });

    // graceful shutdown
    let shuttingDown = false;
    const shutdown = async (signal: string) => {
        if (shuttingDown) return;
        shuttingDown = true;

        log.info(`${signal} received, shutting down...`);
        const forceExit = setTimeout(() => {
            log.error("Shutdown timed out, forcing exit");
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

main().catch((e) => log.error(e instanceof Error ? e.message : String(e)));
