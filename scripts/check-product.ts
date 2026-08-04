import 'dotenv/config';
import { desc, eq, inArray } from 'drizzle-orm';

import { ActionClient, createReporter, html, signIn, status } from './lib/action-client';
import { db, sql as pg } from '../lib/db';
import { notifications, productAnswers, productQuestions, products } from '../lib/db/schema';

/**
 * Acceptance check for the product-page set (Prompts P1–P6).
 *
 * Reads the SHIPPED HTML and drives the SHIPPED actions. Two habits from the
 * other check scripts apply here and are worth restating:
 *
 * - next-intl ships the whole message tree to the client on every page, so a
 *   string appearing in the HTML proves nothing about what rendered. Every
 *   assertion below anchors on markup — a section id, a heading element, a
 *   card link — never on a bare phrase (CLAUDE.md).
 * - Everything this changes, it puts back: the question it asks is deleted by
 *   id, and so are the two notifications asking and answering it produce.
 */

const CUSTOMER = '0700000003';
const SHOPKEEPER = '0700000002';

/** A phone: many specs, several features, three category peers. */
const RICH = 'iphone-13-128';
/** Its category has one other shop, so no comparison is possible. */
const NO_COMPARISON = 'jbl-flip-speaker';
/** Sits under a different parent from the promoted watch. */
const UNRELATED = 'school-shoes-black';
/** Shares a parent with it, so a sponsored card is legitimate here. */
const RELATED = 'gold-ring-21k-simple';
/**
 * A product belonging to the DEMO SHOPKEEPER'S OWN SHOP.
 *
 * The Q&A flow needs the shop that can actually answer: `answerQuestion` checks
 * membership of the shop that owns the product, not a shopId carried in the
 * session, so asking on a phone from Markaz Mobile and answering as the
 * electronics shop is correctly refused.
 */
const SHOPKEEPER_PRODUCT = 'lg-tv-43-smart';

/**
 * The order of the sections that are rendered inline.
 *
 * The comparison and the Q&A are deliberately absent from this list even though
 * they sit between specs and the rails on screen: both are inside a Suspense
 * boundary, so their HTML arrives LATER IN THE STREAM than the markup that
 * follows them on the page, and raw-HTML position is not DOM position for
 * anything that streams. They are asserted separately, by presence.
 */
function sectionOrder(document: string): string[] {
  const markers: Array<[string, RegExp]> = [
    ['gallery', /id="pdp-top"/],
    ['description', />توضیحات<|>Description</],
    ['features', /id="features-heading"/],
    ['specs', /id="specs-heading"/],
    ['reviews', /id="reviews"/],
    ['rails', /class="[^"]*text-foreground text-xl font-bold[^"]*">(?:بیشتر از این دکان|More from this shop)/],
  ];

  return markers
    .map(([name, pattern]) => [name, document.search(pattern)] as const)
    .filter(([, index]) => index >= 0)
    .sort((a, b) => a[1] - b[1])
    .map(([name]) => name);
}

/** Sponsored cards, counted from the badge's own markup rather than its text. */
function sponsoredCount(document: string): number {
  return document.split('data-sponsored="true"').length - 1;
}

async function main() {
  const report = createReporter();

  /* ------------------------------------------------------------------ data */
  report.section('Every product has something to say');

  const rows = await db
    .select({
      slug: products.slug,
      attributes: products.attributes,
      features: products.features,
      description: products.description,
      brand: products.brand,
    })
    .from(products)
    .where(eq(products.status, 'published'));

  const thinSpecs = rows.filter((row) => (row.attributes ?? []).length < 5).map((row) => row.slug);
  const thinFeatures = rows.filter((row) => (row.features ?? []).length < 3).map((row) => row.slug);
  report.check(`all ${rows.length} published products carry 5+ specifications`, thinSpecs.length === 0, thinSpecs);
  report.check('and 3+ features', thinFeatures.length === 0, thinFeatures);

  const shortDescription = rows
    .filter((row) => {
      const fa = row.description?.fa ?? '';
      const en = row.description?.en ?? '';
      return fa.length < 120 || en.length < 120;
    })
    .map((row) => row.slug);
  report.check('every description is a paragraph in both locales', shortDescription.length === 0, shortDescription);

  /*
   * "N/A" is the specific failure this data model exists to avoid: a product
   * missing a spec omits the ROW, never renders a placeholder for it.
   */
  const placeholders = rows.filter((row) =>
    (row.attributes ?? []).some((attribute) =>
      /^(n\/a|na|-|—|lorem)$/i.test(String(attribute.value?.fa ?? '').trim()),
    ),
  );
  report.check('no spec value is a placeholder', placeholders.length === 0, placeholders.map((row) => row.slug));

  const missingBrand = rows.filter((row) => !row.brand && !(row.attributes ?? []).some((a) => a.key === 'brand'));
  report.check(
    'products without a brand are only the ones that genuinely have none',
    // Jewellery and dried fruit are sold unbranded in this mall; everything
    // else carries one.
    missingBrand.every((row) => /gold|silver|emerald|pistachio|almond|raisin|walnut|apricot|sweets/.test(row.slug)),
    missingBrand.map((row) => row.slug),
  );

  /* -------------------------------------------------------------- structure */
  report.section('The page is assembled in the right order');

  const rich = await html(`/fa/products/${RICH}`);
  const order = sectionOrder(rich);
  const expected = ['gallery', 'description', 'features', 'specs', 'reviews', 'rails'];
  report.check('sections run gallery → … → rails', order.join(' → ') === expected.join(' → '), order);
  report.check('the comparison and the Q&A stream in between', rich.includes('id="compare-heading"') && rich.includes('id="questions"'));

  /*
   * Anchored on the column's own marker, not on its Tailwind class list. The
   * old assertion matched the literal `lg:sticky lg:top-24`, so moving the
   * offset into a shared custom property — after all three sticky panels were
   * found tucked UNDER a header that had grown — failed a check about
   * stickiness for a reason that had nothing to do with it.
   */
  report.check(
    'the buy box is sticky, and its offset comes from the shared token',
    rich.includes('data-buy-column') && rich.includes('lg:top-[var(--sticky-offset)]'),
  );
  report.check(
    'and it renders uncondensed at the top of the page',
    rich.includes('data-condensed="false"'),
  );
  report.check('the rating links to the reviews it summarises', rich.includes('href="#reviews"'));
  /*
   * The separator is an EN DASH in fa, not an interpunct. A `·` sitting next to
   * Persian numerals reads as the digit zero — «سبد خرید · ۴ قلم» was being read
   * as "cart, 40 items" — so every fa string that put one beside a number now
   * uses «–». Matched loosely here so the assertion is about brand and model
   * appearing together, not about which glyph joins them.
   */
  /*
   * The BRAND now reads in the reader's language, with the Latin token beside
   * it — «اپل – مدل iPhone 13» plus a muted `Apple` — because the filter rail,
   * the spec table and this line all route through one brand map, and a
   * storefront that says «اپل» in the facet and "Apple" here is speaking two
   * languages on one screen. So the assertion can no longer be "Apple followed
   * by a dash"; it is that the localised brand, the model, and the Latin token
   * all reach the page.
   */
  report.check(
    'brand and model print under the title',
    /اپل\s*[–-]\s*مدل/.test(rich) && rich.includes('iPhone 13') && rich.includes('Apple'),
  );

  const noComparison = await html(`/fa/products/${NO_COMPARISON}`);
  report.check(
    'the comparison is ABSENT where fewer than two products are comparable',
    !noComparison.includes('id="compare-heading"'),
  );
  report.check(
    'and present where they are',
    rich.includes('id="compare-heading"'),
  );

  // Q&A never hides, even with nothing in it.
  report.check('the questions section is present on every product', noComparison.includes('id="questions"'));

  /* --------------------------------------------------------------- rails */
  report.section('Rails are relevant, deduplicated and never stubs');

  /*
   * Sliced from the FIRST RAIL HEADING, not from the questions section.
   *
   * Both the comparison table and the rails stream, and streamed content is
   * appended to the document in RESOLUTION order rather than in the order it is
   * finally displayed — so slicing at `id="questions"` swept up the comparison
   * table too. That put four extra products into "the rails", including the
   * current one, which the comparison table carries ON PURPOSE as its "this
   * product" column. The check was reading a different component than the one
   * it names.
   */
  const railHrefs = (document: string) => {
    const railStart = document.search(
      /class="[^"]*text-foreground text-xl font-bold[^"]*">(?:بیشتر از این دکان|More from this shop)/,
    );
    const tail = railStart >= 0 ? document.slice(railStart) : document;
    return [...tail.matchAll(/href="\/fa\/products\/([a-z0-9-]+)"/g)].map((match) => match[1]);
  };

  const railProducts = railHrefs(rich);
  const duplicates = railProducts.filter((slug, index) => railProducts.indexOf(slug) !== index);
  report.check('no product repeats across the rails', duplicates.length === 0, [...new Set(duplicates)]);
  report.check('the current product is in none of them', !railProducts.includes(RICH));

  const unrelated = await html(`/fa/products/${UNRELATED}`);
  const related = await html(`/fa/products/${RELATED}`);
  report.check(
    'a paid placement does NOT appear where it is irrelevant',
    sponsoredCount(unrelated) === 0,
    sponsoredCount(unrelated),
  );
  report.check(
    'and does appear where it is',
    sponsoredCount(related) === 1,
    sponsoredCount(related),
  );

  /* ------------------------------------------------------------------ i18n */
  report.section('Dari reads as Dari');

  /*
   * NUMBERS, not text. Model names and chip names are Latin on purpose —
   * "iPhone 13", "Super Retina XDR", "A15" — and a rule that flags any Latin
   * digit in a Dari string flags the catalogue's own product titles. What must
   * never be Latin is a FORMATTED NUMBER: a price, a count, a rating. Those are
   * exactly the strings that consist of digits and separators alone.
   */
  const visibleText = rich
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '');
  const rawNumbers = [...visibleText.matchAll(/>([^<>]+)</g)]
    .map((match) => match[1].trim())
    .filter((text) => /^[0-9][0-9,.\s]*$/.test(text));
  report.check('no unformatted number reaches the Dari page', rawNumbers.length === 0, rawNumbers.slice(0, 5));

  const english = await html(`/en/products/${RICH}`);
  report.check('the English page renders its own copy', english.includes('id="specs-heading"'));

  /* --------------------------------------------------------------- the Q&A */
  report.section('Asking and answering, end to end');

  const customer = signIn(CUSTOMER);
  const shopkeeper = signIn(SHOPKEEPER);
  const client = await ActionClient.create(
    [`/fa/products/${SHOPKEEPER_PRODUCT}`, '/fa/dashboard/questions'],
    customer,
  );

  const before = await countQuestionNotifications();
  const marker = 'آیا این دستگاه در رنگ سیاه هم موجود است؟';

  const asked = await client.call(customer, 'askQuestion', [
    { productSlug: SHOPKEEPER_PRODUCT, body: marker },
  ]);
  report.check('a signed-in customer can ask', asked?.ok === true, asked);

  const authorView = await html(`/fa/products/${SHOPKEEPER_PRODUCT}`, customer);
  const publicView = await html(`/fa/products/${SHOPKEEPER_PRODUCT}`);
  report.check('the author sees their pending question', authorView.includes(marker));
  report.check('the public does not', !publicView.includes(marker));

  const shopView = await html(`/fa/products/${SHOPKEEPER_PRODUCT}`, shopkeeper);
  report.check('the owning shop sees it too', shopView.includes(marker));

  const strangerAnswer = await client.call(customer, 'answerQuestion', [
    { questionId: asked.data.id, body: 'بله موجود است.' },
  ]);
  report.check(
    'a customer cannot answer on the shop’s behalf',
    strangerAnswer?.ok === false && strangerAnswer?.error === 'forbidden',
    strangerAnswer,
  );

  const answer = 'بله، در رنگ سیاه و سفید هر دو موجود است.';
  const answered = await client.call(shopkeeper, 'answerQuestion', [
    { questionId: asked.data.id, body: answer },
  ]);
  report.check('the shop can', answered?.ok === true, answered);

  const afterAnswer = await html(`/fa/products/${SHOPKEEPER_PRODUCT}`);
  report.check('the answered thread is public', afterAnswer.includes(answer));

  const [note] = await db
    .select({ eventKey: notifications.eventKey })
    .from(notifications)
    .where(eq(notifications.eventKey, 'question.answered'))
    .orderBy(desc(notifications.createdAt))
    .limit(1);
  report.check('the asker is notified', note?.eventKey === 'question.answered');

  // Put it back: the question, its answer, and the two notifications.
  await db.delete(productAnswers).where(eq(productAnswers.questionId, asked.data.id));
  await db.delete(productQuestions).where(eq(productQuestions.id, asked.data.id));

  const created = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(inArray(notifications.eventKey, ['question.asked', 'question.answered']))
    .orderBy(desc(notifications.createdAt));

  for (const row of created.slice(0, Math.max(0, created.length - before))) {
    await db.delete(notifications).where(eq(notifications.id, row.id));
  }

  const after = await countQuestionNotifications();
  report.check('everything this check created is cleaned up', after === before, { before, after });

  const [remaining] = await db
    .select({ id: productQuestions.id })
    .from(productQuestions)
    .where(eq(productQuestions.id, asked.data.id))
    .limit(1);
  report.check('the probe question is gone', !remaining);

  /* --------------------------------------------------------------- guards */
  report.section('Nothing unpublished leaks');

  const draft = await status('/fa/products/pistachio-roasted-1kg');
  report.check("a pending shop's product 404s", draft === 404, draft);

  const failed = report.summary();
  await pg.end({ timeout: 5 });
  process.exit(failed > 0 ? 1 : 0);
}

async function countQuestionNotifications(): Promise<number> {
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(inArray(notifications.eventKey, ['question.asked', 'question.answered']));
  return rows.length;
}

void main();
