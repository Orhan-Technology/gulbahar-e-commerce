import 'dotenv/config';

/**
 * Stub. Phase 4.2 implements the full seeded world (PRD §9.4): 14 shops,
 * 75 products, ~220 orders over 90 days, ~90 reviews, offers, campaigns,
 * and notification history.
 */
async function main() {
  console.log('seed: stub — implemented in Phase 4.2 (PRD §9.4)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
