-- ---------------------------------------------------------------------------
-- Order reference allocation (PRD §14).
--
-- References are HUMAN currency: GC-24788 is read down a phone, written on a
-- paper bag and quoted in the demo runbook. They therefore have to stay short,
-- unique, and stable in shape.
--
-- A random five-digit number cannot give all three. The keyspace is 90,000, so
-- collisions arrive long before the mall does, and a collision inside a
-- checkout transaction is unrecoverable: the first unique violation aborts the
-- transaction (SQLSTATE 25P02) and every retry inside it fails too. A SEQUENCE
-- has no collisions to retry, and nextval() is non-transactional by design, so
-- two concurrent checkouts never wait on each other for a number.
--
-- Applied by `npm run db:extensions`, which runs as part of db:push and
-- db:reset. Idempotent, like search.sql.
-- ---------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS order_reference_seq AS bigint START WITH 30000 MINVALUE 30000;

-- ---------------------------------------------------------------------------
-- Seeded orders are inserted with their own references (scripts/seed.ts counts
-- upwards from 24000), and the runbook names some of them. The sequence must
-- therefore start ABOVE whatever is already in the table, or the first live
-- checkout collides with a demo order the presenter is about to open.
--
-- Re-run safe: setval only ever moves the sequence FORWARD, so applying this
-- after a seed raises the floor and applying it twice changes nothing.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  highest bigint;
  current_value bigint;
BEGIN
  SELECT coalesce(max(nullif(regexp_replace(reference, '\D', '', 'g'), '')::bigint), 0)
    INTO highest
    FROM orders;

  SELECT last_value INTO current_value FROM order_reference_seq;

  IF highest + 1000 > current_value THEN
    PERFORM setval('order_reference_seq', highest + 1000, true);
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- next_order_reference: the one place the printed shape is defined.
--
-- lpad to five keeps every reference the same width while the mall is small,
-- and WIDENS rather than wrapping once the sequence passes 99999 — a six-digit
-- GC-100000 is still a valid reference, where a modulo back to five digits
-- would hand out a number somebody already has.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION next_order_reference() RETURNS text
LANGUAGE sql VOLATILE AS $$
  SELECT 'GC-' || lpad(nextval('order_reference_seq')::text, 5, '0');
$$;
