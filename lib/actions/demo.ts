'use server';

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { revalidatePath } from 'next/cache';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { signIn } from '../auth';
import { db } from '../db';
import { pickLocale } from '../db/localized';
import {
  addresses,
  orderEvents,
  orderItems,
  orders,
  products,
  shopMembers,
  shops,
  users,
  type OrderStatus,
} from '../db/schema';
import { notificationFeed } from '../db/queries/notifications';
import { DEMO_STATUS_SEQUENCE, assertDemoMode, isDemoMode } from '../demo';
import { formatCurrency } from '../format';
import { notify, notifyMany, type NotificationEventKey } from '../notify';

/**
 * Presenter tools (PRD §9.3).
 *
 * EVERY action here starts with assertDemoMode(). A server action is reachable by
 * anyone who knows its id, whether or not a button renders it, so hiding the panel
 * is not a guard — this is. The role swap in particular mints a session from a phone
 * number with no credential, which must be impossible outside a demo build.
 *
 * These actions deliberately go through the same notify() and order_events paths as
 * the real ones. A control panel that faked state would produce a demo where the
 * notification log and the customer's timeline disagree with each other, which is
 * exactly the kind of thing an audience notices.
 */

export type DemoResult<T = undefined> =
  ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; error: string };

/* -------------------------------------------------------------------------- */
/* Notification log (Prompt 8.1)                                              */

export type LogEntry = {
  id: string;
  channel: 'sms' | 'inapp';
  locale: 'fa' | 'en' | 'ps';
  eventKey: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  recipientRole: 'customer' | 'shopkeeper' | 'admin';
  recipientName: string | null;
  recipientPhone: string | null;
};

const logFilterSchema = z.object({
  channel: z.enum(['sms', 'inapp']).optional(),
  role: z.enum(['customer', 'shopkeeper', 'admin']).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

/**
 * Feed for the log panel, polled from the client (PRD §9.2).
 *
 * A server action rather than a route handler, so there is no API surface to secure
 * separately and the poll reuses the session cookie it already has.
 */
export async function fetchNotificationLog(
  filters: z.input<typeof logFilterSchema> = {},
): Promise<DemoResult<{ entries: LogEntry[]; unread: number }>> {
  if (!isDemoMode()) return { ok: false, error: 'demo_disabled' };

  const parsed = logFilterSchema.safeParse(filters);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const rows = await notificationFeed({ ...parsed.data, limit: parsed.data.limit ?? 60 });
  const [counts] = await db
    .select({ unread: sql<number>`count(*) filter (where read = false)::int` })
    .from(sql`notifications`);

  return {
    ok: true,
    data: {
      entries: rows.map((row) => ({
        id: row.id,
        channel: row.channel,
        locale: row.locale,
        eventKey: row.eventKey,
        title: row.title,
        body: row.body,
        read: row.read,
        createdAt: row.createdAt.toISOString(),
        recipientRole: row.recipientRole,
        recipientName: row.recipientName,
        recipientPhone: row.recipientPhone,
      })),
      unread: Number(counts?.unread ?? 0),
    },
  };
}

/** Marks everything read, so the next arrival is visibly new. */
export async function markLogRead(): Promise<DemoResult> {
  if (!isDemoMode()) return { ok: false, error: 'demo_disabled' };
  const { markAllRead } = await import('../db/queries/notifications');
  await markAllRead();
  return { ok: true };
}

/** Clears read entries only — an unread arrival mid-demo is never destroyed. */
export async function clearReadLog(): Promise<DemoResult<{ removed: number }>> {
  if (!isDemoMode()) return { ok: false, error: 'demo_disabled' };

  const { notifications } = await import('../db/schema');
  const removed = await db
    .delete(notifications)
    .where(eq(notifications.read, true))
    .returning({ id: notifications.id });

  return { ok: true, data: { removed: removed.length } };
}

/* -------------------------------------------------------------------------- */
/* Role switching (Prompt 8.2 item 1)                                         */

/** Accounts the switcher offers, grouped so the panel can label them. */
export async function demoAccounts(locale: string): Promise<
  DemoResult<{
    admins: Array<{ phone: string; name: string }>;
    shopkeepers: Array<{ phone: string; name: string; shopName: string | null }>;
    customers: Array<{ phone: string; name: string }>;
  }>
> {
  if (!isDemoMode()) return { ok: false, error: 'demo_disabled' };

  const rows = await db
    .select({
      phone: users.phone,
      name: users.name,
      role: users.role,
      shopName: shops.name,
    })
    .from(users)
    .leftJoin(shopMembers, eq(shopMembers.userId, users.id))
    .leftJoin(shops, eq(shopMembers.shopId, shops.id))
    .where(eq(users.active, true))
    .orderBy(users.role, users.name);

  return {
    ok: true,
    data: {
      admins: rows
        .filter((row) => row.role === 'admin')
        .map((row) => ({ phone: row.phone, name: row.name })),
      shopkeepers: rows
        .filter((row) => row.role === 'shopkeeper')
        .map((row) => ({
          phone: row.phone,
          name: row.name,
          shopName: row.shopName ? pickLocale(row.shopName, locale) : null,
        })),
      // Six is enough to demonstrate the switch; the seed has 25.
      customers: rows
        .filter((row) => row.role === 'customer')
        .slice(0, 6)
        .map((row) => ({ phone: row.phone, name: row.name })),
    },
  };
}

/**
 * Signs the browser in as another seeded account (PRD §9.3).
 *
 * `redirect: false` is essential: signIn() otherwise throws a NEXT_REDIRECT which
 * the client would follow, losing the locale the presenter is on. The caller
 * refreshes instead, so the current page simply re-renders as the new person.
 */
export async function switchDemoUser(phone: string): Promise<DemoResult> {
  if (!isDemoMode()) return { ok: false, error: 'demo_disabled' };

  const parsed = z
    .string()
    .regex(/^07\d{8}$/)
    .safeParse(phone);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    await signIn('demo', { phone: parsed.data, redirect: false });
  } catch {
    return { ok: false, error: 'switch_failed' };
  }

  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Order scrubber (Prompt 8.2 item 2)                                         */

const scrubSchema = z.object({
  orderId: z.string().uuid(),
  direction: z.enum(['forward', 'back']),
});

const EVENT_KEYS: Record<string, NotificationEventKey> = {
  accepted: 'order.accepted',
  rejected: 'order.rejected',
  ready: 'order.ready',
  fulfilled: 'order.fulfilled',
  cancelled: 'order.cancelled',
};

/**
 * Steps an order along the happy path, or back (PRD §9.3).
 *
 * Forward writes exactly what the shopkeeper's own action writes — an order_events
 * row and a notification — so the customer's timeline and the log stay truthful.
 *
 * Back is a time machine, so it UNDOES the side effects: the event row and the
 * notification for the status being reversed are deleted. Leaving them would show
 * the customer an "order is ready" SMS for an order that is no longer ready, which
 * is worse than not being able to rewind at all.
 */
export async function scrubOrderStatus(
  input: z.input<typeof scrubSchema>,
): Promise<DemoResult<{ status: OrderStatus }>> {
  assertDemoMode();

  const parsed = scrubSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const [order] = await db
    .select({
      id: orders.id,
      reference: orders.reference,
      status: orders.status,
      fulfillment: orders.fulfillment,
      userId: orders.userId,
      total: orders.total,
    })
    .from(orders)
    .where(eq(orders.id, parsed.data.orderId))
    .limit(1);

  if (!order) return { ok: false, error: 'not_found' };

  const index = DEMO_STATUS_SEQUENCE.indexOf(order.status as never);
  // A rejected order is off the sequence entirely; scrubbing it would be a lie.
  if (index === -1) return { ok: false, error: 'off_sequence' };

  const nextIndex = parsed.data.direction === 'forward' ? index + 1 : index - 1;
  if (nextIndex < 0 || nextIndex >= DEMO_STATUS_SEQUENCE.length) {
    return { ok: false, error: 'at_end' };
  }
  const next = DEMO_STATUS_SEQUENCE[nextIndex];

  await db.update(orders).set({ status: next }).where(eq(orders.id, order.id));

  if (parsed.data.direction === 'forward') {
    await db.insert(orderEvents).values({
      orderId: order.id,
      fromStatus: order.status,
      toStatus: next,
      // Null actor: the demo panel is not a person, and order_events documents
      // exactly that case.
      actorUserId: null,
      note: null,
    });

    const [customer] = await db
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.id, order.userId))
      .limit(1);
    const locale = customer?.locale ?? 'fa';

    // The shop named is whichever shop has lines in the order; for a multi-shop
    // order the first is used, which is what the shopkeeper action does too.
    const [line] = await db
      .select({ name: shops.name })
      .from(orderItems)
      .innerJoin(shops, eq(shops.id, orderItems.shopId))
      .where(eq(orderItems.orderId, order.id))
      .limit(1);

    const eventKey = EVENT_KEYS[next];
    if (eventKey) {
      await notify({
        eventKey,
        recipientUserId: order.userId,
        recipientRole: 'customer',
        locale,
        values: {
          reference: order.reference,
          shopName: line ? pickLocale(line.name, locale) : '',
          fulfillment: order.fulfillment,
          total: formatCurrency(order.total, locale),
          reason: '',
        },
      });
    }
  } else {
    // Undo: remove the event that moved it INTO the status we just left, and the
    // notification that announced it.
    const [latest] = await db
      .select({ id: orderEvents.id })
      .from(orderEvents)
      .where(and(eq(orderEvents.orderId, order.id), eq(orderEvents.toStatus, order.status)))
      .orderBy(desc(orderEvents.createdAt))
      .limit(1);
    if (latest) await db.delete(orderEvents).where(eq(orderEvents.id, latest.id));

    const undoneKey = EVENT_KEYS[order.status];
    if (undoneKey) {
      const { notifications } = await import('../db/schema');
      await db
        .delete(notifications)
        .where(
          and(
            eq(notifications.eventKey, undoneKey),
            sql`${notifications.payload}->>'reference' = ${order.reference}`,
          ),
        );
    }
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/orders');
  revalidatePath('/account/orders');
  revalidatePath(`/account/orders/${order.reference}`);
  revalidatePath(`/checkout/confirmation/${order.reference}`);
  revalidatePath('/admin/orders');
  return { ok: true, data: { status: next } };
}

/** Orders the scrubber can act on — anything still on the happy path. */
export async function demoScrubbableOrders(): Promise<
  DemoResult<
    Array<{
      id: string;
      reference: string;
      status: OrderStatus;
      shopName: string | null;
      customerName: string;
    }>
  >
> {
  if (!isDemoMode()) return { ok: false, error: 'demo_disabled' };

  const rows = await db
    .select({
      id: orders.id,
      reference: orders.reference,
      status: orders.status,
      customerName: users.name,
      shopName: sql<string | null>`(
        select s.name->>'fa' from order_items oi
        join shops s on s.id = oi.shop_id
        where oi.order_id = orders.id limit 1
      )`,
    })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .where(inArray(orders.status, ['placed', 'accepted', 'ready']))
    .orderBy(desc(orders.createdAt))
    .limit(20);

  return { ok: true, data: rows };
}

/* -------------------------------------------------------------------------- */
/* Scenario triggers (Prompt 8.2 item 3)                                      */

/**
 * Drops a realistic order into a shop's action queue (PRD §9.3).
 *
 * Built from that shop's own published, in-stock products at their real prices, so
 * the row that slides into the queue is indistinguishable from a customer's. It
 * also fires the shopkeeper's new-order SMS, which is the second beat of the
 * notification-log demonstration.
 */
export async function triggerNewOrder(
  shopId: string,
): Promise<DemoResult<{ orderId: string; reference: string }>> {
  assertDemoMode();

  const parsed = z.string().uuid().safeParse(shopId);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const available = await db
    .select({
      id: products.id,
      title: products.title,
      price: products.price,
      discountPrice: products.discountPrice,
    })
    .from(products)
    .where(
      and(
        eq(products.shopId, parsed.data),
        eq(products.status, 'published'),
        sql`${products.stock} > 0`,
      ),
    )
    .limit(8);

  if (available.length === 0) return { ok: false, error: 'no_products' };

  // A real customer with a real address, so delivery details are not blank.
  const [customer] = await db
    .select({ id: users.id, locale: users.locale, addressId: addresses.id })
    .from(users)
    .leftJoin(addresses, eq(addresses.userId, users.id))
    .where(eq(users.role, 'customer'))
    .orderBy(sql`random()`)
    .limit(1);

  if (!customer) return { ok: false, error: 'no_customer' };

  // Two lines is enough to look real without dominating the queue row.
  const chosen = available.slice(0, Math.min(2, available.length));
  const lines = chosen.map((product) => ({
    product,
    price: product.discountPrice ?? product.price,
    quantity: 1,
  }));
  const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const deliveryFee = customer.addressId ? 150 : 0;

  /*
   * Reference numbers follow the seeded GC-##### shape so the demo reads
   * consistently; the suffix comes from a counter over existing rows rather than
   * randomness, to avoid a collision on the unique index.
   */
  /*
   * Written exactly like a real checkout: one transaction, the reference from
   * the shared sequence, and the stock RESERVED for every line.
   *
   * The reservation is not decoration. Stock is now held from placement and
   * given back on reject/cancel/hold-expiry, so an order that appears without
   * one is a unit of inventory the system will hand back that it never took —
   * cancel a demo order and the shelf count goes UP. The presenter would be
   * demonstrating the bug rather than the feature.
   */
  const created = await db.transaction(async (tx) => {
    const [{ reference }] = await tx.execute<{ reference: string }>(
      sql`select next_order_reference() as reference`,
    );

    const [order] = await tx
      .insert(orders)
      .values({
        reference,
        userId: customer.id,
        status: 'placed',
        fulfillment: customer.addressId ? 'delivery' : 'pickup',
        paymentMethod: 'cod',
        addressId: customer.addressId,
        subtotal,
        discountTotal: 0,
        deliveryFee,
        total: subtotal + deliveryFee,
      })
      .returning({ id: orders.id, reference: orders.reference });

    for (const line of lines) {
      const reserved = await tx
        .update(products)
        .set({ stock: sql`${products.stock} - ${line.quantity}` })
        .where(and(eq(products.id, line.product.id), sql`${products.stock} >= ${line.quantity}`))
        .returning({ id: products.id });

      // The basket was built from in-stock products moments ago, so this only
      // fires if something sold out in between — roll back rather than oversell.
      if (reserved.length === 0) throw new Error('demo_insufficient_stock');
    }

    await tx.insert(orderItems).values(
      lines.map((line) => ({
        orderId: order.id,
        shopId: parsed.data,
        productId: line.product.id,
        titleSnapshot: line.product.title,
        priceSnapshot: line.price,
        quantity: line.quantity,
        variantSelection: null,
      })),
    );

    return order;
  });

  await db.insert(orderEvents).values({
    orderId: created.id,
    fromStatus: null,
    toStatus: 'placed',
    actorUserId: customer.id,
    note: null,
  });

  const members = await db
    .select({ id: users.id, locale: users.locale })
    .from(shopMembers)
    .innerJoin(users, eq(shopMembers.userId, users.id))
    .where(eq(shopMembers.shopId, parsed.data));

  await notifyMany([
    // The customer's own confirmation…
    {
      eventKey: 'order.placed',
      recipientUserId: customer.id,
      recipientRole: 'customer',
      locale: customer.locale,
      values: {
        reference: created.reference,
        total: formatCurrency(subtotal + deliveryFee, customer.locale),
      },
    },
    // …and the shop's, which is the one the presenter is pointing at.
    ...members.map((member) => ({
      eventKey: 'order.newForShop' as const,
      recipientUserId: member.id,
      recipientRole: 'shopkeeper' as const,
      locale: member.locale,
      values: {
        reference: created.reference,
        itemCount: lines.length,
        total: formatCurrency(subtotal, member.locale),
      },
    })),
  ]);

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/orders');
  revalidatePath('/admin/orders');
  return { ok: true, data: { orderId: created.id, reference: created.reference } };
}

/**
 * Lands a fresh shop application in the admin pending queue (PRD §9.3).
 *
 * Creates the applicant too, since the point is a shop nobody has seen before. Named
 * with a marker so resetDemoData and the checks can find it again.
 */
export async function triggerShopRegistration(): Promise<
  DemoResult<{ shopId: string; name: string }>
> {
  assertDemoMode();

  const [{ next: seq }] = await db
    .select({ next: sql<number>`count(*)::int + 1` })
    .from(shops)
    .where(sql`slug like 'demo-applicant-%'`);

  const phone = `0798${String(100000 + seq).slice(0, 6)}`;
  const nameFa = `دکان متقاضی ${seq}`;

  const [applicant] = await db
    .insert(users)
    .values({ phone, name: `متقاضی ${seq}`, role: 'shopkeeper' })
    .onConflictDoUpdate({ target: users.phone, set: { role: 'shopkeeper' } })
    .returning({ id: users.id });

  const [category] = await db
    .select({ id: shops.categoryId })
    .from(shops)
    .where(eq(shops.status, 'approved'))
    .limit(1);

  const [created] = await db
    .insert(shops)
    .values({
      slug: `demo-applicant-${seq}`,
      name: { fa: nameFa, en: `Demo Applicant ${seq}`, ps: null },
      description: { fa: 'درخواست تازه برای بررسی مدیریت مرکز.', en: null, ps: null },
      status: 'pending',
      categoryId: category?.id ?? null,
      floor: 2,
      unitNumber: String(300 + seq),
      phone,
      hours: '9:00-19:00',
    })
    .returning({ id: shops.id });

  await db
    .insert(shopMembers)
    .values({ shopId: created.id, userId: applicant.id, role: 'owner' })
    .onConflictDoNothing();

  await notify({
    eventKey: 'shop.submitted',
    recipientUserId: null,
    recipientRole: 'admin',
    values: { shopName: nameFa },
  });

  revalidatePath('/admin');
  revalidatePath('/admin/shops');
  return { ok: true, data: { shopId: created.id, name: nameFa } };
}

/* -------------------------------------------------------------------------- */
/* Data reset (Prompt 8.2 item 4)                                             */

const run = promisify(execFile);

/**
 * Restores the seeded state (PRD §9.3).
 *
 * Shells out to the same `npm run db:reset` a developer would run, rather than
 * reimplementing truncate-and-seed here — two code paths for "put the data back"
 * would eventually disagree, and this one is the authority.
 *
 * The caller is signed out afterwards BY CONSEQUENCE, not by design: the reset drops
 * the users table, so the JWT points at a row that no longer exists. The panel says
 * so before running it.
 */
export async function resetDemoData(): Promise<DemoResult<{ output: string }>> {
  assertDemoMode();

  try {
    const { stdout, stderr } = await run('npm', ['run', 'db:reset'], {
      cwd: process.cwd(),
      // A full reseed builds 90 days of history and is genuinely slow.
      timeout: 300_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    // The tail is what a presenter needs: the seed's own summary line.
    const output = `${stdout}\n${stderr}`.trim().split('\n').slice(-6).join('\n');

    revalidatePath('/', 'layout');
    return { ok: true, data: { output } };
  } catch (error) {
    return { ok: false, error: (error as Error).message.slice(0, 300) };
  }
}

/** Shops the scenario trigger can target, so the panel can offer a picker. */
export async function demoShops(
  locale: string,
): Promise<DemoResult<Array<{ id: string; name: string; slug: string }>>> {
  if (!isDemoMode()) return { ok: false, error: 'demo_disabled' };

  const rows = await db
    .select({ id: shops.id, name: shops.name, slug: shops.slug })
    .from(shops)
    .where(eq(shops.status, 'approved'))
    .orderBy(shops.slug);

  return {
    ok: true,
    data: rows.map((row) => ({ id: row.id, name: pickLocale(row.name, locale), slug: row.slug })),
  };
}
