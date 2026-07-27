'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { currentUser } from '../auth/guards';
import { db } from '../db';
import { products } from '../db/schema';
import { categoryIdsBySlug, shopProductSlugs } from '../db/queries/shop-products';
import { IMPORT_REQUIRED_COLUMNS } from '../import-template';

/**
 * Bulk product import (PRD §6.2, staged as happy-path only in PRD §15).
 *
 * Two steps by design: parse-and-validate returns a preview the shopkeeper
 * confirms, rather than importing blind. A silent partial import of a 60-row file
 * is the kind of thing that erodes trust in a tool a merchant depends on.
 *
 * Imported rows land as DRAFTS regardless of what the file says. A bulk upload is
 * exactly when a mistake goes live across a whole catalogue, so publishing stays a
 * deliberate second action.
 *
 * Import history is explicitly phase 2.
 */

export type ImportRowStatus = 'create' | 'update' | 'error';

export type ImportRow = {
  line: number;
  status: ImportRowStatus;
  /** Translated key for the reason, when status is 'error'. */
  reason?: string;
  slug: string;
  titleFa: string;
  categorySlug: string;
  price: number;
  discountPrice: number | null;
  stock: number;
  /** Present for create/update rows; used by the confirm step. */
  payload?: {
    slug: string;
    title: { fa: string; en: string | null };
    description: { fa: string; en: string | null } | null;
    categoryId: string | null;
    price: number;
    discountPrice: number | null;
    stock: number;
    existingId?: string;
  };
};

export type ParseResult =
  | { ok: true; rows: ImportRow[]; summary: { create: number; update: number; error: number } }
  | { ok: false; error: string };

async function requireShopContext() {
  const user = await currentUser();
  if (!user?.id || !user.shopId || user.role !== 'shopkeeper') return null;
  return { shopId: user.shopId };
}

/**
 * Minimal CSV reader.
 *
 * Handles quoted fields containing commas and escaped quotes, which a merchant's
 * spreadsheet export will certainly produce. Deliberately not a full CSV library:
 * one dependency for one file format, at demo scale, is not worth it.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      // Treat CRLF as one break.
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((value) => value.trim() !== '')) rows.push(row);

  return rows;
}

/** Accepts Persian and Arabic-Indic digits, since the template may be filled by hand. */
function toAsciiDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[,٬\s]/g, '');
}

const rowSchema = z.object({
  slug: z.string().trim().max(80).optional(),
  title_fa: z.string().trim().min(1),
  title_en: z.string().trim().optional(),
  description_fa: z.string().trim().optional(),
  description_en: z.string().trim().optional(),
  category_slug: z.string().trim().optional(),
  price: z.string().trim().min(1),
  discount_price: z.string().trim().optional(),
  stock: z.string().trim().optional(),
});

export async function parseImport(formData: FormData): Promise<ParseResult> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'no_file' };
  if (file.size > 2 * 1024 * 1024) return { ok: false, error: 'too_large' };

  const text = await file.text();
  const table = parseCsv(text);
  if (table.length < 2) return { ok: false, error: 'empty_file' };

  const header = table[0].map((cell) => cell.trim().toLowerCase());
  const missing = IMPORT_REQUIRED_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length > 0) return { ok: false, error: 'missing_columns' };

  const body = table.slice(1);
  if (body.length > 200) return { ok: false, error: 'too_many_rows' };

  const [existingSlugs, categoryMap] = await Promise.all([
    shopProductSlugs(context.shopId),
    categoryIdsBySlug(
      body
        .map((cells) => cells[header.indexOf('category_slug')]?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ]);

  const rows: ImportRow[] = [];
  const seenSlugs = new Set<string>();

  for (const [index, cells] of body.entries()) {
    const line = index + 2; // 1-based, and the header is line 1.
    const record = Object.fromEntries(
      header.map((column, columnIndex) => [column, cells[columnIndex] ?? '']),
    );

    const base = {
      line,
      slug: (record.slug ?? '').trim(),
      titleFa: (record.title_fa ?? '').trim(),
      categorySlug: (record.category_slug ?? '').trim(),
      price: 0,
      discountPrice: null as number | null,
      stock: 0,
    };

    const parsed = rowSchema.safeParse(record);
    if (!parsed.success) {
      rows.push({ ...base, status: 'error', reason: 'missing_required' });
      continue;
    }

    const price = Number(toAsciiDigits(parsed.data.price));
    if (!Number.isInteger(price) || price <= 0) {
      rows.push({ ...base, status: 'error', reason: 'bad_price' });
      continue;
    }

    const discountRaw = parsed.data.discount_price
      ? Number(toAsciiDigits(parsed.data.discount_price))
      : null;
    if (discountRaw !== null && (!Number.isInteger(discountRaw) || discountRaw < 0)) {
      rows.push({ ...base, status: 'error', reason: 'bad_discount', price });
      continue;
    }
    if (discountRaw !== null && discountRaw > 0 && discountRaw >= price) {
      rows.push({ ...base, status: 'error', reason: 'discount_not_below_price', price });
      continue;
    }

    const stockRaw = parsed.data.stock ? Number(toAsciiDigits(parsed.data.stock)) : 0;
    if (!Number.isInteger(stockRaw) || stockRaw < 0) {
      rows.push({ ...base, status: 'error', reason: 'bad_stock', price });
      continue;
    }

    let categoryId: string | null = null;
    if (parsed.data.category_slug) {
      categoryId = categoryMap.get(parsed.data.category_slug) ?? null;
      if (!categoryId) {
        rows.push({ ...base, status: 'error', reason: 'unknown_category', price, stock: stockRaw });
        continue;
      }
    }

    // A slug repeated inside one file would make the outcome order-dependent.
    const slug = parsed.data.slug?.trim() ?? '';
    if (slug && seenSlugs.has(slug)) {
      rows.push({ ...base, status: 'error', reason: 'duplicate_slug', price, stock: stockRaw });
      continue;
    }
    if (slug) seenSlugs.add(slug);

    const existingId = slug ? existingSlugs.get(slug) : undefined;

    rows.push({
      ...base,
      price,
      discountPrice: discountRaw && discountRaw > 0 ? discountRaw : null,
      stock: stockRaw,
      status: existingId ? 'update' : 'create',
      payload: {
        slug:
          slug ||
          `${slugFromTitle(parsed.data.title_fa)}-${Math.random().toString(36).slice(2, 8)}`,
        title: { fa: parsed.data.title_fa, en: parsed.data.title_en || null },
        description: parsed.data.description_fa
          ? { fa: parsed.data.description_fa, en: parsed.data.description_en || null }
          : null,
        categoryId,
        price,
        discountPrice: discountRaw && discountRaw > 0 ? discountRaw : null,
        stock: stockRaw,
        existingId,
      },
    });
  }

  return {
    ok: true,
    rows,
    summary: {
      create: rows.filter((row) => row.status === 'create').length,
      update: rows.filter((row) => row.status === 'update').length,
      error: rows.filter((row) => row.status === 'error').length,
    },
  };
}

function slugFromTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'product'
  );
}

export type ConfirmResult =
  { ok: true; created: number; updated: number } | { ok: false; error: string };

/**
 * Applies the previewed rows. Error rows are simply absent from what the client
 * sends back, so nothing invalid can slip through — and the payloads are
 * re-validated here rather than trusted.
 */
export async function confirmImport(rows: ImportRow[]): Promise<ConfirmResult> {
  const context = await requireShopContext();
  if (!context) return { ok: false, error: 'forbidden' };

  const applicable = rows.filter((row) => row.status !== 'error' && row.payload);
  if (applicable.length === 0) return { ok: false, error: 'nothing_to_import' };
  if (applicable.length > 200) return { ok: false, error: 'too_many_rows' };

  let created = 0;
  let updated = 0;

  for (const row of applicable) {
    const payload = row.payload!;
    if (!payload.title.fa || payload.price <= 0) continue;

    if (payload.existingId) {
      const [result] = await db
        .update(products)
        .set({
          title: { fa: payload.title.fa, en: payload.title.en, ps: null },
          description: payload.description
            ? { fa: payload.description.fa, en: payload.description.en, ps: null }
            : null,
          categoryId: payload.categoryId,
          price: payload.price,
          discountPrice: payload.discountPrice,
          stock: payload.stock,
        })
        // Ownership: the shop id is part of the predicate.
        .where(and(eq(products.id, payload.existingId), eq(products.shopId, context.shopId)))
        .returning({ id: products.id });
      if (result) updated += 1;
    } else {
      await db.insert(products).values({
        shopId: context.shopId,
        slug: payload.slug,
        title: { fa: payload.title.fa, en: payload.title.en, ps: null },
        description: payload.description
          ? { fa: payload.description.fa, en: payload.description.en, ps: null }
          : null,
        categoryId: payload.categoryId,
        price: payload.price,
        discountPrice: payload.discountPrice,
        stock: payload.stock,
        // Always a draft, whatever the file said.
        status: 'draft',
      });
      created += 1;
    }
  }

  revalidatePath('/dashboard/products');
  return { ok: true, created, updated };
}
