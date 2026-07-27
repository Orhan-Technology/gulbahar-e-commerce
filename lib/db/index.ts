import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and start Docker Postgres.');
}

/**
 * Reuse the client across hot reloads in dev so we don't exhaust connections.
 */
const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

const sql = globalForDb.sql ?? postgres(connectionString, { max: 10 });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.sql = sql;
}

export const db = drizzle(sql, { schema });
export { sql };
