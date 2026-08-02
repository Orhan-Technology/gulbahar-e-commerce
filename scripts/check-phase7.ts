/**
 * Phase 7.1 acceptance checks — admin shell, shops, taxonomy, products, reviews.
 *
 * The headline criterion is the live demo moment (PRD §9.5): a pending shop is
 * visible in the queue with everything it built, approving it makes the shop AND
 * its published products appear on the storefront, and the shopkeeper is notified.
 *
 * The second thing these checks exist for is the permission boundary (PRD §3.1):
 * admin may change a shop's status and unpublish a product, and may NOT edit shop
 * content. That is asserted here rather than assumed, including that no admin page
 * links to an editor.
 *
 * Requires: dev server on 3005 and a seeded database. Restores what it changes.
 * Run: npm run check:phase7
 */
import 'dotenv/config';

import { sql } from '../lib/db';
import { ActionClient, createReporter, html, signIn, status } from './lib/action-client';

const ADMIN = '0700000001';
const SHOPKEEPER = '0700000002';
const CUSTOMER = '0700000003';

const { check, section, summary } = createReporter();

const PAGES = [
  '/fa/admin',
  '/fa/admin/shops',
  '/fa/admin/categories',
  '/fa/admin/products',
  '/fa/admin/reviews',
];

async function main() {
  console.log('Phase 7.1 — admin shell, shops, taxonomy, products, reviews\n');

  const admin = signIn(ADMIN);
  const client = await ActionClient.create(PAGES, admin);

  /*
   * Access is asserted on the STATUS CODE with redirects unfollowed, not on page
   * text. next-intl ships the whole message tree to the client on every page, so
   * any Dari string from messages/fa.json — including the admin brand — is present
   * in the HTML of the storefront too. A substring check cannot tell a rendered
   * admin page from a redirect to the home page.
   */
  section('Screens render');
  for (const path of PAGES) {
    const code = await status(path, admin);
    const page = await html(path, admin);
    const raw = /admin(Nav|Overview|Shops|Categories|Products|Reviews)\.[A-Za-z]/.test(page);
    check(`${path} renders with no raw message keys`, code === 200 && !raw, { code, raw });
  }

  section('The admin surface is closed to everyone else');
  for (const [label, phone] of [
    ['a shopkeeper', SHOPKEEPER],
    ['a customer', CUSTOMER],
  ] as const) {
    const code = await status('/fa/admin', signIn(phone));
    check(`${label} is redirected away from /fa/admin`, code === 307, code);
  }
  const anonymous = await status('/fa/admin');
  check('and so is an anonymous visitor', anonymous === 307, anonymous);

  /* ---------------------------------------------------------------------- */
  section('The live approval moment');

  const [pending] = await sql<{ id: string; slug: string; ownerId: string }[]>`
    select s.id, s.slug, m.user_id as "ownerId"
    from shops s
    left join shop_members m on m.shop_id = s.id and m.role = 'owner'
    where s.status = 'pending'
    limit 1
  `;
  check('a pending shop is waiting in the queue', Boolean(pending), pending?.slug);
  if (!pending) throw new Error('no pending shop; reseed');

  const queue = await html('/fa/admin/shops?status=pending', admin);
  check('it appears in the pending filter', queue.includes(pending.id));

  const reviewScreen = await html(`/fa/admin/shops/${pending.id}`, admin);
  const [catalogue] = await sql<{ total: number; published: number }[]>`
    select count(*)::int as total,
           count(*) filter (where status = 'published')::int as published
    from products where shop_id = ${pending.id}
  `;
  // Product titles are data, not messages, so finding one in the HTML really does
  // mean the catalogue rendered.
  const drafts = await sql<{ title: string }[]>`
    select title->>'fa' as title from products
    where shop_id = ${pending.id} and status = 'draft'
    order by created_at
  `;
  check(
    'the review screen shows the catalogue it built, drafts included',
    catalogue.total > 0 &&
      drafts.length > 0 &&
      drafts.every((draft) => reviewScreen.includes(draft.title)),
    { ...catalogue, drafts: drafts.length },
  );

  // Before: not on the storefront.
  check(
    'the pending shop is NOT on the storefront',
    (await status(`/fa/shops/${pending.slug}`)) === 404,
  );
  const shopsIndexBefore = await html('/fa/shops');
  check('nor in the shop directory', !shopsIndexBefore.includes(`/shops/${pending.slug}`));

  const [aPublishedProduct] = await sql<{ slug: string }[]>`
    select slug from products where shop_id = ${pending.id} and status = 'published' limit 1
  `;
  if (aPublishedProduct) {
    check(
      "and its published product is unreachable too (the shop isn't approved)",
      (await status(`/fa/products/${encodeURIComponent(aPublishedProduct.slug)}`)) === 404,
    );
  }

  // Approve.
  const approved = await client.call(admin, 'approveShop', [pending.id]);
  check('approveShop succeeds', approved?.ok === true, approved);

  const [afterApprove] = await sql<{ status: string }[]>`
    select status from shops where id = ${pending.id}
  `;
  check('the shop is now approved', afterApprove.status === 'approved', afterApprove);

  check(
    'it is immediately reachable on the storefront',
    (await status(`/fa/shops/${pending.slug}`)) === 200,
  );
  if (aPublishedProduct) {
    check(
      'and so is its published product',
      (await status(`/fa/products/${encodeURIComponent(aPublishedProduct.slug)}`)) === 200,
    );
  }

  const [approvalSms] = await sql<{ body: string; locale: string; recipient: string }[]>`
    select body, locale, recipient_user_id::text as recipient
    from notifications
    where event_key = 'shop.approved' and recipient_user_id = ${pending.ownerId}
    order by created_at desc limit 1
  `;
  check(
    'the shopkeeper was notified, with a rendered body',
    Boolean(approvalSms) && !approvalSms.body.includes('{'),
    approvalSms?.body,
  );

  const doubleApprove = await client.call(admin, 'approveShop', [pending.id]);
  check(
    'approving twice is refused, so no second SMS goes out',
    doubleApprove?.error === 'not_approvable',
    doubleApprove,
  );

  section('Rejection carries a reason the shopkeeper can act on');
  await sql`update shops set status = 'pending' where id = ${pending.id}`;

  const shortReason = await client.call(admin, 'rejectShop', [
    { shopId: pending.id, reason: 'نه' },
  ]);
  check('a two-word rejection is refused', shortReason?.error === 'reason_too_short', shortReason);

  const reason = 'تصویر جواز کاری خوانا نیست؛ لطفاً تصویر روشن‌تری بفرستید.';
  const rejected = await client.call(admin, 'rejectShop', [{ shopId: pending.id, reason }]);
  check('a written rejection is accepted', rejected?.ok === true, rejected);

  const [afterReject] = await sql<{ status: string; reason: string }[]>`
    select status, rejection_reason as reason from shops where id = ${pending.id}
  `;
  check(
    'the shop stays PENDING so it can amend and resubmit',
    afterReject.status === 'pending',
    afterReject.status,
  );
  check('with the reason attached', afterReject.reason === reason);

  const [rejectionSms] = await sql<{ body: string }[]>`
    select body from notifications
    where event_key = 'shop.rejected' and recipient_user_id = ${pending.ownerId}
    order by created_at desc limit 1
  `;
  check(
    'and the reason reaches the shopkeeper verbatim',
    Boolean(rejectionSms) && rejectionSms.body.includes(reason),
    rejectionSms?.body,
  );

  section('Suspend and close take a shop off the storefront');
  const [live] = await sql<{ id: string; slug: string }[]>`
    select id, slug from shops where status = 'approved' and slug <> ${pending.slug} limit 1
  `;
  const suspended = await client.call(admin, 'setShopStatus', [
    { shopId: live.id, status: 'suspended', reason: 'بررسی شکایت‌های پی‌درپی مشتریان' },
  ]);
  check('suspend succeeds', suspended?.ok === true, suspended);
  check(
    'the suspended shop leaves the storefront',
    (await status(`/fa/shops/${live.slug}`)) === 404,
  );
  const reinstated = await client.call(admin, 'setShopStatus', [
    { shopId: live.id, status: 'approved' },
  ]);
  check(
    'and reinstating brings it back',
    reinstated?.ok === true && (await status(`/fa/shops/${live.slug}`)) === 200,
  );

  section('Admin creates a shop and invites its owner');
  const newOwnerPhone = '0799000711';
  await sql`delete from shop_members where user_id in (select id from users where phone = ${newOwnerPhone})`;
  await sql`delete from shops where slug like 'phase7-check%'`;
  await sql`delete from users where phone = ${newOwnerPhone}`;

  const badPhone = await client.call(admin, 'createShopWithOwner', [
    { nameFa: 'دکان آزمایشی', ownerName: 'مالک آزمایشی', ownerPhone: '0512345678' },
  ]);
  check('a non-mobile owner number is refused', badPhone?.error === 'bad_phone', badPhone);

  const asAdminOwner = await client.call(admin, 'createShopWithOwner', [
    { nameFa: 'دکان آزمایشی', ownerName: 'مدیر', ownerPhone: ADMIN },
  ]);
  check(
    'a platform admin cannot own a shop',
    asAdminOwner?.error === 'owner_is_admin',
    asAdminOwner,
  );

  const existingOwner = await client.call(admin, 'createShopWithOwner', [
    { nameFa: 'دکان آزمایشی', ownerName: 'بلال', ownerPhone: SHOPKEEPER },
  ]);
  check(
    'someone who already runs a shop cannot be given a second',
    existingOwner?.error === 'owner_has_shop',
    existingOwner,
  );

  const created = await client.call(admin, 'createShopWithOwner', [
    {
      nameFa: 'دکان آزمایشی فاز هفت',
      nameEn: 'Phase7 Check Shop',
      ownerName: 'مالک آزمایشی',
      ownerPhone: newOwnerPhone,
      floor: 1,
      unitNumber: '۹۹',
    },
  ]);
  check('a valid creation succeeds', created?.ok === true, created);
  check('with a newly created owner', created?.data?.ownerCreated === true);

  const [createdShop] = await sql<{ status: string; slug: string }[]>`
    select status, slug from shops where id = ${created.data.shopId}
  `;
  check(
    'the shop lands APPROVED — admin vetted it by definition',
    createdShop.status === 'approved',
    createdShop,
  );

  const [ownerRow] = await sql<{ id: string; role: string; member_role: string }[]>`
    select u.id, u.role::text as role, m.role::text as member_role
    from users u join shop_members m on m.user_id = u.id
    where u.phone = ${newOwnerPhone}
  `;
  check(
    'the owner is a shopkeeper and the shop owner',
    ownerRow?.role === 'shopkeeper' && ownerRow.member_role === 'owner',
    ownerRow,
  );

  const [invite] = await sql<{ body: string }[]>`
    select body from notifications
    where event_key = 'shop.invited' and recipient_user_id = ${ownerRow.id}
    order by created_at desc limit 1
  `;
  check(
    'they were invited to claim it',
    Boolean(invite) && !invite.body.includes('{'),
    invite?.body,
  );

  // The claim path IS signing in with that number (PRD §12.2) — prove it works.
  const claimed = signIn(newOwnerPhone);
  const theirDashboard = await html('/fa/dashboard', claimed);
  check(
    'signing in with that number lands them on their own dashboard',
    theirDashboard.includes('دکان آزمایشی فاز هفت'),
  );

  /* ---------------------------------------------------------------------- */
  section('Taxonomy is admin-owned');

  const badSlug = await client.call(admin, 'saveCategory', [
    { slug: 'دسته تازه', name: { fa: 'دسته تازه' } },
  ]);
  check('a non-ASCII category slug is refused', badSlug?.error === 'bad_slug', badSlug);

  const [existingSlug] = await sql<{ slug: string }[]>`select slug from categories limit 1`;
  const taken = await client.call(admin, 'saveCategory', [
    { slug: existingSlug.slug, name: { fa: 'تکراری' } },
  ]);
  check('a duplicate slug is named as such', taken?.error === 'slug_taken', taken);

  const [root] = await sql<
    { id: string }[]
  >`select id from categories where parent_id is null limit 1`;
  const [child] = await sql<{ id: string }[]>`
    select id from categories where parent_id = ${root.id} limit 1
  `;
  const tooDeep = await client.call(admin, 'saveCategory', [
    { slug: 'phase7-too-deep', name: { fa: 'سه سطح' }, parentId: child.id },
  ]);
  check('a third level is refused', tooDeep?.error === 'too_deep', tooDeep);

  const newCategory = await client.call(admin, 'saveCategory', [
    {
      slug: 'phase7-check-category',
      name: { fa: 'دسته‌ی آزمایشی', en: 'Phase7 Check Category' },
      parentId: root.id,
    },
  ]);
  check('a valid subcategory is created', newCategory?.ok === true, newCategory);

  const deletedEmpty = await client.call(admin, 'deleteCategory', [newCategory.data.id]);
  check('an empty category can be deleted', deletedEmpty?.ok === true, deletedEmpty);

  const [usedCategory] = await sql<{ id: string; n: number }[]>`
    select c.id, count(p.id)::int as n from categories c
    join products p on p.category_id = c.id
    group by c.id having count(p.id) > 0 limit 1
  `;
  const blocked = await client.call(admin, 'deleteCategory', [usedCategory.id]);
  check(
    'one with products behind it is refused, not silently orphaned',
    blocked?.error === 'has_products',
    blocked,
  );
  const [stillThere] = await sql<{ n: number }[]>`
    select count(*)::int as n from categories where id = ${usedCategory.id}
  `;
  check('and it really is still there', stillThere.n === 1);

  const withChildren = await client.call(admin, 'deleteCategory', [root.id]);
  check('a parent with children is refused', withChildren?.error === 'has_children', withChildren);

  section('Reorder persists');
  const rootsBefore = await sql<{ id: string; sort: number }[]>`
    select id, sort from categories where parent_id is null order by sort asc
  `;
  const reordered = [...rootsBefore].reverse().map((row) => row.id);
  const reorder = await client.call(admin, 'reorderCategories', [reordered]);
  const rootsAfter = await sql<{ id: string }[]>`
    select id from categories where parent_id is null order by sort asc
  `;
  check(
    'reordering writes the new sequence',
    reorder?.ok === true && rootsAfter[0].id === reordered[0],
    { first: rootsAfter[0]?.id, want: reordered[0] },
  );
  // Put the taxonomy back the way the seed had it.
  await client.call(admin, 'reorderCategories', [rootsBefore.map((row) => row.id)]);

  /* ---------------------------------------------------------------------- */
  section('Products: unpublish only, never edit');

  const productsPage = await html('/fa/admin/products', admin);
  // A per-product path would be an editor; the filter links are /admin/products?…
  const editorLink = /\/(?:admin|dashboard)\/products\/[0-9a-f]{8}-/.test(productsPage);
  check('no admin product row links to an editor', !editorLink);

  const [target] = await sql<{ id: string; slug: string }[]>`
    select p.id, p.slug from products p
    join shops s on s.id = p.shop_id
    where p.status = 'published' and s.status = 'approved'
    limit 1
  `;
  const unpublished = await client.call(admin, 'unpublishProduct', [
    { productId: target.id, reason: 'تصویر محصول با توضیحات آن یکی نیست' },
  ]);
  check('unpublish succeeds', unpublished?.ok === true, unpublished);
  check(
    'the product leaves the storefront',
    (await status(`/fa/products/${encodeURIComponent(target.slug)}`)) === 404,
  );

  const [unpublishedRow] = await sql<{ status: string }[]>`
    select status from products where id = ${target.id}
  `;
  check(
    "it uses the same 'unpublished' state the shop can reverse",
    unpublishedRow.status === 'unpublished',
    unpublishedRow,
  );

  const again = await client.call(admin, 'unpublishProduct', [
    { productId: target.id, reason: 'تصویر محصول با توضیحات آن یکی نیست' },
  ]);
  check('unpublishing an unpublished product is refused', again?.error === 'not_published', again);

  // The shop can put it back — proving admin did not lock them out.
  const shopkeeper = signIn(SHOPKEEPER);
  const [ownedTarget] = await sql<{ id: string; slug: string }[]>`
    select p.id, p.slug from products p
    join shop_members m on m.shop_id = p.shop_id
    join users u on u.id = m.user_id
    where u.phone = ${SHOPKEEPER} and p.status = 'published'
    limit 1
  `;
  await client.call(admin, 'unpublishProduct', [
    { productId: ownedTarget.id, reason: 'تصویر محصول با توضیحات آن یکی نیست' },
  ]);
  const shopClient = await ActionClient.create(['/fa/dashboard/products'], shopkeeper);
  const republished = await shopClient.call(shopkeeper, 'bulkSetProductStatus', [
    [ownedTarget.id],
    'published',
  ]);
  const [republishedRow] = await sql<{ status: string }[]>`
    select status from products where id = ${ownedTarget.id}
  `;
  check(
    'the shop can republish what admin took down',
    republished?.ok === true && republishedRow.status === 'published',
    republishedRow,
  );

  section('Admin has no write path into shop content');
  // The shopkeeper's own actions must refuse an admin session outright — the
  // dashboard actions check for role 'shopkeeper', not merely "not a customer".
  const adminOnShopAction = await shopClient.call(admin, 'bulkSetProductStatus', [
    [ownedTarget.id],
    'unpublished',
  ]);
  check(
    "an admin session cannot drive a shop's own product action",
    adminOnShopAction?.error === 'forbidden',
    adminOnShopAction,
  );

  /* ---------------------------------------------------------------------- */
  section('Review moderation');

  const [reported] = await sql<{ id: string; productSlug: string }[]>`
    select r.id, p.slug as "productSlug" from reviews r
    join products p on p.id = r.product_id
    where r.status = 'reported' limit 1
  `;
  check('a reported review is in the queue', Boolean(reported));

  const moderationPage = await html('/fa/admin/reviews', admin);
  check('the queue screen renders it', moderationPage.includes('برچیدن نظر'));

  const removed = await client.call(admin, 'moderateReview', [
    { reviewId: reported.id, decision: 'remove' },
  ]);
  const [removedRow] = await sql<{ status: string }[]>`
    select status from reviews where id = ${reported.id}
  `;
  check(
    'removing hides it but keeps the row for audit',
    removed?.ok === true && removedRow.status === 'removed',
    removedRow,
  );

  const productPage = await html(`/fa/products/${encodeURIComponent(reported.productSlug)}`);
  const [bodyRow] = await sql<{ body: string | null }[]>`
    select body from reviews where id = ${reported.id}
  `;
  check(
    'and it is gone from the product page',
    !bodyRow.body || !productPage.includes(bodyRow.body),
  );

  const upheld = await client.call(admin, 'moderateReview', [
    { reviewId: reported.id, decision: 'uphold' },
  ]);
  const [upheldRow] = await sql<{ status: string }[]>`
    select status from reviews where id = ${reported.id}
  `;
  check(
    'upholding restores it to visible',
    upheld?.ok === true && upheldRow.status === 'visible',
    upheldRow,
  );

  section('Non-admins cannot call admin actions');
  const shopkeeperApprove = await client.call(shopkeeper, 'approveShop', [pending.id]);
  check(
    'a shopkeeper cannot approve a shop',
    shopkeeperApprove?.error === 'forbidden',
    shopkeeperApprove,
  );
  const shopkeeperCategory = await client.call(shopkeeper, 'saveCategory', [
    { slug: 'phase7-hostile', name: { fa: 'تلاش' } },
  ]);
  check('nor create a category', shopkeeperCategory?.error === 'forbidden', shopkeeperCategory);
  const customerModerate = await client.call(signIn(CUSTOMER), 'moderateReview', [
    { reviewId: reported.id, decision: 'remove' },
  ]);
  check(
    'a customer cannot moderate reviews',
    customerModerate?.error === 'forbidden',
    customerModerate,
  );

  /* ---------------------------------------------------------------------- */
  section('Cleanup');

  // The pending shop is the live-demo centrepiece: put it back exactly as seeded,
  // reason cleared, or the next rehearsal opens on a rejected application.
  await sql`update shops set status = 'pending', rejection_reason = null where id = ${pending.id}`;
  await sql`update products set status = 'published' where id = ${target.id}`;
  await sql`update reviews set status = 'reported' where id = ${reported.id}`;
  await sql`delete from shop_members where shop_id = ${created.data.shopId}`;
  await sql`delete from shops where id = ${created.data.shopId}`;
  await sql`delete from users where phone = ${newOwnerPhone}`;
  await sql`
    delete from notifications
    where event_key in ('shop.approved', 'shop.rejected', 'shop.invited')
      and created_at > now() - interval '15 minutes'
  `;
  /*
   * And the AUDIT ROWS this script's own actions wrote (Prompt C9).
   *
   * Scoped by the target ids captured above, never by "recent": the seeded
   * history carries today's timestamps, so a time window would delete the
   * decisions the audit page exists to show.
   */
  await sql`
    delete from admin_audit_log
    where target_id in (${pending.id}, ${created.data.shopId}, ${target.id}, ${reported.id})
  `;

  const [restored] = await sql<{ status: string; reason: string | null; pending: number }[]>`
    select s.status, s.rejection_reason as reason,
           (select count(*)::int from shops where status = 'pending') as pending
    from shops s where s.id = ${pending.id}
  `;
  check(
    'the pending shop is back exactly as seeded',
    restored.status === 'pending' && restored.reason === null && restored.pending === 1,
    restored,
  );
  const [reviewsRestored] = await sql<{ reported: number; removed: number }[]>`
    select count(*) filter (where status = 'reported')::int as reported,
           count(*) filter (where status = 'removed')::int as removed
    from reviews
  `;
  check(
    'and the moderation queue holds its two seeded reports',
    reviewsRestored.reported === 2 && reviewsRestored.removed === 0,
    reviewsRestored,
  );

  const failed = summary();
  await sql.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await sql.end();
  process.exit(1);
});
