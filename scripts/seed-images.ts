import 'dotenv/config';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

import { seedBasename, storeImage } from '../lib/images';

/**
 * Generates the seeded catalogue imagery (Prompt 4.1, PRD §10.7).
 *
 * Every product and shop banner is a real photograph, hand-mapped in
 * content/seed/photos.json to a validated Unsplash photo id (each id was
 * checked to exist AND eyeballed against its product — several "obvious"
 * candidates turned out to be broccoli, a MacBook, a watermelon). Photos are
 * fetched once into content/seed/photo-cache/ and committed, so db:reset stays
 * fully offline (PRD §1.3) — the network is touched only for a photo whose
 * cache file is missing.
 *
 * Both derived angles and the banner crop come from the SAME cached original:
 * angle 0 is the full attention-weighted square, angle 1 a 1.3× zoom of it, so
 * the gallery rail shows two genuinely different framings without a second
 * source photo. Everything still goes through the same lib/images.ts
 * storeImage() the upload form uses, and basenames are deterministic — so
 * regenerating imagery never requires touching the database.
 *
 * If a photo cannot be resolved at all (no cache, no network), the previous
 * SVG placeholder is generated for that one item and the run continues: a demo
 * machine that has never been online still gets a complete catalogue.
 *
 * Font note (for the fallback SVGs): Vazirmatn is not installed system-wide and
 * downloading it would put a network dependency inside db:reset. Noto Sans
 * Arabic is present and shapes Dari correctly, which is what actually matters.
 */

const ARABIC_FONT = 'Noto Sans Arabic';
const LATIN_FONT = 'DejaVu Sans';

/**
 * Palette drawn from the design tokens so imagery sits inside the system.
 *
 * Deliberately weighted: seven green variants to one gold. Gold is the accent and
 * PRD §10.1 says it is used sparingly — an even split put it on ~40% of the
 * catalogue, which made gold read as a second brand colour rather than a highlight
 * (and carries white text less cleanly). One in eight keeps it as punctuation.
 */
/*
 * Monogram gradients for shops with no uploaded logo. Every one is a shade of
 * the brand blue, plus one of the sale red — a directory of fourteen shops in a
 * single flat colour reads as unfinished, and these are the only place in the
 * product where a colour is chosen for variety rather than for meaning.
 *
 * All are dark enough to carry white text at 700 weight, which is the only
 * hard constraint: the monogram IS the logo for these shops.
 */
const PALETTES = [
  { from: '#0b57d0', to: '#0b3c8c' }, // primary 600 → 800
  { from: '#0a49ad', to: '#0d3370' },
  { from: '#2f5aa8', to: '#132f66' },
  { from: '#1d4fb5', to: '#0a2a63' },
  { from: '#3b74e6', to: '#0b57d0' },
  { from: '#164a9e', to: '#0d2c5e' },
  { from: '#27599c', to: '#10305f' },
  { from: '#a51e3a', to: '#5c1020' }, // sale red, darkened for white text
];

type ShopSeed = {
  slug: string;
  name: { fa: string; en: string };
};

type ProductSeed = {
  slug: string;
  shopSlug: string;
  title: { fa: string; en: string };
};

type PhotoMap = {
  products: Record<string, string>;
  banners: Record<string, string>;
};

/**
 * Where fetched originals live. COMMITTED, not gitignored: ~20MB buys a
 * db:reset that works with the network cable pulled out, which is the demo's
 * whole operating assumption.
 */
const PHOTO_CACHE_DIR = path.join(process.cwd(), 'content', 'seed', 'photo-cache');

/**
 * `fm=jpg` is load-bearing: without it the CDN content-negotiates and a Node
 * fetch can be handed AVIF, which round-trips through sharp fine today but
 * makes the cache format depend on what Unsplash felt like serving.
 */
function photoUrl(id: string): string {
  return `https://images.unsplash.com/${id}?fm=jpg&w=1600&q=80&fit=max`;
}

/**
 * Returns the cached original for a photo id, fetching it on a cache miss.
 * Returns null when the photo is unreachable — the caller falls back to SVG.
 */
async function resolvePhoto(id: string): Promise<Buffer | null> {
  const cached = path.join(PHOTO_CACHE_DIR, `${id}.jpg`);
  try {
    return await readFile(cached);
  } catch {
    // cache miss — fall through to the network
  }
  try {
    const response = await fetch(photoUrl(id), { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    // Refuse to cache an error page: a jpeg this small is not a photo.
    if (buffer.length < 10_000) throw new Error(`suspiciously small (${buffer.length}B)`);
    await mkdir(PHOTO_CACHE_DIR, { recursive: true });
    await writeFile(cached, buffer);
    return buffer;
  } catch (error) {
    console.warn(`  ⚠ photo ${id} unavailable (${(error as Error).message}) — SVG fallback`);
    return null;
  }
}

/** Attention-weighted square crop — the product's primary image. */
async function squareCrop(photo: Buffer): Promise<Buffer> {
  return sharp(photo)
    .resize(1200, 1200, { fit: 'cover', position: sharp.strategy.attention })
    .jpeg({ quality: 88 })
    .toBuffer();
}

/**
 * The second gallery "angle": a 1.3× zoom of the same crop. Resizing larger and
 * extracting the centre keeps the salient region (attention already centred it)
 * while framing it noticeably tighter than angle 0.
 */
async function zoomCrop(photo: Buffer): Promise<Buffer> {
  return sharp(photo)
    .resize(1560, 1560, { fit: 'cover', position: sharp.strategy.attention })
    .extract({ left: 180, top: 180, width: 1200, height: 1200 })
    .jpeg({ quality: 88 })
    .toBuffer();
}

/** Wide banner crop for shop pages. */
async function bannerCrop(photo: Buffer): Promise<Buffer> {
  return sharp(photo)
    .resize(1600, 600, { fit: 'cover', position: sharp.strategy.attention })
    .jpeg({ quality: 85 })
    .toBuffer();
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Wraps Dari text across lines. Counts characters rather than measuring glyphs —
 * exact metrics are unavailable without a text-shaping pass, and at these sizes a
 * character budget keeps every title inside the frame.
 */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);

  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = `${lines[maxLines - 1]}…`;
  }
  return lines;
}

/**
 * Assigns palettes by position with a stride coprime to the palette count.
 *
 * An earlier version hashed the slug, but `hash % 8` only reads the low bits and
 * clustered badly — gold landed on ~37% of the catalogue instead of the intended
 * 12.5%. Index-and-stride guarantees an exactly even spread while still varying
 * adjacent tiles in a grid, and stays deterministic across runs.
 */
function pickPalette(index: number) {
  const stride = 3; // coprime with PALETTES.length (8), so it visits all of them
  return PALETTES[(index * stride) % PALETTES.length];
}

/**
 * 1:1 product image at 1200px (PRD §10.7 aspect and quality standard).
 * Dari title centred, shop name small beneath, on a single-treatment gradient.
 */
function productSvg(
  title: string,
  shopName: string,
  palette: { from: string; to: string },
  /** Rotation of the accent square, giving each product a second "angle". */
  angle = 0,
): Buffer {
  const size = 1200;
  const lines = wrap(title, 22, 3);
  const lineHeight = 78;
  const blockTop = size / 2 - ((lines.length - 1) * lineHeight) / 2;

  const titleLines = lines
    .map(
      (line, index) =>
        `<text x="${size / 2}" y="${blockTop + index * lineHeight}" font-family="${ARABIC_FONT}"
           font-size="62" font-weight="600" fill="#ffffff" text-anchor="middle"
           direction="rtl" dominant-baseline="middle">${escapeXml(line)}</text>`,
    )
    .join('\n');

  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.from}"/>
      <stop offset="100%" stop-color="${palette.to}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  <!-- One consistent geometric motif, never a fake product silhouette. -->
  <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.33}" fill="#ffffff" opacity="0.07"/>
  <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.24}" fill="#ffffff" opacity="0.05"/>
  <rect x="${size * 0.34}" y="${size * 0.34}" width="${size * 0.32}" height="${size * 0.32}"
        rx="${size * 0.05}" fill="#ffffff" opacity="0.05"
        transform="rotate(${angle} ${size / 2} ${size / 2})"/>
  ${titleLines}
  <text x="${size / 2}" y="${size - 96}" font-family="${ARABIC_FONT}" font-size="38"
        fill="#ffffff" opacity="0.72" text-anchor="middle" direction="rtl"
        dominant-baseline="middle">${escapeXml(shopName)}</text>
  <rect x="0" y="${size - 10}" width="${size}" height="10" fill="#ffffff" opacity="0.14"/>
</svg>`);
}

/** Shop logo: monogram on the primary colour. */
function logoSvg(name: string, palette: { from: string; to: string }): Buffer {
  const size = 400;
  // First letter of the Dari name, which reads correctly as a monogram in RTL.
  const monogram = Array.from(name.trim())[0] ?? '؟';

  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.from}"/>
      <stop offset="100%" stop-color="${palette.to}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  <text x="${size / 2}" y="${size / 2}" font-family="${ARABIC_FONT}" font-size="210"
        font-weight="700" fill="#ffffff" text-anchor="middle"
        dominant-baseline="central">${escapeXml(monogram)}</text>
</svg>`);
}

/** Shop banner: wide gradient with the shop name. */
function bannerSvg(nameFa: string, nameEn: string, palette: { from: string; to: string }): Buffer {
  const width = 1600;
  const height = 500;

  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0.6">
      <stop offset="0%" stop-color="${palette.from}"/>
      <stop offset="100%" stop-color="${palette.to}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <circle cx="${width * 0.82}" cy="${height * 0.3}" r="${height * 0.55}" fill="#ffffff" opacity="0.06"/>
  <circle cx="${width * 0.12}" cy="${height * 0.85}" r="${height * 0.4}" fill="#ffffff" opacity="0.05"/>
  <text x="${width / 2}" y="${height / 2 - 26}" font-family="${ARABIC_FONT}" font-size="72"
        font-weight="700" fill="#ffffff" text-anchor="middle" direction="rtl"
        dominant-baseline="middle">${escapeXml(nameFa)}</text>
  <text x="${width / 2}" y="${height / 2 + 52}" font-family="${LATIN_FONT}" font-size="34"
        fill="#ffffff" opacity="0.75" text-anchor="middle"
        dominant-baseline="middle">${escapeXml(nameEn)}</text>
</svg>`);
}

async function main() {
  const contentDir = path.join(process.cwd(), 'content', 'seed');
  const shops = JSON.parse(
    await readFile(path.join(contentDir, 'shops.json'), 'utf8'),
  ) as ShopSeed[];
  const products = JSON.parse(
    await readFile(path.join(contentDir, 'products.json'), 'utf8'),
  ) as ProductSeed[];
  const photos = JSON.parse(
    await readFile(path.join(contentDir, 'photos.json'), 'utf8'),
  ) as PhotoMap;

  const shopNames = new Map(shops.map((shop) => [shop.slug, shop.name]));

  // Regenerate from scratch so a renamed product cannot leave an orphan file.
  const seedDir = path.join(process.cwd(), 'public', 'uploads', 'seed');
  await rm(seedDir, { recursive: true, force: true });

  console.log(`Generating imagery for ${shops.length} shops and ${products.length} products…`);

  const manifest: Record<string, unknown> = { shops: {}, products: {} };
  let svgFallbacks = 0;

  for (const [shopIndex, shop] of shops.entries()) {
    const palette = pickPalette(shopIndex);

    // Logos stay as monogram SVGs deliberately: a photo makes a poor 40px mark,
    // a single letter in the brand green reads like an actual shop identity.
    const logo = await storeImage(await sharp(logoSvg(shop.name.fa, palette)).png().toBuffer(), {
      folder: 'seed',
      basename: seedBasename(`${shop.slug}-logo`),
      maxWidth: 400,
    });

    const photo = photos.banners[shop.slug]
      ? await resolvePhoto(photos.banners[shop.slug])
      : null;
    if (!photo) svgFallbacks += 1;
    const bannerBuffer = photo
      ? await bannerCrop(photo)
      : await sharp(bannerSvg(shop.name.fa, shop.name.en, palette)).png().toBuffer();

    const banner = await storeImage(bannerBuffer, {
      folder: 'seed',
      basename: seedBasename(`${shop.slug}-banner`),
      maxWidth: 1600,
    });

    (manifest.shops as Record<string, unknown>)[shop.slug] = {
      logoPath: logo.path,
      bannerPath: banner.path,
    };
  }
  console.log(`  ✓ ${shops.length} shop logos and banners`);

  /*
   * Two angles per product. A single image left the gallery's thumbnail rail and
   * zoom affordance with nothing to show, and the product page is quality-bar
   * screen #2 — the rail is part of what makes it read as a real catalogue
   * (PRD §5.2, §10.4). With photos the second angle is a tighter crop of the
   * same shot; the SVG fallback keeps its rotated-motif variant.
   */
  const SVG_ANGLES = [0, 28];

  let count = 0;
  for (const [productIndex, product] of products.entries()) {
    const shopName = shopNames.get(product.shopSlug);
    const palette = pickPalette(productIndex);

    const photo = photos.products[product.slug]
      ? await resolvePhoto(photos.products[product.slug])
      : null;
    if (!photo) svgFallbacks += 1;

    const angleBuffers = photo
      ? [await squareCrop(photo), await zoomCrop(photo)]
      : await Promise.all(
          SVG_ANGLES.map((angle) =>
            sharp(productSvg(product.title.fa, shopName?.fa ?? '', palette, angle))
              .png()
              .toBuffer(),
          ),
        );

    const stored: Array<{ path: string; variants: Record<number, string> }> = [];
    for (const [angleIndex, buffer] of angleBuffers.entries()) {
      const image = await storeImage(buffer, {
        folder: 'seed',
        basename: seedBasename(product.slug, angleIndex),
        maxWidth: 1200,
      });
      stored.push({ path: image.path, variants: image.variants });
    }

    (manifest.products as Record<string, unknown>)[product.slug] = {
      path: stored[0].path,
      variants: stored[0].variants,
      images: stored.map((entry) => entry.path),
    };
    count += 1;
    if (count % 25 === 0) console.log(`  … ${count}/${products.length} products`);
  }
  console.log(`  ✓ ${count} products × 2 angles`);
  if (svgFallbacks > 0) {
    console.warn(
      `  ⚠ ${svgFallbacks} item(s) fell back to SVG placeholders — run again online to fetch photos.`,
    );
  }

  const manifestPath = path.join(contentDir, 'image-manifest.json');
  await writeManifest(manifestPath, manifest);
  console.log(`  ✓ manifest written to content/seed/image-manifest.json`);
  console.log(
    `\nEach image stored as original + ${'800w and 240w'} WebP variants via lib/images.ts.\n`,
  );
}

async function writeManifest(file: string, data: unknown) {
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
