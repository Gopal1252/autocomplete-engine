import pool from "./connection.js";
import {SearchTerm} from "../core/types.js"

export class SearchTermRepo{
    async upsert(term: SearchTerm): Promise<void>{
        await pool.query(
            `INSERT INTO search_terms (term, frequency, last_updated, click_through_rate)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (term) DO UPDATE SET
                frequency = $2,
                last_updated = $3,
                click_through_rate = $4`,
            [term.term,term.frequency, term.lastUpdated, term.clickThroughRate]
        );
    }

    async getAll(): Promise<SearchTerm[]> {
        const result = await pool.query("SELECT * FROM search_terms");
        return result.rows.map(row => ({                                                                                                                   
            term: row.term,
            frequency: row.frequency,                                                                                                                      
            lastUpdated: Number(row.last_updated),
            clickThroughRate: row.click_through_rate,
        }));                                                                                                                                               
    }

    async updateCTR(term: string, ctr: number): Promise<void> {
        await pool.query(
            "UPDATE search_terms SET click_through_rate = $1 WHERE term = $2",
            [ctr, term]                                                                                                                                    
        );
    } 
}