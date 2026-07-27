/**
 * Typed read layer (Prompt 3.2). Server components import from here; mutations
 * go through server actions in lib/actions/.
 *
 * `fragments` is intentionally not re-exported — those are internal SQL pieces
 * with a hard requirement about which table must be in the outer FROM clause,
 * so they should only be used by the query modules in this directory.
 */

export * from './products';
export * from './shops';
export * from './orders';
export * from './dashboard';
export * from './search';
export * from './notifications';
export * from './promoted';
