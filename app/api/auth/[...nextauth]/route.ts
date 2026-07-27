/**
 * Auth.js route handler.
 *
 * The one API route in the project. CLAUDE.md says "no API routes unless
 * technically required" — Auth.js needs a real HTTP endpoint for its callback
 * and session flows, so this qualifies. Everything else is a server action.
 */
import { handlers } from '@/lib/auth';

export const { GET, POST } = handlers;
