import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

/**
 * Applies lib/db/sql/search.sql — extensions, the normalization functions, and
 * the trigram expression indexes. Idempotent, so it is safe to re-run after
 * every db:push.
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.');
  }

  const file = path.join(process.cwd(), 'lib/db/sql/search.sql');
  const script = await readFile(file, 'utf8');

  // The script is idempotent, so "already exists, skipping" notices are expected.
  const sql = postgres(connectionString, { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe(script);
    console.log('✓ search extensions, normalization functions and trigram indexes applied');
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
