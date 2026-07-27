/**
 * Custom component library (PRD §10.4). Every export ships with a `.Skeleton`
 * where it renders async content, fa/en support, and tokens only.
 */

export { ActionQueueItem, type ActionQueueItemProps } from './action-queue-item';
export { EmptyState, type EmptyStateProps } from './empty-state';
export { ImageGallery, type GalleryImage, type ImageGalleryProps } from './image-gallery';
export {
  OrderStatusTimeline,
  type OrderStatus,
  type OrderStatusTimelineProps,
} from './order-status-timeline';
export { PriceDisplay, type PriceDisplayProps } from './price-display';
export { ProductCard, type ProductCardProps } from './product-card';
export { QuantityStepper, type QuantityStepperProps } from './quantity-stepper';
export {
  RatingStars,
  RatingStarsInput,
  type RatingStarsInputProps,
  type RatingStarsProps,
} from './rating-stars';
export { SectionHeader, type SectionHeaderProps } from './section-header';
export { ShopCard, type ShopCardProps } from './shop-card';
export { SponsoredBadge } from './sponsored-badge';
export { StatCard, usePrefersReducedMotion, type StatCardProps } from './stat-card';
