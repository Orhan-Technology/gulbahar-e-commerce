'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArchiveRestore, GripVertical, Plus, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { FieldError } from '@/components/custom/field-error';
import { PriceDisplay } from '@/components/custom/price-display';
import { digitsOnly } from '@/lib/digits';
import {
  archiveProduct,
  deleteProductImage,
  reorderProductImages,
  restoreProduct,
  saveProduct,
  uploadProductImages,
} from '@/lib/actions/shop-products';
import { useRouter as useLocaleRouter } from '@/lib/i18n/navigation';
import {
  FeatureEditor,
  SpecEditor,
  type FeatureValue,
  type SpecRowValue,
} from '@/components/dashboard/products/spec-editor';

export type ProductFormCategory = {
  id: string;
  /** The slug picks the spec template — see lib/product-templates.ts. */
  slug: string;
  label: string;
  parentLabel: string | null;
};

export type ProductFormImage = { id: string; path: string };

export type ProductFormValues = {
  id?: string;
  titleFa: string;
  titleEn: string;
  titlePs: string;
  descriptionFa: string;
  descriptionEn: string;
  descriptionPs: string;
  categoryId: string | null;
  price: string;
  discountPrice: string;
  stock: string;
  status: 'draft' | 'published' | 'unpublished' | 'archived';
  /** Admin's reason for taking it down — shown, never edited (PRD §3.1). */
  unpublishReason: string | null;
  variants: Array<{ nameFa: string; nameEn: string; options: Array<{ fa: string; en: string }> }>;
  brand: string;
  model: string;
  specs: SpecRowValue[];
  features: FeatureValue[];
};

/**
 * Product add/edit form (PRD §6.2).
 *
 * Per-language fields live behind tabs rather than stacked: three copies of every
 * field in one column makes a phone form endless, and Dari is the only required
 * one (PRD §11). A "missing translation" chip on the tab surfaces the gap without
 * blocking publication.
 *
 * Images can only be attached once the product exists, because they need a
 * product id to belong to — so a new product saves first, then reveals the
 * uploader. That is also why the save button reads "save and continue" when
 * creating.
 */
export function ProductForm({
  initial,
  categories,
  images,
}: {
  initial: ProductFormValues;
  categories: ProductFormCategory[];
  images: ProductFormImage[];
}) {
  const t = useTranslations('shopProducts.form');
  const router = useRouter();
  const localeRouter = useLocaleRouter();

  const [values, setValues] = React.useState(initial);
  const [pending, startTransition] = React.useTransition();

  /*
   * FIELD-LEVEL ERRORS (Prompt: errors have no field-level surface).
   *
   * A toast of a translated code is the weakest surface this persona could be
   * given: it appears in a corner, names no field, and is gone before someone
   * serving a customer has looked up. The action now returns `fields`, keyed by
   * the names below, and each input renders its own message and goes red. The
   * toast stays as the secondary signal, because the error may also be about
   * nothing on screen (a permission, a vanished row).
   */
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    // Clear the message the moment the field it is about is touched — an error
    // that survives the fix reads as "still wrong".
    setFieldErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  };

  /** The message under one input, or nothing. */
  const fieldError = (field: string) => fieldErrors[field];

  const priceNumber = Number(digitsOnly(values.price)) || 0;
  const discountNumber = Number(digitsOnly(values.discountPrice)) || 0;

  function submit(status?: 'draft' | 'published' | 'unpublished') {
    const nextStatus = status ?? (values.status === 'archived' ? 'draft' : values.status);

    /*
     * CHECKED HERE FIRST, so the commonest mistakes never cost a round trip —
     * the person filling this in is on a phone on mall wifi. The server
     * re-validates all of it regardless; this is a faster copy of the same
     * rules, not the enforcement.
     */
    const local: Record<string, string> = {};
    if (!values.titleFa.trim()) local.titleFa = 'fa_required';
    if (priceNumber <= 0) local.price = 'price_positive';
    if (discountNumber > 0 && discountNumber >= priceNumber) {
      local.discountPrice = 'discount_below_price';
    }
    if (Object.keys(local).length > 0) {
      setFieldErrors(local);
      toast.error(t(`errors.${Object.values(local)[0]}` as never));
      return;
    }

    startTransition(async () => {
      const result = await saveProduct({
        id: values.id,
        title: { fa: values.titleFa, en: values.titleEn || null, ps: values.titlePs || null },
        description: {
          fa: values.descriptionFa || null,
          en: values.descriptionEn || null,
          ps: values.descriptionPs || null,
        },
        categoryId: values.categoryId,
        price: priceNumber,
        discountPrice: discountNumber || null,
        stock: Number(digitsOnly(values.stock)) || 0,
        status: nextStatus,
        brand: values.brand.trim() || null,
        model: values.model.trim() || null,
        attributes: values.specs
          .filter((row) => row.key.trim() && row.labelFa.trim())
          .map((row) => ({
            key: row.key.trim(),
            label: { fa: row.labelFa, en: row.labelEn || null },
            value: { fa: row.valueFa, en: row.valueEn || null },
            group: row.group ?? null,
          })),
        features: values.features
          .filter((feature) => feature.titleFa.trim() && feature.bodyFa.trim())
          .map((feature) => ({
            title: { fa: feature.titleFa, en: feature.titleEn || null },
            body: { fa: feature.bodyFa, en: feature.bodyEn || null },
          })),
        variants: values.variants
          .filter((variant) => variant.nameFa.trim() && variant.options.some((o) => o.fa.trim()))
          .map((variant) => ({
            name: { fa: variant.nameFa, en: variant.nameEn || null },
            options: variant.options
              .filter((option) => option.fa.trim())
              .map((option) => ({ fa: option.fa, en: option.en || null })),
          })),
      });

      if (!result.ok) {
        setFieldErrors(result.fields ?? {});
        toast.error(t(`errors.${result.error}` as never));
        return;
      }

      setFieldErrors({});
      toast.success(values.id ? t('saved') : t('created'));

      if (!values.id) {
        // Move to the edit URL so images can now be attached.
        localeRouter.replace(`/dashboard/products/${result.data.id}`);
      } else {
        set('status', nextStatus);
        router.refresh();
      }
    });
  }

  const missing = {
    en: !values.titleEn.trim(),
    ps: !values.titlePs.trim(),
  };

  return (
    <div className="space-y-5">
      {/*
        ARCHIVED IS A WALL, not a badge. Every write in the action refuses an
        archived row, so a form that still offered Save and Publish would offer
        two buttons that always fail. The only thing on offer is the way back.
      */}
      {values.status === 'archived' && values.id && (
        <section className="rounded-card border-danger-border bg-danger-bg space-y-2 border p-4">
          <h2 className="text-danger text-sm font-bold">{t('archivedHeading')}</h2>
          <p className="text-danger/90 text-xs">{t('archivedBody')}</p>
          <RestoreProductButton productId={values.id} />
        </section>
      )}

      {/*
        ADMIN'S REASON, read-only (PRD §3.1). The shop may fix the product and
        publish it again; it may not rewrite what the mall said about it. Without
        this line an unpublished product is a shopkeeper guessing.
      */}
      {values.status === 'unpublished' && values.unpublishReason && (
        <section className="rounded-card border-danger-border bg-danger-bg space-y-1 border p-4">
          <p className="text-danger text-sm font-bold">{t('unpublishedHeading')}</p>
          <p className="text-danger/90 text-sm">{values.unpublishReason}</p>
          <p className="text-danger/80 text-xs">{t('unpublishedHint')}</p>
        </section>
      )}

      {/* Content, per language */}
      <section className="rounded-card border-border bg-card space-y-3 border p-4">
        <h2 className="text-sm font-bold">{t('contentHeading')}</h2>

        <Tabs defaultValue="fa">
          <TabsList>
            <TabsTrigger value="fa">
              {t('langFa')}
              <Badge variant="destructive" className="ms-1.5">
                {t('required')}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="en">
              {t('langEn')}
              {missing.en && (
                <Badge variant="outline" className="ms-1.5">
                  {t('missing')}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="ps">
              {t('langPs')}
              {missing.ps && (
                <Badge variant="outline" className="ms-1.5">
                  {t('missing')}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {(['fa', 'en', 'ps'] as const).map((lang) => {
            const titleKey = `title${lang === 'fa' ? 'Fa' : lang === 'en' ? 'En' : 'Ps'}` as const;
            const descKey =
              `description${lang === 'fa' ? 'Fa' : lang === 'en' ? 'En' : 'Ps'}` as const;
            return (
              <TabsContent key={lang} value={lang} className="space-y-3 pt-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`title-${lang}`}>{t('titleLabel')}</Label>
                  <Input
                    id={`title-${lang}`}
                    // Latin fields read left-to-right even inside an RTL page.
                    dir={lang === 'en' ? 'ltr' : 'rtl'}
                    value={values[titleKey]}
                    onChange={(event) => set(titleKey, event.target.value)}
                    required={lang === 'fa'}
                    aria-invalid={lang === 'fa' && fieldError('titleFa') !== undefined}
                    aria-describedby={
                      lang === 'fa' && fieldError('titleFa') ? 'title-fa-error' : undefined
                    }
                  />
                  {lang === 'fa' && (
                    <FieldError
                      id="title-fa-error"
                      message={
                        fieldError('titleFa')
                          ? t(`fieldErrors.${fieldError('titleFa')}` as never)
                          : null
                      }
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`desc-${lang}`}>{t('descriptionLabel')}</Label>
                  <Textarea
                    id={`desc-${lang}`}
                    dir={lang === 'en' ? 'ltr' : 'rtl'}
                    rows={3}
                    value={values[descKey]}
                    onChange={(event) => set(descKey, event.target.value)}
                  />
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </section>

      {/* Category, price, stock */}
      <section className="rounded-card border-border bg-card space-y-3 border p-4">
        <h2 className="text-sm font-bold">{t('detailsHeading')}</h2>

        <div className="space-y-1.5">
          <Label htmlFor="category">{t('category')}</Label>
          <Select
            value={values.categoryId ?? undefined}
            onValueChange={(value) => set('categoryId', value)}
          >
            <SelectTrigger id="category">
              <SelectValue placeholder={t('categoryHint')} />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.parentLabel ? `${category.parentLabel} › ` : ''}
                  {category.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Categories are admin-owned; a shop assigns, never creates (PRD §3.1). */}
          <p className="text-muted-foreground text-xs">{t('categoryOwnedByAdmin')}</p>
        </div>

        {/* Brand and model are their own fields rather than two spec rows: the
            brand drives a listing facet and both print under the title in the
            buy box, so they exist whether or not the spec table is filled. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="brand">{t('brand')}</Label>
            <Input
              id="brand"
              value={values.brand}
              onChange={(event) => set('brand', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="model">{t('model')}</Label>
            <Input
              id="model"
              value={values.model}
              dir="ltr"
              onChange={(event) => set('model', event.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="price">{t('price')}</Label>
            <Input
              id="price"
              inputMode="numeric"
              dir="ltr"
              value={values.price}
              onChange={(event) => set('price', digitsOnly(event.target.value))}
              required
              aria-invalid={fieldError('price') !== undefined}
              aria-describedby={fieldError('price') ? 'price-error' : undefined}
            />
            <FieldError
              id="price-error"
              message={fieldError('price') ? t(`fieldErrors.${fieldError('price')}` as never) : null}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="discount">{t('discountPrice')}</Label>
            <Input
              id="discount"
              inputMode="numeric"
              dir="ltr"
              value={values.discountPrice}
              onChange={(event) => set('discountPrice', digitsOnly(event.target.value))}
              aria-invalid={fieldError('discountPrice') !== undefined}
              aria-describedby={fieldError('discountPrice') ? 'discount-error' : undefined}
            />
            <FieldError
              id="discount-error"
              message={
                fieldError('discountPrice')
                  ? t(`fieldErrors.${fieldError('discountPrice')}` as never)
                  : null
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stock">{t('stock')}</Label>
            <Input
              id="stock"
              inputMode="numeric"
              dir="ltr"
              value={values.stock}
              onChange={(event) => set('stock', digitsOnly(event.target.value))}
              aria-invalid={fieldError('stock') !== undefined}
              aria-describedby={fieldError('stock') ? 'stock-error' : undefined}
            />
            <FieldError
              id="stock-error"
              message={fieldError('stock') ? t(`fieldErrors.${fieldError('stock')}` as never) : null}
            />
          </div>
        </div>

        {/* Live preview, so the shopkeeper sees exactly what the customer will. */}
        {priceNumber > 0 && (
          <div className="rounded-control bg-neutral-50 p-3">
            <p className="text-muted-foreground mb-1 text-xs">{t('pricePreview')}</p>
            <PriceDisplay
              price={priceNumber}
              discountPrice={discountNumber || null}
              size="lg"
              showDiscountPercent
            />
          </div>
        )}
      </section>

      {/* Specifications, features, then variants */}
      <SpecEditor
        categorySlug={categories.find((category) => category.id === values.categoryId)?.slug ?? null}
        rows={values.specs}
        onChange={(specs) => set('specs', specs)}
      />

      <FeatureEditor features={values.features} onChange={(features) => set('features', features)} />

      <VariantEditor
        variants={values.variants}
        onChange={(variants) => set('variants', variants)}
      />

      {/* Images — only once the product exists */}
      {values.id ? (
        <ImageManager productId={values.id} images={images} />
      ) : (
        <section className="rounded-card border-border bg-card border border-dashed p-4">
          <h2 className="text-sm font-bold">{t('imagesHeading')}</h2>
          <p className="text-muted-foreground mt-1 text-xs">{t('imagesAfterSave')}</p>
        </section>
      )}

      {/* Save bar */}
      {values.status !== 'archived' && (
        <div className="rounded-card border-border bg-background/95 sticky bottom-16 z-20 flex flex-wrap gap-2 border p-3 backdrop-blur-md md:bottom-0">
          <Button onClick={() => submit()} disabled={pending}>
            {pending ? t('saving') : values.id ? t('save') : t('saveAndContinue')}
          </Button>

          {values.id && values.status !== 'published' && (
            <Button variant="accent" onClick={() => submit('published')} disabled={pending}>
              {t('publish')}
            </Button>
          )}
          {values.id && values.status === 'published' && (
            <Button variant="outline" onClick={() => submit('unpublished')} disabled={pending}>
              {t('unpublish')}
            </Button>
          )}

          {/* Archiving is the delete, and it lives beside the other status
              changes rather than in a menu — this is where a shopkeeper looks
              for "get rid of it". */}
          {values.id && <ArchiveProductButton productId={values.id} title={values.titleFa} />}

          <span className="text-muted-foreground ms-auto self-center text-xs">
            {t(`statusNow.${values.status}` as never)}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Archive from the editor, with the same explanation the list gives.
 *
 * Duplicated deliberately rather than shared with the list's version: this one
 * navigates away afterwards (the product it was editing is gone from the
 * catalogue) and that difference is the whole behaviour.
 */
function ArchiveProductButton({ productId, title }: { productId: string; title: string }) {
  const t = useTranslations('shopProducts.archive');
  const localeRouter = useLocaleRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  return (
    <>
      <Button
        variant="ghost"
        className="hover:text-danger text-neutral-500"
        onClick={() => setOpen(true)}
        disabled={pending}
      >
        <Trash2 />
        {t('action')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmTitle')}</DialogTitle>
            <DialogDescription>{t('confirmBody', { title })}</DialogDescription>
          </DialogHeader>
          <p className="text-muted-foreground text-xs">{t('reversibleNote')}</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await archiveProduct(productId);
                  if (!result.ok) {
                    toast.error(t(`errors.${result.error}` as never));
                    return;
                  }
                  toast.success(t('archived'));
                  // Back to the list: staying on an editor for a product that is
                  // no longer in the catalogue is a screen with nothing to do.
                  localeRouter.replace('/dashboard/products');
                })
              }
            >
              <Trash2 />
              {pending ? t('archiving') : t('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The one control an archived product offers. */
function RestoreProductButton({ productId }: { productId: string }) {
  const t = useTranslations('shopProducts.archive');
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await restoreProduct(productId);
          if (!result.ok) {
            toast.error(t(`errors.${result.error}` as never));
            return;
          }
          toast.success(t('restored'));
          router.refresh();
        })
      }
    >
      <ArchiveRestore />
      {pending ? t('restoring') : t('restore')}
    </Button>
  );
}

function VariantEditor({
  variants,
  onChange,
}: {
  variants: ProductFormValues['variants'];
  onChange: (next: ProductFormValues['variants']) => void;
}) {
  const t = useTranslations('shopProducts.form');

  return (
    <section className="rounded-card border-border bg-card space-y-3 border p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold">{t('variantsHeading')}</h2>
          <p className="text-muted-foreground text-xs">{t('variantsHint')}</p>
        </div>
        {variants.length < 4 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              onChange([...variants, { nameFa: '', nameEn: '', options: [{ fa: '', en: '' }] }])
            }
          >
            <Plus />
            {t('addVariant')}
          </Button>
        )}
      </div>

      {variants.map((variant, variantIndex) => (
        <div key={variantIndex} className="rounded-control space-y-2 bg-neutral-50 p-3">
          <div className="flex gap-2">
            <Input
              value={variant.nameFa}
              placeholder={t('variantNameFa')}
              onChange={(event) => {
                const next = [...variants];
                next[variantIndex] = { ...variant, nameFa: event.target.value };
                onChange(next);
              }}
            />
            <Input
              value={variant.nameEn}
              dir="ltr"
              placeholder={t('variantNameEn')}
              onChange={(event) => {
                const next = [...variants];
                next[variantIndex] = { ...variant, nameEn: event.target.value };
                onChange(next);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onChange(variants.filter((_, index) => index !== variantIndex))}
              aria-label={t('removeVariant')}
              className="hover:text-danger shrink-0 text-neutral-500"
            >
              <Trash2 />
            </Button>
          </div>

          <div className="space-y-1.5">
            {variant.options.map((option, optionIndex) => (
              <div key={optionIndex} className="flex gap-2">
                <Input
                  value={option.fa}
                  placeholder={t('optionFa')}
                  className="h-9"
                  onChange={(event) => {
                    const next = [...variants];
                    const options = [...variant.options];
                    options[optionIndex] = { ...option, fa: event.target.value };
                    next[variantIndex] = { ...variant, options };
                    onChange(next);
                  }}
                />
                <Input
                  value={option.en}
                  dir="ltr"
                  placeholder={t('optionEn')}
                  className="h-9"
                  onChange={(event) => {
                    const next = [...variants];
                    const options = [...variant.options];
                    options[optionIndex] = { ...option, en: event.target.value };
                    next[variantIndex] = { ...variant, options };
                    onChange(next);
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => {
                    const next = [...variants];
                    next[variantIndex] = {
                      ...variant,
                      options: variant.options.filter((_, index) => index !== optionIndex),
                    };
                    onChange(next);
                  }}
                  aria-label={t('removeOption')}
                >
                  <X />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                const next = [...variants];
                next[variantIndex] = {
                  ...variant,
                  options: [...variant.options, { fa: '', en: '' }],
                };
                onChange(next);
              }}
            >
              <Plus />
              {t('addOption')}
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}

/**
 * Image upload with drag reordering (PRD §6.2).
 *
 * Uses the HTML5 drag events rather than a library: the list is short, the
 * interaction is one-dimensional, and a drag-and-drop dependency for this would be
 * more code than the feature.
 */
function ImageManager({ productId, images }: { productId: string; images: ProductFormImage[] }) {
  const t = useTranslations('shopProducts.form');
  const router = useRouter();
  const [order, setOrder] = React.useState(images);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [pending, startTransition] = React.useTransition();

  // Re-sync after a server refresh, adjusted during render.
  const [lastIds, setLastIds] = React.useState(images.map((image) => image.id).join(','));
  const currentIds = images.map((image) => image.id).join(',');
  if (lastIds !== currentIds) {
    setLastIds(currentIds);
    setOrder(images);
  }

  function onUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    for (const file of Array.from(files)) formData.append('images', file);

    startTransition(async () => {
      const result = await uploadProductImages(productId, formData);
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t('imagesAdded', { count: result.data.added }));
      router.refresh();
    });
  }

  function commitOrder(next: ProductFormImage[]) {
    setOrder(next);
    startTransition(async () => {
      const result = await reorderProductImages(
        productId,
        next.map((image) => image.id),
      );
      if (!result.ok) toast.error(t(`errors.${result.error}` as never));
      else router.refresh();
    });
  }

  return (
    <section className="rounded-card border-border bg-card space-y-3 border p-4">
      <div>
        <h2 className="text-sm font-bold">{t('imagesHeading')}</h2>
        <p className="text-muted-foreground text-xs">{t('imagesHint')}</p>
      </div>

      {order.length > 0 && (
        <ul className="space-y-2">
          {order.map((image, index) => (
            <li
              key={image.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragIndex === null || dragIndex === index) return;
                const next = [...order];
                const [moved] = next.splice(dragIndex, 1);
                next.splice(index, 0, moved);
                setDragIndex(null);
                commitOrder(next);
              }}
              className="rounded-control border-border flex items-center gap-3 border p-2"
            >
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-neutral-400" aria-hidden />
              <span className="rounded-control relative h-14 w-14 shrink-0 overflow-hidden bg-neutral-100">
                <Image src={image.path} alt="" fill sizes="56px" className="object-cover" />
              </span>
              <span className="text-muted-foreground flex-1 text-xs">
                {index === 0 ? t('mainImage') : t('imageNumber', { number: index + 1 })}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await deleteProductImage(image.id);
                    if (!result.ok) toast.error(t(`errors.${result.error}` as never));
                    else {
                      toast.success(t('imageDeleted'));
                      router.refresh();
                    }
                  })
                }
                aria-label={t('deleteImage')}
                className="hover:text-danger shrink-0 text-neutral-500"
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <label className="rounded-control border-input text-muted-foreground hover:border-primary hover:text-primary flex cursor-pointer items-center justify-center gap-2 border border-dashed p-4 text-sm">
        <Upload className="h-4 w-4" aria-hidden />
        {pending ? t('uploading') : t('chooseImages')}
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={onUpload}
          disabled={pending}
        />
      </label>
    </section>
  );
}
