/**
 * Digit normalisation — ONE implementation for the client forms and the server
 * actions that receive what they send.
 *
 * JS `\d` and `\D` are ASCII-only. A sanitiser written as
 * `value.replace(/\D/g, '')` therefore DELETES «۵۰۰» keystroke by keystroke,
 * and the field a Dari-speaking shopkeeper is typing into simply stays empty —
 * on a Persian keyboard, which is the default keyboard for this persona, every
 * numeric input in the panel was unusable. The fix has to live in one module
 * because the same normalisation is needed on both sides of the wire: the form
 * shows the digits back, the action parses them.
 *
 * Deliberately NOT a `'use client'` module. A function exported from one cannot
 * be called by a server component or a server action — it arrives as a client
 * reference (CLAUDE.md) — so a shared helper for both sides has to be plain.
 */

/** Persian-Indic ۰-۹ (U+06F0) and Arabic-Indic ٠-٩ (U+0660). */
const PERSIAN_ZERO = 0x06f0;
const ARABIC_INDIC_ZERO = 0x0660;

/**
 * Rewrites Persian and Arabic-Indic digits as ASCII, leaving everything else
 * alone — "۱٬۲۰۰ افغانی" becomes "1200 افغانی" once the separators are gone.
 *
 * Group separators (both the ASCII comma and the Arabic «٬») and whitespace are
 * dropped, because a pasted price from a spreadsheet carries them and they are
 * never meaningful inside a number. A decimal point is NOT dropped: the callers
 * that parse money want `Number('12.5')` to fail their integer check rather
 * than silently become 125.
 */
export function toAsciiDigits(value: string): string {
  let out = '';
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (code >= PERSIAN_ZERO && code <= PERSIAN_ZERO + 9) {
      out += String(code - PERSIAN_ZERO);
    } else if (code >= ARABIC_INDIC_ZERO && code <= ARABIC_INDIC_ZERO + 9) {
      out += String(code - ARABIC_INDIC_ZERO);
    } else if (char === ',' || char === '٬' || /\s/.test(char)) {
      continue;
    } else {
      out += char;
    }
  }
  return out;
}

/**
 * What a numeric `onChange` wants: the ASCII digits of whatever was typed, in
 * any of the three scripts, and nothing else.
 *
 * `maxLength` trims from the START of the string rather than after the fact so
 * a phone field capped at ten stops accepting an eleventh keystroke instead of
 * quietly discarding the one the shopkeeper just typed.
 */
export function digitsOnly(value: string, maxLength?: number): string {
  let out = '';
  for (const char of toAsciiDigits(value)) {
    if (char >= '0' && char <= '9') {
      out += char;
      if (maxLength !== undefined && out.length >= maxLength) break;
    }
  }
  return out;
}

/**
 * `Number` of the digits typed, or null when there were none.
 *
 * Returning null rather than 0 matters at the action boundary: an empty price
 * and a price of zero are different mistakes and deserve different messages.
 */
export function parseDigits(value: string): number | null {
  const digits = digitsOnly(value);
  return digits.length === 0 ? null : Number(digits);
}
