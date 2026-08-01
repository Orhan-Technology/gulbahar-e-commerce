/**
 * One normalisation, shared by the search log, the trending query and the
 * browser's own recent list (Prompt: search discovery panel).
 *
 * The point is that all three agree on when two searches are "the same one".
 * If the server groups «کفش » with «کفش» but the browser keeps them as two
 * separate recents, the reader sees their own history duplicate itself for a
 * trailing space they cannot see.
 *
 * WHAT IT DOES NOT DO is strip Persian diacritics or fold ي/ی and ك/ک. Those
 * belong to the SEARCH itself, where Postgres already handles them
 * (scripts/db-extensions.ts installs the normalisation functions and trigram
 * indexes); duplicating that mapping here in JavaScript would be a second
 * definition drifting from the first. This is only about whitespace and case,
 * which is all the grouping key needs.
 *
 * No `'use client'`: the client list and the server action both import it, and
 * a constant exported from a client module reaches a server component as a
 * reference rather than a value (CLAUDE.md).
 */
export function normalizeSearchTerm(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

/** Longer than this is a paste, not a search — never logged, never suggested. */
export const MAX_SEARCH_TERM = 80;
