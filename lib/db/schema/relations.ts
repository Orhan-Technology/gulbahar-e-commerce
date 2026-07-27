import { relations } from 'drizzle-orm';

import { cartItems } from './cart';
import { categories } from './categories';
import { notifications } from './notifications';
import { orderEvents, orderItems, orders } from './orders';
import { productImages, productVariants, products } from './products';
import { campaigns, offers, promotionSlots } from './promotions';
import { reviewResponses, reviews, wishlistItems } from './reviews';
import { shopMembers, shops } from './shops';
import { addresses, users } from './users';

/**
 * Relations live in one file rather than beside each table.
 *
 * Table modules form a strict dependency order (users → categories → shops →
 * products → orders → reviews/promotions), so they never import each other in a
 * cycle. Relations are inherently bidirectional and would reintroduce cycles if
 * declared inline, so they are all collected here instead.
 */

export const usersRelations = relations(users, ({ many }) => ({
  addresses: many(addresses),
  cartItems: many(cartItems),
  orders: many(orders),
  reviews: many(reviews),
  wishlistItems: many(wishlistItems),
  shopMemberships: many(shopMembers),
  notifications: many(notifications),
}));

export const addressesRelations = relations(addresses, ({ one, many }) => ({
  user: one(users, { fields: [addresses.userId], references: [users.id] }),
  orders: many(orders),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: 'category_tree',
  }),
  children: many(categories, { relationName: 'category_tree' }),
  products: many(products),
  shops: many(shops),
}));

export const shopsRelations = relations(shops, ({ one, many }) => ({
  category: one(categories, { fields: [shops.categoryId], references: [categories.id] }),
  members: many(shopMembers),
  products: many(products),
  orderItems: many(orderItems),
  offers: many(offers),
  campaigns: many(campaigns),
  reviewResponses: many(reviewResponses),
}));

export const shopMembersRelations = relations(shopMembers, ({ one }) => ({
  shop: one(shops, { fields: [shopMembers.shopId], references: [shops.id] }),
  user: one(users, { fields: [shopMembers.userId], references: [users.id] }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  shop: one(shops, { fields: [products.shopId], references: [shops.id] }),
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  images: many(productImages),
  variants: many(productVariants),
  reviews: many(reviews),
  wishlistItems: many(wishlistItems),
  cartItems: many(cartItems),
  orderItems: many(orderItems),
  campaigns: many(campaigns),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, { fields: [productImages.productId], references: [products.id] }),
}));

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  address: one(addresses, { fields: [orders.addressId], references: [addresses.id] }),
  items: many(orderItems),
  events: many(orderEvents),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  shop: one(shops, { fields: [orderItems.shopId], references: [shops.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
  review: one(reviews, { fields: [orderItems.id], references: [reviews.orderItemId] }),
}));

export const orderEventsRelations = relations(orderEvents, ({ one }) => ({
  order: one(orders, { fields: [orderEvents.orderId], references: [orders.id] }),
  actor: one(users, { fields: [orderEvents.actorUserId], references: [users.id] }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  product: one(products, { fields: [reviews.productId], references: [products.id] }),
  user: one(users, { fields: [reviews.userId], references: [users.id] }),
  orderItem: one(orderItems, { fields: [reviews.orderItemId], references: [orderItems.id] }),
  response: one(reviewResponses, {
    fields: [reviews.id],
    references: [reviewResponses.reviewId],
  }),
}));

export const reviewResponsesRelations = relations(reviewResponses, ({ one }) => ({
  review: one(reviews, { fields: [reviewResponses.reviewId], references: [reviews.id] }),
  shop: one(shops, { fields: [reviewResponses.shopId], references: [shops.id] }),
}));

export const wishlistItemsRelations = relations(wishlistItems, ({ one }) => ({
  user: one(users, { fields: [wishlistItems.userId], references: [users.id] }),
  product: one(products, { fields: [wishlistItems.productId], references: [products.id] }),
}));

export const offersRelations = relations(offers, ({ one }) => ({
  shop: one(shops, { fields: [offers.shopId], references: [shops.id] }),
}));

export const promotionSlotsRelations = relations(promotionSlots, ({ many }) => ({
  campaigns: many(campaigns),
}));

export const campaignsRelations = relations(campaigns, ({ one }) => ({
  slot: one(promotionSlots, { fields: [campaigns.slotId], references: [promotionSlots.id] }),
  shop: one(shops, { fields: [campaigns.shopId], references: [shops.id] }),
  product: one(products, { fields: [campaigns.productId], references: [products.id] }),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  user: one(users, { fields: [cartItems.userId], references: [users.id] }),
  product: one(products, { fields: [cartItems.productId], references: [products.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  recipient: one(users, { fields: [notifications.recipientUserId], references: [users.id] }),
}));
