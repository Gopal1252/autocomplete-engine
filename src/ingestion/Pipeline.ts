import { Trie } from "../core/Trie.js";
import { RawSearchLog } from "../core/types.js";
import { Cleaner } from "./Cleaner.js";

export class Pipeline{
    private trie: Trie;
    private bkTree?: any;

    constructor(trie: Trie, bkTree?: any){
        this.trie = trie;
        this.bkTree = bkTree;
    }

    ingestSingle(log: RawSearchLog): void{
        const cleaned = Cleaner.clean(log.query);
        if(!Cleaner.isValid(cleaned)){
            return;
        }

        const existing = this.trie.get(cleaned);

        if(existing){
            // Term already in trie — update frequency and timestamp
            this.trie.insert(cleaned, {
                ...existing,
                frequency: existing.frequency + 1,
                lastUpdated: Math.max(existing.lastUpdated, log.timestamp),
            });
        }
        else{
            // New term — insert with frequency 1
            this.trie.insert(cleaned, {
                term: cleaned,
                frequency: 1,
                lastUpdated: log.timestamp,
                clickThroughRate: 0,
            });

            // Also add to BK-tree if available (for fuzzy matching)
            if(this.bkTree){
                this.bkTree.insert(cleaned);
            }
        }
    }

    ingest(logs: RawSearchLog[]): void{
        for(const log of logs){
            this.ingestSingle(log);
        }
    }
}
