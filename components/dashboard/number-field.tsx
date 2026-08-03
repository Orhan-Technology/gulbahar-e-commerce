'use client';

import * as React from 'react';
import { useLocale } from 'next-intl';

import { Input } from '@/components/ui/input';
import { digitsOnly } from '@/lib/digits';
import { formatNumber, formatPhone } from '@/lib/format';

/**
 * A numeric input that READS BACK IN THE READER'S OWN NUMERALS.
 *
 * Every price, stock level and phone number in this panel is printed in Persian
 * digits — «؋ ۱۲٬۰۰۰» on the tile, «۱۲٬۰۰۰» in the live price preview two
 * inches below this field — and then the field itself said `12000`. A
 * shopkeeper checking their own price against the number they just typed was
 * comparing two different scripts, which is exactly the moment a zero gets
 * miscounted.
 *
 * WHILE FOCUSED the field holds the bare ASCII digits: that is the string being
 * edited, grouping separators moving under the caret is worse than the problem
 * they solve, and `digitsOnly` accepts Persian, Arabic-Indic and pasted
 * separators regardless of what the keyboard produces. ON BLUR it re-renders
 * through `formatNumber` — the same formatter as the rest of the console, so
 * the field and the preview cannot disagree.
 *
 * The value handed to the parent is ALWAYS ASCII digits, so nothing downstream
 * (validation, the server action, the Zod schema) has to know this exists.
 */
export function NumberField({
  id,
  value,
  onChange,
  required,
  invalid,
  describedBy,
  maxLength,
  className,
  placeholder,
  format = 'number',
}: {
  id: string;
  /** ASCII digits, or empty. */
  value: string;
  onChange: (next: string) => void;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
  maxLength?: number;
  className?: string;
  placeholder?: string;
  /**
   * `phone` maps digits WITHOUT grouping or a numeric parse: «۰۷۰۰۱۰۰۲۰۱» is a
   * dialable string, and `formatNumber` would drop its leading zero and cut it
   * into thousands (see lib/format.ts).
   */
  format?: 'number' | 'phone';
}) {
  const locale = useLocale();
  const [focused, setFocused] = React.useState(false);

  const display =
    focused || value === ''
      ? value
      : format === 'phone'
        ? formatPhone(value, locale)
        : formatNumber(Number(value), locale);

  return (
    <Input
      id={id}
      inputMode={format === 'phone' ? 'tel' : 'numeric'}
      /*
       * LTR even in Dari: a number is read left-to-right in every script here,
       * and the grouped form («۱۲٬۰۰۰») only lines up under `dir="ltr"`.
       */
      dir="ltr"
      value={display}
      placeholder={placeholder}
      required={required}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      className={className}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(event) => onChange(digitsOnly(event.target.value, maxLength))}
    />
  );
}
