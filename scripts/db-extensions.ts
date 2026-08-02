import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

/**
 * Applies the raw-SQL objects drizzle-kit push cannot express: extensions,
 * IMMUTABLE functions and expression indexes (search.sql), and the order
 * reference sequence (order-reference.sql).
 *
 * Every script is idempotent, so this is safe to re-run after every db:push —
 * and order-reference.sql must be re-run after a seed, because it raises the
 * sequence above whatever references the seed has just inserted.
 */
const SCRIPTS = [
  {
    file: 'lib/db/sql/search.sql',
    label: 'search extensions, normalization functions and trigram indexes',
  },
  {
    file: 'lib/db/sql/order-reference.sql',
    label: 'order reference sequence and next_order_reference()',
  },
] as const;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.');
  }

  // The scripts are idempotent, so "already exists, skipping" notices are expected.
  const sql = postgres(connectionString, { max: 1, onnotice: () => {} });
  try {
    for (const script of SCRIPTS) {
      const body = await readFile(path.join(process.cwd(), script.file), 'utf8');
      await sql.unsafe(body);
      console.log(`✓ ${script.label} applied`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
