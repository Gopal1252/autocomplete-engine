import pg from 'pg';

let pool: pg.Pool;

export function getPool(): pg.Pool {
    if (!pool) {
        if(process.env.DATABASE_URL){
            pool = new pg.Pool({
                connectionString : process.env.DATABASE_URL,
                ssl: { rejectUnauthorized: false },   
                max: 2,
            });
        }else{
            pool = new pg.Pool({
                host: process.env.DB_HOST,
                port: parseInt(process.env.DB_PORT!),
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME,
            });
        }
    }
    return pool;
}
