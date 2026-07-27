-- ---------------------------------------------------------------------------
-- Trigram search support (PRD §12.3).
--
-- Postgres FTS has no Dari stemming, so search is trigram similarity over the
-- localized title/name JSONB. Indistinguishable from a real engine at 80
-- products; Meilisearch is the phase-2 replacement.
--
-- Applied by `npm run db:extensions`, which runs as part of db:reset. Kept as
-- raw SQL because drizzle-kit push cannot express extensions, IMMUTABLE
-- functions, or expression indexes.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ---------------------------------------------------------------------------
-- gulbahar_normalize: fold a string to a comparable form.
--
-- unaccent alone is not enough for a Dari-first catalogue. It handles Latin
-- diacritics ("café" → "cafe") but leaves the differences that actually break
-- Persian search:
--
--   * Arabic vs Persian letterforms. Text typed on an Arabic keyboard uses
--     ي and ك where Persian uses ی and ک. Visually near-identical, different
--     code points, zero trigram overlap.
--   * Tatweel (ـ) and the zero-width non-joiner, which split otherwise
--     identical words: «کتاب‌خانه» vs «کتابخانه».
--   * Arabic harakat (diacritics), which are optional in writing.
--   * Persian and Arabic-Indic digits. Folding these to ASCII means searching
--     "128" finds «۱۲۸ گیگابایت» — which matters for phone models, the single
--     most searched category in this mall.
--
-- Postgres ships unaccent as STABLE, not IMMUTABLE, because a dictionary could
-- in principle be redefined. Index expressions require IMMUTABLE, so this
-- wrapper asserts it — the documented pattern, and safe here because the
-- dictionary is fixed for the life of the demo database.
--
-- Written in plpgsql rather than sql deliberately: a simple SQL function can be
-- inlined by the planner, at which case the underlying STABLE unaccent leaks
-- through and the IMMUTABLE declaration stops being honoured. plpgsql bodies
-- are never inlined, so the declaration holds.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gulbahar_normalize(input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
DECLARE
  v text;
BEGIN
  -- 1. lowercase and strip Latin accents
  v := lower(unaccent('unaccent', input));
  -- 2. fold Persian and Arabic-Indic digits to ASCII
  v := translate(v, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
  -- 3. drop harakat, tatweel, and the zero-width joiners
  v := regexp_replace(v, '[ً-ْٰـ‌‍]', '', 'g');
  -- 4. collapse repeated whitespace
  v := regexp_replace(v, '\s+', ' ', 'g');
  RETURN btrim(v);
END;
$$;

-- Arabic letterform folding, kept as explicit replaces rather than a counted
-- translate() pair so the mapping is readable and cannot silently misalign.
CREATE OR REPLACE FUNCTION gulbahar_search_key(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT
    replace(
    replace(
    replace(
    replace(
    replace(
    replace(
    replace(
    replace(
    replace(
      gulbahar_normalize(input),
      'ي', 'ی'),   -- Arabic yeh      → Persian yeh
      'ى', 'ی'),   -- alef maksura    → Persian yeh
      'ك', 'ک'),   -- Arabic kaf      → Persian kaf
      'ة', 'ه'),   -- teh marbuta     → heh
      'أ', 'ا'),
      'إ', 'ا'),
      'آ', 'ا'),
      'ٱ', 'ا'),
      'ؤ', 'و')
$$;

-- ---------------------------------------------------------------------------
-- Expression indexes over every locale value at once. Search spans all three
-- languages so "Samsung" typed in the Dari UI still matches a product whose
-- Dari title is «سامسونگ» and whose English title carries the Latin name.
--
-- Uses || with coalesce rather than concat_ws: concat_ws is STABLE (its output
-- depends on type-output functions) and so is rejected in an index expression,
-- whereas the || operator is IMMUTABLE. lib/db/localized.ts builds the exact
-- same expression at query time — they must match textually or the planner will
-- ignore these indexes and fall back to a sequential scan.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS products_title_trgm_idx
  ON products USING gin (
    gulbahar_search_key(
      coalesce(title->>'fa', '') || ' ' ||
      coalesce(title->>'en', '') || ' ' ||
      coalesce(title->>'ps', '')
    ) gin_trgm_ops
  );

CREATE INDEX IF NOT EXISTS shops_name_trgm_idx
  ON shops USING gin (
    gulbahar_search_key(
      coalesce(name->>'fa', '') || ' ' ||
      coalesce(name->>'en', '') || ' ' ||
      coalesce(name->>'ps', '')
    ) gin_trgm_ops
  );

CREATE INDEX IF NOT EXISTS categories_name_trgm_idx
  ON categories USING gin (
    gulbahar_search_key(
      coalesce(name->>'fa', '') || ' ' ||
      coalesce(name->>'en', '') || ' ' ||
      coalesce(name->>'ps', '')
    ) gin_trgm_ops
  );
