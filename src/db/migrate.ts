import { getPool } from "./connection.js";
import fs from "node:fs";
import path from "node:path";
import { createLogger } from "../utils/logger.js";

const log = createLogger('Migrate');

export async function migrate(): Promise<void> {
    const migrationsDir = path.join(import.meta.dirname, "migrations");
    const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith(".sql"))
        .sort();

    for (const file of files) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
        await getPool().query(sql);
        log.info(`Migration ran: ${file}`);
    }
}
