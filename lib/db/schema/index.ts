/**
 * Drizzle schema barrel — the full data model from PRD §14.
 *
 * Table modules are ordered by dependency so they never import each other
 * cyclically; all relations() declarations live in ./relations.
 */

export * from './shared';
export * from './users';
export * from './categories';
export * from './shops';
export * from './products';
export * from './orders';
export * from './reviews';
export * from './questions';
export * from './cart';
export * from './promotions';
export * from './notifications';
export * from './settings';
export * from './verification';
export * from './shop-social';
export * from './relations';
