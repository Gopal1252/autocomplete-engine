import { getPool } from "./connection.js";
import {SearchTerm} from "../core/types.js"

export class SearchTermRepo{
    async upsert(term: SearchTerm): Promise<void>{
        await getPool().query(
            `INSERT INTO search_terms (term, frequency, last_updated, click_through_rate)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (term) DO UPDATE SET
                frequency = $2,
                last_updated = $3,
                click_through_rate = $4`,
            [term.term,term.frequency, term.lastUpdated, term.clickThroughRate]
        );
    }

    async bulkUpsert(terms: SearchTerm[]): Promise<void> {
        if (terms.length === 0) return;

        // Build: VALUES ($1,$2,$3,$4), ($5,$6,$7,$8), ...
        const values: (string | number)[] = [];
        const rows: string[] = [];

        for (let i = 0; i < terms.length; i++) {
            const offset = i * 4;
            rows.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
            values.push(terms[i].term, terms[i].frequency, terms[i].lastUpdated, terms[i].clickThroughRate);
        }

        await getPool().query(
            `INSERT INTO search_terms (term, frequency, last_updated, click_through_rate)
            VALUES ${rows.join(', ')}
            ON CONFLICT (term) DO UPDATE SET
                frequency = EXCLUDED.frequency,
                last_updated = EXCLUDED.last_updated,
                click_through_rate = EXCLUDED.click_through_rate`,
            values
        );
    }

    async getAll(): Promise<SearchTerm[]> {
        const result = await getPool().query("SELECT * FROM search_terms");
        return result.rows.map(row => ({                                                                                                                   
            term: row.term,
            frequency: row.frequency,                                                                                                                      
            lastUpdated: Number(row.last_updated),
            clickThroughRate: row.click_through_rate,
        }));                                                                                                                                               
    }

    async updateCTR(term: string, ctr: number): Promise<void> {
        await getPool().query(
            "UPDATE search_terms SET click_through_rate = $1 WHERE term = $2",
            [ctr, term]                                                                                                                                    
        );
    } 

    //ping postgres
    async ping() : Promise<void>{
        await getPool().query("SELECT 1");
    }

    //delete endpoint to delete a single term
    async delete(term : string): Promise<void>{
        await getPool().query("DELETE FROM search_terms WHERE term = $1", [term]);
    }

    //delete all terms in the database
    async deleteAll(): Promise<void>{
        await getPool().query("DELETE FROM search_terms");
    }
}