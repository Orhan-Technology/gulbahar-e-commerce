'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { deleteCategory, reorderCategories, saveCategory } from '@/lib/actions/admin-catalogue';
import { formatNumber } from '@/lib/format';

export type CategoryNode = {
  id: string;
  slug: string;
  nameFa: string;
  nameEn: string;
  namePs: string;
  label: string;
  directProductCount: number;
  publicProductCount: number;
  shopCount: number;
  childCount: number;
};

export type CategoryRoot = CategoryNode & { children: CategoryNode[] };

type Draft = {
  id?: string;
  slug: string;
  nameFa: string;
  nameEn: string;
  namePs: string;
  parentId: string | null;
};

/**
 * Taxonomy manager (PRD §7.2).
 *
 * Two levels, matching the storefront's category → subcategory navigation. Reorder
 * is up/down buttons rather than drag: the lists are short, the ordering is
 * meaningful (it drives the home page), and buttons are the only version that works
 * with a keyboard without extra work.
 *
 * Delete is offered but the SERVER refuses when anything references the node —
 * the reference counts shown on each row are why, so the refusal is never a
 * surprise.
 */
export function CategoryManager({ roots }: { roots: CategoryRoot[] }) {
  const t = useTranslations('adminCategories');
  const locale = useLocale();
  const router = useRouter();

  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [pending, startTransition] = React.useTransition();

  function move(siblings: CategoryNode[], index: number, direction: -1 | 1) {
    const next = [...siblings];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];

    startTransition(async () => {
      const result = await reorderCategories(next.map((node) => node.id));
      if (!result.ok) toast.error(t(`errors.${result.error}` as never));
      else router.refresh();
    });
  }

  function remove(node: CategoryNode) {
    startTransition(async () => {
      const result = await deleteCategory(node.id);
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t('deleted'));
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => setDraft({ slug: '', nameFa: '', nameEn: '', namePs: '', parentId: null })}
        >
          <Plus />
          {t('addRoot')}
        </Button>
      </div>

      <ul className="space-y-3">
        {roots.map((root, rootIndex) => (
          <li key={root.id} className="rounded-card border-border bg-card border">
            <Row
              node={root}
              locale={locale}
              disabled={pending}
              onEdit={() =>
                setDraft({
                  id: root.id,
                  slug: root.slug,
                  nameFa: root.nameFa,
                  nameEn: root.nameEn,
                  namePs: root.namePs,
                  parentId: null,
                })
              }
              onDelete={() => remove(root)}
              onUp={() => move(roots, rootIndex, -1)}
              onDown={() => move(roots, rootIndex, 1)}
              isFirst={rootIndex === 0}
              isLast={rootIndex === roots.length - 1}
              bold
            />

            <ul className="border-border divide-border ms-6 divide-y border-t">
              {root.children.map((child, childIndex) => (
                <li key={child.id}>
                  <Row
                    node={child}
                    locale={locale}
                    disabled={pending}
                    onEdit={() =>
                      setDraft({
                        id: child.id,
                        slug: child.slug,
                        nameFa: child.nameFa,
                        nameEn: child.nameEn,
                        namePs: child.namePs,
                        parentId: root.id,
                      })
                    }
                    onDelete={() => remove(child)}
                    onUp={() => move(root.children, childIndex, -1)}
                    onDown={() => move(root.children, childIndex, 1)}
                    isFirst={childIndex === 0}
                    isLast={childIndex === root.children.length - 1}
                  />
                </li>
              ))}

              <li className="p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setDraft({
                      slug: '',
                      nameFa: '',
                      nameEn: '',
                      namePs: '',
                      parentId: root.id,
                    })
                  }
                >
                  <Plus />
                  {t('addChild', { parent: root.label })}
                </Button>
              </li>
            </ul>
          </li>
        ))}
      </ul>

      <CategoryDialog
        draft={draft}
        onClose={() => setDraft(null)}
        onSaved={() => {
          setDraft(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function Row({
  node,
  locale,
  disabled,
  onEdit,
  onDelete,
  onUp,
  onDown,
  isFirst,
  isLast,
  bold = false,
}: {
  node: CategoryNode;
  locale: string;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onUp: () => void;
  onDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  bold?: boolean;
}) {
  const t = useTranslations('adminCategories');
  // Anything referencing the node blocks deletion; the server enforces it.
  const blocked = node.directProductCount > 0 || node.shopCount > 0 || node.childCount > 0;

  return (
    <div className="flex flex-wrap items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${bold ? 'font-bold' : ''}`}>{node.label}</p>
        <p className="text-muted-foreground text-xs" dir="ltr">
          {node.slug}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary">
          {t('productCount', { count: formatNumber(node.directProductCount, locale) })}
        </Badge>
        {node.shopCount > 0 && (
          <Badge variant="outline">
            {t('shopCount', { count: formatNumber(node.shopCount, locale) })}
          </Badge>
        )}
        {/* A missing translation is visible but never blocking (PRD §11). */}
        {!node.nameEn && <Badge variant="outline">{t('noEnglish')}</Badge>}
        {/*
          WHY DELETE IS GREY, said out loud. The button was already disabled and
          the only explanation was a `title` — which a disabled control does not
          reliably surface on hover and never surfaces on touch, so the affordance
          read as broken rather than as guarded. The badge names the blocker, so
          the admin knows what to move before the node can go.
        */}
        {blocked && (
          <Badge variant="outline" className="text-muted-foreground" data-delete-blocked>
            {node.childCount > 0
              ? t('lockedByChildren', { count: formatNumber(node.childCount, locale) })
              : node.directProductCount > 0
                ? t('lockedByProducts', { count: formatNumber(node.directProductCount, locale) })
                : t('lockedByShops', { count: formatNumber(node.shopCount, locale) })}
          </Badge>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('moveUp')}
          disabled={disabled || isFirst}
          onClick={onUp}
        >
          <ChevronUp />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('moveDown')}
          disabled={disabled || isLast}
          onClick={onDown}
        >
          <ChevronDown />
        </Button>
        <Button variant="ghost" size="icon" aria-label={t('edit')} onClick={onEdit}>
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('delete')}
          disabled={disabled || blocked}
          title={blocked ? t('cannotDelete') : undefined}
          className="hover:text-danger text-neutral-500 disabled:opacity-40"
          onClick={onDelete}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}

function CategoryDialog({
  draft,
  onClose,
  onSaved,
}: {
  draft: Draft | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('adminCategories.form');
  const [values, setValues] = React.useState<Draft | null>(draft);
  const [pending, startTransition] = React.useTransition();

  // Re-seed when a different node is opened, adjusted during render.
  const [lastKey, setLastKey] = React.useState(
    draft ? `${draft.id ?? 'new'}-${draft.parentId}` : null,
  );
  const key = draft ? `${draft.id ?? 'new'}-${draft.parentId}` : null;
  if (lastKey !== key) {
    setLastKey(key);
    setValues(draft);
  }

  if (!draft || !values) return null;

  const set = <K extends keyof Draft>(field: K, value: Draft[K]) =>
    setValues((current) => (current ? { ...current, [field]: value } : current));

  function submit() {
    startTransition(async () => {
      const result = await saveCategory({
        id: values!.id,
        slug: values!.slug,
        name: { fa: values!.nameFa, en: values!.nameEn || null, ps: values!.namePs || null },
        parentId: values!.parentId,
      });

      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(values!.id ? t('saved') : t('created'));
      onSaved();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{values.id ? t('editTitle') : t('newTitle')}</DialogTitle>
          <DialogDescription>
            {values.parentId ? t('descriptionChild') : t('descriptionRoot')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cat-slug">{t('slug')}</Label>
            <Input
              id="cat-slug"
              dir="ltr"
              placeholder="mobile-phones"
              value={values.slug}
              onChange={(event) => set('slug', event.target.value.toLowerCase())}
            />
            {/* Admin-authored and ASCII, unlike product slugs which come from Dari
                titles — it appears in storefront URLs. */}
            <p className="text-muted-foreground text-xs">{t('slugHint')}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cat-fa">{t('nameFa')}</Label>
            <Input
              id="cat-fa"
              value={values.nameFa}
              onChange={(event) => set('nameFa', event.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cat-en">{t('nameEn')}</Label>
              <Input
                id="cat-en"
                dir="ltr"
                value={values.nameEn}
                onChange={(event) => set('nameEn', event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-ps">{t('namePs')}</Label>
              <Input
                id="cat-ps"
                value={values.namePs}
                onChange={(event) => set('namePs', event.target.value)}
              />
            </div>
          </div>
          <p className="text-muted-foreground text-xs">{t('trilingualNote')}</p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t('cancel')}
          </Button>
          <Button
            onClick={submit}
            disabled={pending || values.slug.trim().length < 2 || !values.nameFa.trim()}
          >
            {pending ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
