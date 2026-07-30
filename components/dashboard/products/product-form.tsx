'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { GripVertical, Plus, Trash2, Upload, X } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { PriceDisplay } from '@/components/custom/price-display';
import {
  deleteProductImage,
  reorderProductImages,
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
  status: 'draft' | 'published' | 'unpublished';
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

  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const priceNumber = Number(values.price.replace(/\D/g, '')) || 0;
  const discountNumber = Number(values.discountPrice.replace(/\D/g, '')) || 0;

  function submit(status?: ProductFormValues['status']) {
    const nextStatus = status ?? values.status;

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
        stock: Number(values.stock.replace(/\D/g, '')) || 0,
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
        toast.error(t(`errors.${result.error}` as never));
        return;
      }

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
                  />
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
              onChange={(event) => set('price', event.target.value.replace(/\D/g, ''))}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="discount">{t('discountPrice')}</Label>
            <Input
              id="discount"
              inputMode="numeric"
              dir="ltr"
              value={values.discountPrice}
              onChange={(event) => set('discountPrice', event.target.value.replace(/\D/g, ''))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stock">{t('stock')}</Label>
            <Input
              id="stock"
              inputMode="numeric"
              dir="ltr"
              value={values.stock}
              onChange={(event) => set('stock', event.target.value.replace(/\D/g, ''))}
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
      <div className="rounded-card border-border bg-background/95 sticky bottom-16 z-20 flex flex-wrap gap-2 border p-3 backdrop-blur-md md:bottom-0">
        <Button onClick={() => submit()} disabled={pending || !values.titleFa.trim()}>
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

        <span className="text-muted-foreground ms-auto self-center text-xs">
          {t(`statusNow.${values.status}` as never)}
        </span>
      </div>
    </div>
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
