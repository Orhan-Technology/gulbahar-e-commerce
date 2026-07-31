import { Suspense } from 'react';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { MapPin, Store } from 'lucide-react';

import { ImageGallery, ImageGallerySkeleton } from '@/components/custom/image-gallery';
import { RatingStars } from '@/components/custom/rating-stars';
import { VerifiedBadge } from '@/components/shop/verified-badge';
import { BuyColumn } from '@/components/shop/product/buy-column';
import { BuyPanel } from '@/components/shop/product/buy-panel';
import { FulfilmentPanel } from '@/components/shop/product/fulfilment-panel';
import { FeatureList } from '@/components/shop/product/feature-list';
import { ComparisonTable, type ComparisonColumn } from '@/components/shop/product/comparison-table';
import { QuestionSection } from '@/components/shop/product/question-section';
import { SpecTable } from '@/components/shop/product/spec-table';
import { RatingSummary } from '@/components/shop/product/rating-summary';
import { ReviewList } from '@/components/shop/product/review-list';
import { WriteReviewDialog } from '@/components/shop/product/write-review-dialog';
import { ProductRails } from '@/components/shop/product/product-rails';
import { ProductGridSkeleton } from '@/components/shop/product-grid';
import { Skeleton } from '@/components/ui/skeleton';
import { currentUser } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { wishlistedProductIds } from '@/lib/db/queries/home';
import { comparableProducts } from '@/lib/db/queries/comparison';
import { productDetail } from '@/lib/db/queries/products';
import { productQuestionThreads } from '@/lib/db/queries/questions';
import {
  recordProductView,
  reviewableOrderItem,
  userReviewForProduct,
} from '@/lib/db/queries/reviews';
import { formatNumber, formatUnitNumber } from '@/lib/format';
import { SPEC_GROUPS, specTemplateFor } from '@/lib/product-templates';
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
    blurDataUrl: image.blurDataUrl,
  }));

  const variants = product.variants.map((variant) => ({
    id: variant.id,
    name: pickLocale(variant.name, locale),
    options: variant.options.map((option) => pickLocale(option, locale)),
  }));

  const title = pickLocale(product.title, locale);

  /*
   * Localised HERE, on the server. The spec table and the feature list are
   * client components (they collapse and filter), and handing them the raw
   * LocalizedText would mean shipping every locale's copy of every row to the
   * browser and picking one there.
   */
  const specRows = (product.attributes ?? []).map((row) => ({
    key: row.key,
    label: pickLocale(row.label, locale),
    value: pickLocale(row.value, locale),
    group: row.group,
  }));

  // Only the groups this product actually uses, in template order — a chip that
  // filters to nothing is worse than no chip.
  const usedGroups = new Set(specRows.map((row) => row.group).filter(Boolean));
  const specGroups = specTemplateFor(product.categorySlug)
    .map((entry) => entry.group)
    .filter((group, index, all): group is string => Boolean(group) && all.indexOf(group) === index)
    .filter((group) => usedGroups.has(group))
    .map((group) => ({ key: group, label: pickLocale(SPEC_GROUPS[group] ?? { fa: group }, locale) }));

  const features = (product.features ?? []).map((feature) => ({
    title: pickLocale(feature.title, locale),
    body: pickLocale(feature.body, locale),
  }));
  const currentReviewPage = Math.max(1, Number(reviewPage ?? 1) || 1);

  return (
    /* The old pb-28 reserved space under the FIXED action bar. It is sticky
       now, so it occupies its own flow space and the reservation is gone. */
    <div className="max-w-page mx-auto px-4 py-4 sm:px-7 sm:py-6 md:pb-6">
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
       * ONE grid for the whole page body: gallery, description, features,
       * specifications and reviews down the main column, and a 380px buy column
       * beside it that sticks (Prompt P2).
       *
       * It used to be three stacked grids, which meant the sticky buy box only
       * stuck for as long as the gallery row lasted — it vanished the moment
       * the reader reached the specifications, which is exactly when they are
       * deciding. A sticky element cannot outlive its containing block, so the
       * containing block had to become the page.
       *
       * The rails below stay OUTSIDE it, full width: they are discovery, not
       * part of this product, and a 380px gutter beside them would waste the
       * width four cards need.
       */}
      <div className="mt-4 grid items-start gap-6 lg:grid-cols-[1fr_380px] lg:gap-8">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          {/*
            The line the buy box watches: once this has scrolled past the
            header, the box condenses.

            INSIDE the gallery wrapper, not a grid item of its own. As its own
            item it was auto-placed into a third row — after everything with an
            explicit row — and sat at the BOTTOM of the page, so the observer
            fired only when the reader had already reached the end.
          */}
          <div id="pdp-top" aria-hidden className="h-0" />

          <Suspense fallback={<ImageGallerySkeleton />}>
            <ImageGallery images={galleryImages} title={title} aspect="square" rail="side" />
          </Suspense>
        </div>

        {/*
          DOM ORDER IS THE MOBILE ORDER: gallery, then the buy box, then
          everything else. On a phone the single column follows the source, so
          the price and the add-to-cart button sit where they always did —
          directly under the photograph — and the explicit row placement below
          only applies from `lg`, where the buy box moves into its own column
          and spans both rows so it can stick for the whole page.
        */}
        <BuyColumn
          className="lg:col-start-2 lg:row-span-2 lg:row-start-1"
          anchorId="pdp-top"
          thumbnail={product.images[0]?.path ?? null}
          title={title}
          header={
            <div className="space-y-2">
              <h1 className="text-xl leading-snug font-bold sm:text-2xl">{title}</h1>

              {/* Brand and model, when the shop filled them (P1). One line, muted
                  — it is identification, not a claim. */}
              {product.brand && (
                <p className="text-muted-foreground text-sm">
                  {product.model
                    ? t('brandModel', { brand: product.brand, model: product.model })
                    : product.brand}
                </p>
              )}

              {product.rating.total > 0 && (
                /* The rating LINKS to the reviews it summarises. It was a static
                   line, which made the one number on the page most likely to be
                   questioned the one thing you could not click. */
                <a href="#reviews" className="group flex w-fit items-center gap-2">
                  <RatingStars value={product.rating.average} size="sm" />
                  <span className="text-muted-foreground group-hover:text-primary text-sm underline-offset-2 group-hover:underline">
                    {t('reviewCount', { count: formatNumber(product.rating.total, locale) })}
                  </span>
                </a>
              )}
            </div>
          }
          shop={
            /* Shop attribution — our version of "sold by", and better, because it
               carries the floor and unit you would walk to (PRD §5.2). */
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
                <span className="text-foreground flex items-center gap-1 truncate text-sm font-semibold">
                  {pickLocale(product.shopName, locale)}
                  {/* The mall's own confirmation, where the buyer is deciding
                      whether to trust this seller (Prompt C7). */}
                  <VerifiedBadge
                    verifiedAt={product.shopVerifiedAt ? product.shopVerifiedAt.toISOString() : null}
                    size="sm"
                  />
                </span>
                {product.shopFloor !== null && (
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                    {t('shopFloorUnit', {
                      floor: formatNumber(product.shopFloor, locale),
                      unit: formatUnitNumber(product.shopUnitNumber, locale) || '—',
                    })}
                  </span>
                )}
              </span>
            </Link>
          }
          extras={
            <>
              <FulfilmentPanel floor={product.shopFloor} unitNumber={product.shopUnitNumber} />

              {/* Where to go when something is wrong — the one question the buy
                  box could not answer before. A real destination, not a modal. */}
              <p className="text-muted-foreground text-xs">
                {t.rich('helpLine', {
                  link: (chunks) => (
                    <Link href="/account/support" className="text-primary hover:underline">
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            </>
          }
        >
          <BuyPanel
            productId={product.id}
            price={product.price}
            discountPrice={product.discountPrice}
            stock={product.stock}
            variants={variants}
            initialSaved={saved.has(product.id)}
          />
        </BuyColumn>

        <div className="min-w-0 space-y-10 lg:col-start-1 lg:row-start-2">
          {product.description && (
            <section className="space-y-3">
              <h2 className="text-foreground text-xl font-bold">{t('description')}</h2>
              <p className="max-w-prose text-base leading-relaxed text-neutral-600">
                {pickLocale(product.description, locale)}
              </p>
            </section>
          )}

          <FeatureList features={features} />

          <SpecTable rows={specRows} groups={specGroups} />

          {/* Absent, not empty, when there is nothing to compare — see
              ComparisonTable's eligibility rules. */}
          <Suspense fallback={<ComparisonSkeleton />}>
            <ComparisonSection
              productId={product.id}
              categoryId={product.categoryId}
              locale={locale}
              current={{
                id: product.id,
                slug,
                title,
                imagePath: product.images[0]?.path ?? null,
                blurDataUrl: product.images[0]?.blurDataUrl ?? null,
                shopName: pickLocale(product.shopName, locale),
                shopFloor: product.shopFloor,
                shopUnitNumber: product.shopUnitNumber,
                price: product.price,
                discountPrice: product.discountPrice,
                rating: product.rating.average,
                reviewCount: product.rating.total,
                values: Object.fromEntries(specRows.map((row) => [row.key, row.value])),
                labels: Object.fromEntries(specRows.map((row) => [row.key, row.label])),
                current: true,
              }}
            />
          </Suspense>

          {/* Reviews */}
          <section id="reviews" className="scroll-mt-24 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-bold">{t('reviewsHeading')}</h2>
              {/*
                The form appears ONLY for a signed-in customer with a fulfilled
                order item for this product, or one editing their own review
                (PRD §5.5).
              */}
              {(entitlement || ownReview) && (
                <WriteReviewDialog
                  productSlug={slug}
                  existing={
                    ownReview ? { rating: ownReview.rating, body: ownReview.body } : null
                  }
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

          {/* Questions and answers — always present, never hidden when empty. */}
          <Suspense fallback={<QuestionsSkeleton />}>
            <QuestionSectionLoader
              productId={product.id}
              productSlug={slug}
              shopName={pickLocale(product.shopName, locale)}
            />
          </Suspense>
        </div>

      </div>

      {/* Three discovery rails (Prompt P5) — full width, outside the buy grid. */}
      <Suspense fallback={<ProductGridSkeleton count={5} layout="row" />}>
        <ProductRails
          productId={product.id}
          shopId={product.shopId}
          categoryId={product.categoryId}
          price={product.discountPrice ?? product.price}
        />
      </Suspense>

      {/*
        Sticky mobile action bar (PRD §5.2) — sits above the tab bar.

        `sticky`, not `fixed`, and that is load-bearing rather than stylistic.
        The storefront shell wraps its content in StretchScroll, which applies a
        transform during an overscroll; a transform makes its element the
        containing block for every FIXED descendant, so a fixed bar would leave
        the viewport and reappear thousands of pixels down the page for as long
        as the gesture lasted. A sticky element keeps its scrollport and simply
        stretches with the content, which is what a native app does with it.

        Pinned identically the whole way down — the containing block is the page
        root, which spans the document — and it lands in flow at the very end.
        The negative inline margins cancel the page gutter so it stays
        full-bleed; the bar is `md:hidden`, so the container is always the
        viewport width where it renders.
      */}
      <div className="border-border bg-background/95 sticky bottom-16 z-30 -mx-4 mt-10 border-t p-3 backdrop-blur-md sm:-mx-7 md:hidden">
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

/**
 * Loads the comparison set (Prompt P3).
 *
 * Its own Suspense boundary because it is the one section on this page that
 * needs a second round trip after the product itself — the spec table and the
 * features are already in hand, and blocking them behind a similar-products
 * query would delay the content the reader asked for.
 */
/**
 * Loads the Q&A threads for the viewer (Prompt P4).
 *
 * The VIEWER decides what is in the list — a pending question belongs to its
 * author and to the shop — so this cannot be hoisted into the page's parallel
 * fetch without also hoisting the session read it depends on.
 */
async function QuestionSectionLoader({
  productId,
  productSlug,
  shopName,
}: {
  productId: string;
  productSlug: string;
  shopName: string;
}) {
  const viewer = await currentUser();
  const threads = await productQuestionThreads(
    productId,
    viewer?.id ?? null,
    viewer?.shopId ?? null,
  );

  return (
    <QuestionSection
      productSlug={productSlug}
      shopName={shopName}
      signedIn={Boolean(viewer?.id)}
      threads={threads.map((thread) => ({
        ...thread,
        createdAt: thread.createdAt.toISOString(),
        answer: thread.answer
          ? { body: thread.answer.body, createdAt: thread.answer.createdAt.toISOString() }
          : null,
      }))}
    />
  );
}

function QuestionsSkeleton() {
  return (
    <div className="space-y-3" aria-busy>
      <Skeleton className="h-5 w-40" />
      <Skeleton className="rounded-card h-28 w-full" />
      <Skeleton className="rounded-card h-20 w-full" />
    </div>
  );
}

async function ComparisonSection({
  productId,
  categoryId,
  locale,
  current,
}: {
  productId: string;
  categoryId: string | null;
  locale: string;
  current: ComparisonColumn;
}) {
  const others = await comparableProducts(productId, categoryId, current.discountPrice ?? current.price);

  const columns: ComparisonColumn[] = [
    current,
    ...others.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: pickLocale(row.title, locale),
      imagePath: row.imagePath,
      blurDataUrl: row.blurDataUrl,
      shopName: pickLocale(row.shopName, locale),
      shopFloor: row.shopFloor,
      shopUnitNumber: row.shopUnitNumber,
      price: row.price,
      discountPrice: row.discountPrice,
      rating: Number(row.rating),
      reviewCount: Number(row.reviewCount),
      values: Object.fromEntries(
        (row.attributes ?? []).map((attribute) => [attribute.key, pickLocale(attribute.value, locale)]),
      ),
      labels: Object.fromEntries(
        (row.attributes ?? []).map((attribute) => [attribute.key, pickLocale(attribute.label, locale)]),
      ),
    })),
  ];

  return <ComparisonTable columns={columns} />;
}

function ComparisonSkeleton() {
  return (
    <div className="space-y-3" aria-busy>
      <Skeleton className="h-5 w-48" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="rounded-card h-64 w-56 shrink-0" />
        ))}
      </div>
    </div>
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
