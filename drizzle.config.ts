import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './lib/db/schema/index.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  /*
   * strict: true makes push ask for interactive confirmation, which fails in any
   * non-TTY context (npm scripts, db:reset, CI). The demo database is disposable
   * and rebuilt by `npm run db:reset`, so applying directly is correct here.
   */
  strict: false,
});
