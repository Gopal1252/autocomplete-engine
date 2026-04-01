import { CacheEntry } from "./CacheEntry.js";

export class LRUCache<K, V> {
    private map: Map<K, CacheEntry<V>>;
    private maxSize: number;
    private ttlMs: number;

    constructor(maxSize: number, ttlMs: number){
        this.map = new Map<K, CacheEntry<V>>();
        this.maxSize = maxSize;
        this.ttlMs = ttlMs;
    }

    set(key: K, value: V): void{
        if(this.map.has(key)){
            this.map.delete(key);
        }
        else if(this.map.size === this.maxSize){
            this.map.delete(this.map.keys().next().value!);
        }
        this.map.set(key, { value, insertedAt: Date.now() });
    }

    get(key: K): V | null{
        if(!this.map.has(key)){
            return null;
        }

        const entry = this.map.get(key)!;

        if(Date.now() - entry.insertedAt > this.ttlMs){
            this.map.delete(key);
            return null;
        }

        // Refresh access order, keep original insertedAt
        this.map.delete(key);
        this.map.set(key, entry);
        return entry.value;
    }

    has(key: K): boolean{
        if(!this.map.has(key)) return false;
        const entry = this.map.get(key)!;
        if(Date.now() - entry.insertedAt > this.ttlMs){
            this.map.delete(key);
            return false;
        }
        return true;
    }

    delete(key: K): boolean{
        return this.map.delete(key);
    }

    clear(): void{
        this.map.clear();
    }

    size(): number{
        return this.map.size;
    }
}
