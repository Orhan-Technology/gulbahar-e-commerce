'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, PackageX, ShoppingCart, Store, Timer, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  ActionQueueItem,
  EmptyState,
  ImageGallery,
  OrderStatusTimeline,
  PriceDisplay,
  ProductCard,
  QuantityStepper,
  RatingStars,
  RatingStarsInput,
  SectionHeader,
  ShopCard,
  SponsoredBadge,
  StatCard,
  type OrderStatus,
} from '@/components/custom';

const IMAGES = [
  { path: '/styleguide/product-1.webp' },
  { path: '/styleguide/product-2.webp' },
  { path: '/styleguide/product-3.webp' },
];

const STATUSES: OrderStatus[] = ['placed', 'accepted', 'ready', 'fulfilled', 'rejected'];

/*
 * Captured at module load, not during render. Calling Date.now() inside a
 * component body is impure and React 19 lints it as such — the value would
 * change on every re-render.
 */
const MINUTE = 60 * 1000;
const DEMO_NOW = Date.now();
const QUEUE_TIMESTAMPS = {
  newOrder: new Date(DEMO_NOW - 8 * MINUTE).toISOString(),
  outOfStock: new Date(DEMO_NOW - 5 * 60 * MINUTE).toISOString(),
  expiring: new Date(DEMO_NOW - 26 * 60 * MINUTE).toISOString(),
};

/**
 * Showcase for the custom component library (Prompt 2.3). Every component is
 * shown beside its skeleton so the two can be compared for layout shift, which
 * is the failure this pairing exists to catch (PRD §10.5).
 */
export function CustomShowcase() {
  const t = useTranslations('styleguide.custom');
  const tStatus = useTranslations('order.status');

  const [quantity, setQuantity] = React.useState(2);
  const [rating, setRating] = React.useState(4);
  const [status, setStatus] = React.useState<OrderStatus>('accepted');

  return (
    <div className="space-y-12">
      {/* ---------------------------------------------------------------- */}
      <Block title={t('productCard')} note={t('productCardNote')}>
        <div className="grid w-full grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <ProductCard
            slug="samsung-galaxy-a54"
            title={t('sampleProductTitle')}
            shopName={t('sampleShopName')}
            price={24500}
            rating={4.4}
            reviewCount={38}
            imagePath={IMAGES[0].path}
            stock={12}
          />
          <ProductCard
            slug="perfume"
            title={t('sampleProduct2Title')}
            shopName={t('sampleShop2Name')}
            price={3200}
            discountPrice={2400}
            rating={4.8}
            reviewCount={112}
            imagePath={IMAGES[1].path}
            stock={5}
          />
          <ProductCard
            slug="watch"
            title={t('sampleProduct3Title')}
            shopName={t('sampleShop3Name')}
            price={7800}
            rating={3.5}
            reviewCount={9}
            imagePath={IMAGES[2].path}
            isSponsored
            isWishlisted
            stock={3}
          />
          <ProductCard
            slug="out-of-stock"
            title={t('sampleProduct4Title')}
            shopName={t('sampleShopName')}
            price={1500}
            rating={4}
            reviewCount={4}
            stock={0}
          />
        </div>
        <div className="grid w-full grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <ProductCard.Skeleton />
          <ProductCard.Skeleton />
        </div>
      </Block>

      {/* ---------------------------------------------------------------- */}
      <Block title={t('priceDisplay')}>
        <div className="flex flex-wrap items-start gap-8">
          <PriceDisplay price={24500} size="sm" />
          <PriceDisplay price={24500} size="md" />
          <PriceDisplay price={24500} size="lg" />
          <PriceDisplay price={3200} discountPrice={2400} size="lg" showDiscountPercent />
          <PriceDisplay.Skeleton />
        </div>
      </Block>

      {/* ---------------------------------------------------------------- */}
      <Block title={t('ratingStars')} note={t('ratingStarsNote')}>
        <div className="flex flex-wrap items-center gap-8">
          <RatingStars value={4.4} count={38} size="sm" />
          <RatingStars value={3.2} count={7} size="md" />
          <RatingStars value={5} size="lg" />
          <RatingStars.Skeleton />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{t('inputMode')}</span>
          <RatingStarsInput value={rating} onChange={setRating} />
        </div>
      </Block>

      {/* ---------------------------------------------------------------- */}
      <Block title={t('shopCard')}>
        <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ShopCard
            slug="kabul-electronics"
            name={t('sampleShopName')}
            categoryName={t('sampleCategory')}
            rating={4.6}
            reviewCount={214}
            productCount={86}
            floor={2}
            unitNumber="۲۱۴"
            bannerPath="/styleguide/shop-banner.webp"
            logoPath="/styleguide/shop-logo.webp"
          />
          <ShopCard
            slug="golden-perfume"
            name={t('sampleShop2Name')}
            categoryName={t('sampleCategory2')}
            rating={4.9}
            reviewCount={57}
            productCount={31}
            floor={1}
            unitNumber="۱۰۸"
            isSponsored
          />
          <ShopCard.Skeleton />
        </div>
      </Block>

      {/* ---------------------------------------------------------------- */}
      <Block title={t('orderTimeline')} note={t('orderTimelineNote')}>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((value) => (
            <Button
              key={value}
              size="sm"
              variant={status === value ? 'default' : 'outline'}
              onClick={() => setStatus(value)}
            >
              {tStatus(value)}
            </Button>
          ))}
        </div>
        <div className="w-full max-w-md rounded-card border border-border bg-card p-4">
          <OrderStatusTimeline status={status} />
        </div>
        <div className="w-full max-w-xs rounded-card border border-border bg-card p-4">
          <OrderStatusTimeline status={status} orientation="vertical" />
        </div>
        <div className="w-full max-w-md">
          <OrderStatusTimeline.Skeleton />
        </div>
      </Block>

      {/* ---------------------------------------------------------------- */}
      <Block title={t('statCard')} note={t('statCardNote')}>
        <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t('todaySales')}
            value={48200}
            format="currency"
            delta={0.12}
            icon={<Wallet className="h-4 w-4" />}
          />
          <StatCard
            label={t('weekSales')}
            value={312000}
            format="currency"
            delta={-0.04}
            icon={<Wallet className="h-4 w-4" />}
          />
          <StatCard
            label={t('ordersAwaiting')}
            value={7}
            icon={<ShoppingCart className="h-4 w-4" />}
          />
          <StatCard.Skeleton />
        </div>
      </Block>

      {/* ---------------------------------------------------------------- */}
      <Block title={t('actionQueue')}>
        <div className="w-full max-w-lg space-y-2">
          <ActionQueueItem
            icon={<ShoppingCart className="h-5 w-5" />}
            title={t('queueNewOrder')}
            subtitle={t('queueNewOrderSub')}
            timestamp={QUEUE_TIMESTAMPS.newOrder}
            href="/dashboard/orders"
            isNew
          />
          <ActionQueueItem
            icon={<PackageX className="h-5 w-5" />}
            title={t('queueOutOfStock')}
            subtitle={t('queueOutOfStockSub')}
            timestamp={QUEUE_TIMESTAMPS.outOfStock}
            href="/dashboard/products"
            tone="danger"
          />
          <ActionQueueItem
            icon={<Timer className="h-5 w-5" />}
            title={t('queueExpiring')}
            subtitle={t('queueExpiringSub')}
            timestamp={QUEUE_TIMESTAMPS.expiring}
            href="/dashboard/promotions"
            tone="warning"
          />
          <ActionQueueItem.Skeleton />
        </div>
      </Block>

      {/* ---------------------------------------------------------------- */}
      <Block title={t('emptyState')}>
        <div className="w-full max-w-md">
          <EmptyState
            illustration={<Store className="h-7 w-7" />}
            title={t('emptyTitle')}
            description={t('emptyDescription')}
            action={{ label: t('emptyAction'), href: '/dashboard/products' }}
          />
        </div>
      </Block>

      {/* ---------------------------------------------------------------- */}
      <Block title={t('misc')}>
        <div className="flex flex-wrap items-center gap-6">
          <SponsoredBadge />
          <SponsoredBadge withIcon />
          <QuantityStepper value={quantity} onChange={setQuantity} max={5} />
          <QuantityStepper value={quantity} onChange={setQuantity} max={5} size="sm" />
        </div>
        <div className="w-full max-w-md space-y-4">
          <SectionHeader
            title={t('sectionTitle')}
            description={t('sectionDescription')}
            href="/products"
          />
          <SectionHeader.Skeleton />
        </div>
      </Block>

      {/* ---------------------------------------------------------------- */}
      <Block title={t('imageGallery')} note={t('imageGalleryNote')}>
        <div className="grid w-full gap-6 sm:grid-cols-2">
          <ImageGallery images={IMAGES} title={t('sampleProductTitle')} />
          <ImageGallery.Skeleton />
        </div>
      </Block>

      {/* ---------------------------------------------------------------- */}
      <Block title={t('emptyGallery')}>
        <div className="w-full max-w-xs">
          <ImageGallery images={[]} title={t('sampleProductTitle')} aspect="square" />
        </div>
      </Block>
    </div>
  );
}

function Block({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {note && (
          <p className="mt-0.5 flex items-start gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            {note}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-start gap-4">{children}</div>
    </div>
  );
}
