import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';

/**
 * Local image storage (PRD §12.3). No object storage, no CDN — files land on the
 * filesystem under public/uploads and are served by Next directly.
 *
 * The seed pipeline calls this exact function, so seeded and user-uploaded images
 * are indistinguishable to the UI (Prompt 4.1). That also means real photography
 * can replace the generated files 1:1 later with no code change.
 *
 * Three WebP variants per image, sized to how the UI actually consumes them:
 *   original — product page gallery and zoom
 *   800w     — product page main image, shop banners
 *   240w     — card thumbnails and the dashboard's product table
 */

export const UPLOAD_ROOT = path.join(process.cwd(), 'public', 'uploads');

/** Widths generated for every stored image. */
export const VARIANT_WIDTHS = [800, 240] as const;

export type StoredImage = {
  /** Public path for the full-size WebP, e.g. /uploads/seed/abc.webp */
  path: string;
  /** Public path per width, e.g. { 800: '/uploads/seed/abc-800.webp' } */
  variants: Record<number, string>;
  width: number;
  height: number;
};

export type StoreImageOptions = {
  /** Subdirectory under public/uploads, e.g. 'seed' or 'products'. */
  folder?: string;
  /** Base filename without extension. Defaults to a random uuid. */
  basename?: string;
  /** Cap on the stored original's longest edge. */
  maxWidth?: number;
  quality?: number;
};

/**
 * Writes an image and its variants, returning public paths.
 *
 * Called by the seed pipeline and by the shopkeeper's product upload form
 * (Phase 6.2). Callers persist `path` on product_images and let the UI pick a
 * variant via the `sizes` attribute.
 */
export async function storeImage(
  input: Buffer,
  options: StoreImageOptions = {},
): Promise<StoredImage> {
  const { folder = 'products', basename = randomUUID(), maxWidth = 1200, quality = 82 } = options;

  const targetDir = path.join(UPLOAD_ROOT, folder);
  await mkdir(targetDir, { recursive: true });

  const base = sharp(input).rotate(); // honours EXIF orientation from phone photos
  const meta = await base.metadata();

  const originalBuffer = await base
    .clone()
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();

  await writeFile(path.join(targetDir, `${basename}.webp`), originalBuffer);
  const stored = await sharp(originalBuffer).metadata();

  const variants: Record<number, string> = {};
  for (const width of VARIANT_WIDTHS) {
    const buffer = await sharp(originalBuffer)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
    const name = `${basename}-${width}.webp`;
    await writeFile(path.join(targetDir, name), buffer);
    variants[width] = publicPath(folder, name);
  }

  return {
    path: publicPath(folder, `${basename}.webp`),
    variants,
    width: stored.width ?? meta.width ?? maxWidth,
    height: stored.height ?? meta.height ?? maxWidth,
  };
}

function publicPath(folder: string, name: string): string {
  return `/uploads/${folder}/${name}`.replace(/\/+/g, '/');
}

/**
 * Deterministic basename from a slug, so re-running the seed overwrites the same
 * files instead of accumulating orphans.
 */
export function seedBasename(slug: string, index = 0): string {
  const hash = createHash('sha1').update(`${slug}:${index}`).digest('hex').slice(0, 8);
  return `${slug}-${index}-${hash}`;
}

/** Rejects anything that is not a raster image the pipeline can handle. */
export async function assertSupportedImage(input: Buffer): Promise<void> {
  const meta = await sharp(input).metadata();
  const supported = ['jpeg', 'png', 'webp', 'avif', 'tiff', 'gif', 'svg'];
  if (!meta.format || !supported.includes(meta.format)) {
    throw new Error(`Unsupported image format: ${meta.format ?? 'unknown'}`);
  }
}
