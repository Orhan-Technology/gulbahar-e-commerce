import 'dotenv/config';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

import { seedBasename, storeImage } from '../lib/images';

/**
 * Generates the seeded catalogue imagery (Prompt 4.1).
 *
 * These are stand-ins with PERFECT consistency rather than attempts at realism.
 * PRD §10.7 is explicit that consistency beats realism: one background treatment,
 * one aspect ratio, no watermarks, no mixed lighting. Thirty uniform products
 * look better than eighty inconsistent ones, and a grid of these reads as a
 * deliberate catalogue rather than as scraped placeholders.
 *
 * Real photography can replace the output files 1:1 with no code change, because
 * everything goes through the same lib/images.ts storeImage() the upload form uses.
 *
 * Font note: Vazirmatn is not installed system-wide and downloading it would put
 * a network dependency inside db:reset, which the offline requirement (PRD §1.3)
 * rules out. Noto Sans Arabic is present and is the closest humanist match; it
 * shapes Dari correctly, which is what actually matters here.
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
const PALETTES = [
  { from: '#1f613f', to: '#12351f' }, // primary 700 → 900
  { from: '#2d6b47', to: '#14532d' },
  { from: '#3a5c4a', to: '#1c3327' },
  { from: '#265840', to: '#102e1f' },
  { from: '#1a5c36', to: '#0f3f24' },
  { from: '#34664b', to: '#173a28' },
  { from: '#20553a', to: '#0d2f1e' },
  { from: '#8a6408', to: '#4d3805' }, // accent gold, darkened for white text
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

  const shopNames = new Map(shops.map((shop) => [shop.slug, shop.name]));

  // Regenerate from scratch so a renamed product cannot leave an orphan file.
  const seedDir = path.join(process.cwd(), 'public', 'uploads', 'seed');
  await rm(seedDir, { recursive: true, force: true });

  console.log(`Generating imagery for ${shops.length} shops and ${products.length} products…`);

  const manifest: Record<string, unknown> = { shops: {}, products: {} };

  for (const [shopIndex, shop] of shops.entries()) {
    const palette = pickPalette(shopIndex);

    const logo = await storeImage(await sharp(logoSvg(shop.name.fa, palette)).png().toBuffer(), {
      folder: 'seed',
      basename: seedBasename(`${shop.slug}-logo`),
      maxWidth: 400,
    });

    const banner = await storeImage(
      await sharp(bannerSvg(shop.name.fa, shop.name.en, palette))
        .png()
        .toBuffer(),
      { folder: 'seed', basename: seedBasename(`${shop.slug}-banner`), maxWidth: 1600 },
    );

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
   * (PRD §5.2, §10.4).
   */
  const ANGLES = [0, 28];

  let count = 0;
  for (const [productIndex, product] of products.entries()) {
    const shopName = shopNames.get(product.shopSlug);
    const palette = pickPalette(productIndex);

    const stored: Array<{ path: string; variants: Record<number, string> }> = [];
    for (const [angleIndex, angle] of ANGLES.entries()) {
      const image = await storeImage(
        await sharp(productSvg(product.title.fa, shopName?.fa ?? '', palette, angle))
          .png()
          .toBuffer(),
        { folder: 'seed', basename: seedBasename(product.slug, angleIndex), maxWidth: 1200 },
      );
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
  console.log(`  ✓ ${count} products × ${ANGLES.length} angles`);

  const manifestPath = path.join(contentDir, 'image-manifest.json');
  await writeManifest(manifestPath, manifest);
  console.log(`  ✓ manifest written to content/seed/image-manifest.json`);
  console.log(
    `\nEach image stored as original + ${'800w and 240w'} WebP variants via lib/images.ts.\n`,
  );
}

async function writeManifest(file: string, data: unknown) {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
