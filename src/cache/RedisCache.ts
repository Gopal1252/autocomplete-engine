import { Redis } from "ioredis";
import { ScoredSuggestion } from "../core/types.js";

export class RedisCache {
    private redis: Redis;
    private ttlSeconds: number;
                                                                                                                                                           
    constructor(redis: Redis, ttlSeconds: number) {
        this.redis = redis;                                                                                                                                
        this.ttlSeconds = ttlSeconds;
    }
                                                                                                                                                           
    async get(key: string): Promise<ScoredSuggestion[] | null> {
        const data = await this.redis.get(key);                                                                                                            
        if (!data) return null;
        return JSON.parse(data);
    }                                                                                                                                                      
 
    async set(key: string, value: ScoredSuggestion[]): Promise<void> {                                                                                     
        await this.redis.set(key, JSON.stringify(value), "EX", this.ttlSeconds);
    }                                                                                                                                                      
 
    async delete(key: string): Promise<void> {                                                                                                             
        await this.redis.del(key);
    }

    async clear(): Promise<void> {
        await this.redis.flushdb();
    }  
    
    //ping redisCache
    async ping() : Promise<void>{
        const result = await this.redis.ping();
        if(result !== "PONG"){
            throw new Error(`unexpected: ${result}`);
        }
    }
}