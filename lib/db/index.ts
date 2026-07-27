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

/**
 * Pool settings, all of them there to stop a dead socket surfacing as a failed
 * query in front of an audience.
 *
 * The defaults keep a pooled socket open indefinitely. Postgres runs in Docker
 * behind a port mapping that can drop an idle connection, and the container itself
 * may be restarted mid-demo — the runbook tells the presenter to do exactly that if
 * the database dies. Either way postgres.js hands out a socket the other end has
 * already closed, and the request fails once with a bare "Failed query" carrying no
 * SQLSTATE, which is as unhelpful as it sounds. The notification log polls every two
 * seconds, so it is usually the first place this shows up.
 *
 *   idle_timeout    — close a socket idle for 20s, so the pool never holds one long
 *                     enough for the network to drop it underneath us.
 *   max_lifetime    — rotate every 30 minutes regardless, so a long-lived dev server
 *                     cannot accumulate stale connections.
 *   connect_timeout — fail fast and clearly when Postgres is genuinely down, instead
 *                     of hanging until the browser gives up.
 *
 * Deliberately NOT a retry layer: this makes the pool stop offering connections that
 * cannot work, which is different from hiding failures that are real.
 */
const sql =
  globalForDb.sql ??
  postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.sql = sql;
}

export const db = drizzle(sql, { schema });
export { sql };
