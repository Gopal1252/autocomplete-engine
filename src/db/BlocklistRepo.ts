import { getPool } from "./connection.js";

export class BlocklistRepo {
    async add(terms: string[]): Promise<void> {
        if (terms.length === 0) return;

        const values: (string | number)[] = [];
        const rows: string[] = [];
        const now = Date.now();

        for (let i = 0; i < terms.length; i++) {
            const offset = i * 2;
            rows.push(`($${offset + 1}, $${offset + 2})`);
            values.push(terms[i], now);
        }

        await getPool().query(
            `INSERT INTO blocked_terms (term, created_at)
            VALUES ${rows.join(', ')}
            ON CONFLICT (term) DO NOTHING`,
            values
        );
    }

    async getAll(): Promise<string[]> {
        const result = await getPool().query("SELECT term FROM blocked_terms");
        return result.rows.map(row => row.term);
    }

    async remove(term: string): Promise<boolean> {
        const result = await getPool().query(
            "DELETE FROM blocked_terms WHERE term = $1 RETURNING term",
            [term]
        );
        return (result.rowCount ?? 0) > 0;
    }
}
