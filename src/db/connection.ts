import pg from 'pg';

let pool: pg.Pool;

export function getPool(): pg.Pool {
    if (!pool) {
        pool = new pg.Pool({
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT!),
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });
    }
    return pool;
}
