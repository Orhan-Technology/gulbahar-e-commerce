/**
 * The code a customer reads out at the counter (Prompt C11).
 *
 * IT IS NOT A SECRET. It matches a person to a parcel while the shopkeeper is
 * standing in front of them, and the shopkeeper can already see the order, the
 * name and the phone number on their own screen. Treating it as an
 * authorisation token would mean length, entropy and a lockout policy — and
 * would make a lost code a support ticket instead of "what is your phone
 * number".
 *
 * WHAT IT ACTUALLY HAS TO SURVIVE is being read down a phone line in a noisy
 * mall and copied onto a paper bag with a marker. So:
 *
 * - FIVE characters. Four collide too often across a busy shop's shelf; six is
 *   two more things to misread for no gain at this volume.
 * - NO 0/O, 1/I/L, 5/S, 8/B, 2/Z. Every one of those pairs is a wrong parcel
 *   handed over, and the alphabet below costs nothing to shrink.
 * - UPPERCASE ONLY, and compared case-insensitively — nobody types the case
 *   they were shown.
 * - Grouped for display (`GC7-4K`) but stored unformatted, so a customer who
 *   types the dash and one who does not both match.
 *
 * `crypto.randomUUID` is not used: it is hex, which reintroduces 0/1/B, and it
 * is far longer than anyone will read aloud.
 */

const ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679';
const LENGTH = 5;

/**
 * A new code. Takes its randomness from the caller so the generator itself
 * stays pure — React 19 forbids `Math.random()` during render, and a check
 * script needs to be able to produce a known code.
 */
export function generateCollectionCode(random: () => number = Math.random): string {
  let code = '';
  for (let index = 0; index < LENGTH; index += 1) {
    code += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return code;
}

/** Strips whatever the reader typed down to the stored form. */
export function normaliseCollectionCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** `AC7K4` → `AC7-K4`, for display only. Never stored grouped. */
export function formatCollectionCode(code: string): string {
  const clean = normaliseCollectionCode(code);
  return clean.length === LENGTH ? `${clean.slice(0, 3)}-${clean.slice(3)}` : clean;
}

export function collectionCodeMatches(stored: string | null, typed: string): boolean {
  if (!stored) return false;
  return normaliseCollectionCode(stored) === normaliseCollectionCode(typed);
}

export const COLLECTION_CODE_LENGTH = LENGTH;
