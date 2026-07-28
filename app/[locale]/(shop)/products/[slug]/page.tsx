import { Suspense } from 'react';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { MapPin, Store } from 'lucide-react';

import { ImageGallery, ImageGallerySkeleton } from '@/components/custom/image-gallery';
import { RatingStars } from '@/components/custom/rating-stars';
import { SectionHeader } from '@/components/custom/section-header';
import { BuyPanel } from '@/components/shop/product/buy-panel';
import { FulfilmentPanel } from '@/components/shop/product/fulfilment-panel';
import { SpecTable } from '@/components/shop/product/spec-table';
import { RatingSummary } from '@/components/shop/product/rating-summary';
import { ReviewList } from '@/components/shop/product/review-list';
import { WriteReviewDialog } from '@/components/shop/product/write-review-dialog';
import { ProductGrid, ProductGridSkeleton } from '@/components/shop/product-grid';
import { Skeleton } from '@/components/ui/skeleton';
import { currentUser } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { wishlistedProductIds } from '@/lib/db/queries/home';
import { promotedProductsForSlot } from '@/lib/db/queries/listing';
import { productDetail } from '@/lib/db/queries/products';
import { recordImpressions } from '@/lib/db/queries/promoted';
import {
  recordProductView,
  relatedProductsFor,
  reviewableOrderItem,
  userReviewForProduct,
} from '@/lib/db/queries/reviews';
import { formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { decodeSlug } from '@/lib/utils';

/**
 * Product page — quality-bar screen #2 (PRD §10.8, §5.2).
 *
 * Built mobile-first: the buy panel appears inline in the flow AND in a sticky
 * bottom bar, because on a 390px screen the price scrolls out of view long before
 * the customer has finished reading reviews.
 */
export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ reviewPage?: string }>;
}) {
  const { locale, slug: rawSlug } = await params;
  // Non-ASCII slugs arrive percent-encoded (see decodeSlug).
  const slug = decodeSlug(rawSlug);
  setRequestLocale(locale);
  const { reviewPage } = await searchParams;
  const t = await getTranslations('product');

  const product = await productDetail(slug, locale);

  // An unpublished product, or one belonging to a shop that is not approved, must
  // not be reachable by URL (PRD §7.1).
  if (!product || product.status !== 'published' || product.shopStatus !== 'approved') {
    notFound();
  }

  const user = await currentUser();
  const [saved, entitlement, ownReview] = await Promise.all([
    wishlistedProductIds(user?.id, [product.id]),
    reviewableOrderItem(user?.id, product.id),
    user?.id ? userReviewForProduct(user.id, product.id) : Promise.resolve(null),
  ]);

  // Seeded counter is the only analytics there is (PRD §12.4); never blocks render.
  void recordProductView(product.id);

  const galleryImages = product.images.map((image) => ({
    path: image.path,
    alt: image.alt ? pickLocale(image.alt, locale) : undefined,
  }));

  const variants = product.variants.map((variant) => ({
    id: variant.id,
    name: pickLocale(variant.name, locale),
    options: variant.options.map((option) => pickLocale(option, locale)),
  }));

  const title = pickLocale(product.title, locale);
  const currentReviewPage = Math.max(1, Number(reviewPage ?? 1) || 1);

  return (
    <div className="max-w-page mx-auto px-4 py-4 pb-28 sm:px-7 sm:py-6 md:pb-6">
      {/* Breadcrumb */}
      <nav className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
        <Link href="/products" className="hover:text-primary">
          {t('breadcrumbProducts')}
        </Link>
        {product.categorySlug && product.categoryName && (
          <>
            <span>/</span>
            <Link href={`/categories/${product.categorySlug}`} className="hover:text-primary">
              {pickLocale(product.categoryName, locale)}
            </Link>
          </>
        )}
        <span>/</span>
        <span className="clamp-1 text-foreground">{title}</span>
      </nav>

      {/*
       * Thumbnail rail, main image, then a 380px buy column that STICKS: the
       * mockup's 88px | 1fr | 380px. The rail lives inside ImageGallery, which
       * owns the active-image state, so the page only has to split two ways.
       */}
      <div className="mt-4 grid items-start gap-6 lg:grid-cols-[1fr_380px] lg:gap-8">
        <Suspense fallback={<ImageGallerySkeleton />}>
          <ImageGallery images={galleryImages} title={title} aspect="square" rail="side" />
        </Suspense>

        <div className="space-y-5 lg:sticky lg:top-28">
          <div className="space-y-2">
            <h1 className="text-xl leading-snug font-bold sm:text-2xl">{title}</h1>

            {product.rating.total > 0 && (
              <div className="flex items-center gap-2">
                <RatingStars value={product.rating.average} size="sm" />
                <span className="text-muted-foreground text-sm">
                  {t('reviewCount', { count: formatNumber(product.rating.total, locale) })}
                </span>
              </div>
            )}
          </div>

          {/* Shop attribution — links to the shop page (PRD §5.2) */}
          <Link
            href={`/shops/${product.shopSlug}`}
            className="rounded-card border-border bg-card hover:shadow-card flex items-center gap-3 border p-3 transition-shadow duration-150"
          >
            <span className="rounded-control bg-primary-100 relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden">
              {product.shopLogoPath ? (
                <Image
                  src={product.shopLogoPath}
                  alt=""
                  fill
                  sizes="40px"
                  className="object-cover"
                />
              ) : (
                <Store className="text-primary-700 h-4 w-4" aria-hidden />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-foreground block truncate text-sm font-semibold">
                {pickLocale(product.shopName, locale)}
              </span>
              {product.shopFloor !== null && (
                <span className="text-muted-foreground flex items-center gap-1 text-xs">
                  <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                  {t('shopFloorUnit', {
                    floor: formatNumber(product.shopFloor, locale),
                    unit: product.shopUnitNumber ?? '—',
                  })}
                </span>
              )}
            </span>
          </Link>

          <BuyPanel
            productId={product.id}
            price={product.price}
            discountPrice={product.discountPrice}
            stock={product.stock}
            variants={variants}
            initialSaved={saved.has(product.id)}
          />

          <FulfilmentPanel floor={product.shopFloor} unitNumber={product.shopUnitNumber} />
        </div>
      </div>

      {/* Description and specs run under the gallery, clear of the buy column. */}
      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_380px] lg:gap-8">
        <div className="space-y-8">
          {product.description && (
            <section className="space-y-3">
              <h2 className="text-foreground text-xl font-bold">{t('description')}</h2>
              <p className="max-w-prose text-base leading-relaxed text-neutral-600">
                {pickLocale(product.description, locale)}
              </p>
            </section>
          )}

          {product.specs && product.specs.length > 0 && <SpecTable specs={product.specs} />}
        </div>
      </div>

      {/* Reviews */}
      <section className="mt-10 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold">{t('reviewsHeading')}</h2>
          {/*
            The form appears ONLY for a signed-in customer with a fulfilled order
            item for this product, or one editing their own review (PRD §5.5).
          */}
          {(entitlement || ownReview) && (
            <WriteReviewDialog
              productSlug={slug}
              existing={ownReview ? { rating: ownReview.rating, body: ownReview.body } : null}
            />
          )}
        </div>

        <RatingSummary
          average={product.rating.average}
          total={product.rating.total}
          distribution={product.rating.distribution}
        />

        <Suspense fallback={<ReviewsSkeleton />}>
          <ReviewList productId={product.id} slug={slug} page={currentReviewPage} />
        </Suspense>
      </section>

      {/* Related */}
      <Suspense fallback={<ProductGridSkeleton count={8} />}>
        <RelatedProducts
          productId={product.id}
          shopId={product.shopId}
          categoryId={product.categoryId}
        />
      </Suspense>

      {/* Sticky mobile action bar (PRD §5.2) — sits above the tab bar. */}
      <div className="border-border bg-background/95 fixed inset-x-0 bottom-16 z-30 border-t p-3 backdrop-blur-md md:hidden">
        <BuyPanel
          compact
          productId={product.id}
          price={product.price}
          discountPrice={product.discountPrice}
          stock={product.stock}
          variants={variants}
          initialSaved={saved.has(product.id)}
        />
      </div>
    </div>
  );
}

async function RelatedProducts({
  productId,
  shopId,
  categoryId,
}: {
  productId: string;
  shopId: string;
  categoryId: string | null;
}) {
  const t = await getTranslations('product');

  const [related, promoted, user] = await Promise.all([
    relatedProductsFor(productId, shopId, categoryId, 10),
    promotedProductsForSlot('product_related', { excludeProductId: productId }),
    currentUser(),
  ]);

  const promotedIds = new Set(promoted.map((item) => item.id));
  const organic = related.filter((item) => !promotedIds.has(item.id));

  if (organic.length === 0 && promoted.length === 0) return null;

  const saved = await wishlistedProductIds(user?.id, [
    ...promoted.map((i) => i.id),
    ...organic.map((i) => i.id),
  ]);

  void recordImpressions(promoted.map((item) => item.campaignId));

  /*
   * Promoted items lead the SAME grid rather than sitting in their own tinted
   * panel. The panel held a single card at full width, and it repeated the
   * Sponsored marker the card already carries — the disclosure belongs on the
   * item, which is what PRD §8.4 asks for and what the mockup draws.
   */
  const items = [...promoted.map((item) => ({ ...item, sponsored: true })), ...organic];

  return (
    <section className="mt-10 space-y-5">
      <SectionHeader title={t('relatedHeading')} description={t('relatedHint')} />
      <ProductGrid items={items} savedIds={saved} layout="row" />
    </section>
  );
}

function ReviewsSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="rounded-card border-border bg-card space-y-2 border p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug: rawSlug } = await params;
  // Non-ASCII slugs arrive percent-encoded (see decodeSlug).
  const slug = decodeSlug(rawSlug);
  const product = await productDetail(slug, locale);
  if (!product) return {};
  return {
    title: pickLocale(product.title, locale),
    description: product.description ? pickLocale(product.description, locale) : undefined,
  };
}
