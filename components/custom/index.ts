/**
 * Custom component library (PRD §10.4).
 *
 * Skeletons are exported as NAMED functions (ProductCardSkeleton, …) rather than
 * only as `Component.Skeleton` statics. A static attached to a 'use client'
 * component is lost across the RSC boundary: a server component importing it
 * receives a client reference proxy and the property reads as undefined. The
 * statics remain as aliases for client-side call sites.
 */

export {
  ActionQueueItem,
  ActionQueueItemSkeleton,
  type ActionQueueItemProps,
} from './action-queue-item';
export { EmptyState, type EmptyStateProps } from './empty-state';
export {
  ImageGallery,
  ImageGallerySkeleton,
  type GalleryImage,
  type ImageGalleryProps,
} from './image-gallery';
export {
  OrderStatusTimeline,
  OrderStatusTimelineSkeleton,
  type OrderStatus,
  type OrderStatusTimelineProps,
} from './order-status-timeline';
export { PriceDisplay, PriceDisplaySkeleton, type PriceDisplayProps } from './price-display';
export { ProductCard, ProductCardSkeleton, type ProductCardProps } from './product-card';
export {
  QuantityStepper,
  QuantityStepperSkeleton,
  type QuantityStepperProps,
} from './quantity-stepper';
export {
  RatingStars,
  RatingStarsInput,
  RatingStarsSkeleton,
  type RatingStarsInputProps,
  type RatingStarsProps,
} from './rating-stars';
export { SectionHeader, SectionHeaderSkeleton, type SectionHeaderProps } from './section-header';
export { ShopCard, ShopCardSkeleton, type ShopCardProps } from './shop-card';
export { SponsoredBadge, SponsoredBadgeSkeleton } from './sponsored-badge';
export { UnavailableCard, type UnavailableCardProps } from './unavailable-card';
export {
  StatCard,
  StatCardSkeleton,
  usePrefersReducedMotion,
  type StatCardProps,
} from './stat-card';
