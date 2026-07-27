import 'dotenv/config';
import postgres from 'postgres';

/**
 * Drops and recreates the public schema so `npm run db:reset` is idempotent.
 * db:push and db:seed run after this (see package.json).
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.');
  }

  const sql = postgres(connectionString, { max: 1 });
  try {
    await sql.unsafe('drop schema public cascade; create schema public;');
    console.log('✓ public schema dropped and recreated');
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
