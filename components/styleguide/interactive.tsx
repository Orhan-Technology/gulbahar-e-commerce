'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Filter, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { z } from 'zod';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Interactive half of the styleguide (Prompt 2.2). Every overlay primitive is
 * exercised here so RTL regressions — sheet sliding from the wrong edge, toast
 * landing in the wrong corner, unmirrored chevrons — are visible at a glance
 * rather than discovered in Phase 5.
 */
export function StyleguideInteractive() {
  const t = useTranslations('styleguide.interactive');

  return (
    <div className="space-y-10">
      <Group title={t('overlays')}>
        <DialogDemo />
        <SheetDemo side="start" label={t('sheetStart')} />
        <SheetDemo side="end" label={t('sheetEnd')} />
        <DropdownDemo />
        <PopoverDemo />
        <TooltipDemo />
        <ToastDemo />
      </Group>

      <Group title={t('tabs')}>
        <TabsDemo />
      </Group>

      <Group title={t('controls')}>
        <ControlsDemo />
      </Group>

      <Group title={t('form')}>
        <ValidationFormDemo />
      </Group>

      <Group title={t('dataDisplay')}>
        <TableDemo />
      </Group>

      <Group title={t('skeletons')}>
        <div className="w-full max-w-sm space-y-2">
          <Skeleton className="h-32 w-full rounded-card" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </Group>

      <Group title={t('pagination')}>
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious href="#" />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#" isActive>
                ۱
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#">۲</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext href="#" />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </div>
  );
}

function DialogDemo() {
  const t = useTranslations('styleguide.interactive');
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">{t('openDialog')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('dialogTitle')}</DialogTitle>
          <DialogDescription>{t('dialogBody')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost">{t('cancel')}</Button>
          <Button variant="destructive">{t('confirmDelete')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SheetDemo({ side, label }: { side: 'start' | 'end'; label: string }) {
  const t = useTranslations('styleguide.interactive');
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">
          <Filter />
          {label}
        </Button>
      </SheetTrigger>
      <SheetContent side={side}>
        <SheetHeader>
          <SheetTitle>{t('sheetTitle')}</SheetTitle>
          <SheetDescription>{t('sheetBody')}</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  );
}

function DropdownDemo() {
  const t = useTranslations('styleguide.interactive');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label={t('openMenu')}>
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>{t('menuLabel')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Pencil />
          {t('edit')}
        </DropdownMenuItem>
        <DropdownMenuItem className="text-danger">
          <Trash2 />
          {t('delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PopoverDemo() {
  const t = useTranslations('styleguide.interactive');
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">{t('openPopover')}</Button>
      </PopoverTrigger>
      <PopoverContent>
        <p className="text-sm">{t('popoverBody')}</p>
      </PopoverContent>
    </Popover>
  );
}

function TooltipDemo() {
  const t = useTranslations('styleguide.interactive');
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost">{t('hoverMe')}</Button>
        </TooltipTrigger>
        <TooltipContent>{t('tooltipBody')}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ToastDemo() {
  const t = useTranslations('styleguide.interactive');
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => toast.success(t('toastSuccess'))}>
        {t('showSuccessToast')}
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.error(t('toastError'), {
            action: { label: t('retry'), onClick: () => toast.success(t('toastSuccess')) },
          })
        }
      >
        {t('showErrorToast')}
      </Button>
    </div>
  );
}

function TabsDemo() {
  const t = useTranslations('styleguide.interactive');
  return (
    <Tabs defaultValue="offers" className="w-full max-w-md">
      <TabsList>
        <TabsTrigger value="offers">{t('tabOffers')}</TabsTrigger>
        <TabsTrigger value="featured">{t('tabFeatured')}</TabsTrigger>
      </TabsList>
      <TabsContent value="offers" className="pt-3 text-sm">
        {t('tabOffersBody')}
      </TabsContent>
      <TabsContent value="featured" className="pt-3 text-sm">
        {t('tabFeaturedBody')}
      </TabsContent>
    </Tabs>
  );
}

function ControlsDemo() {
  const t = useTranslations('styleguide.interactive');
  return (
    <div className="grid w-full gap-6 sm:grid-cols-2">
      <div className="space-y-3">
        <Label>{t('selectLabel')}</Label>
        <Select>
          <SelectTrigger>
            <SelectValue placeholder={t('selectPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="electronics">{t('optionElectronics')}</SelectItem>
            <SelectItem value="cosmetics">{t('optionCosmetics')}</SelectItem>
            <SelectItem value="watches">{t('optionWatches')}</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Checkbox id="sg-instock" />
          <Label htmlFor="sg-instock">{t('inStockOnly')}</Label>
        </div>

        <div className="flex items-center gap-2">
          <Switch id="sg-published" defaultChecked />
          <Label htmlFor="sg-published">{t('published')}</Label>
        </div>
      </div>

      <div className="space-y-3">
        <Label>{t('fulfillment')}</Label>
        <RadioGroup defaultValue="delivery">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="delivery" id="sg-delivery" />
            <Label htmlFor="sg-delivery">{t('delivery')}</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="pickup" id="sg-pickup" />
            <Label htmlFor="sg-pickup">{t('pickup')}</Label>
          </div>
        </RadioGroup>

        <Separator />
        <div className="flex items-center gap-2">
          <Avatar>
            <AvatarFallback>ن ا</AvatarFallback>
          </Avatar>
          <span className="text-sm">{t('avatarName')}</span>
        </div>
      </div>
    </div>
  );
}

function ValidationFormDemo() {
  const t = useTranslations('styleguide.interactive');

  /*
   * Schema built inside the component so validation messages come from
   * translations — an English-only error string would break the Dari-first
   * rule as visibly as an untranslated label.
   */
  const schema = React.useMemo(
    () =>
      z.object({
        title: z.string().min(3, { message: t('errors.titleShort') }),
        phone: z.string().regex(/^07\d{8}$/, { message: t('errors.phoneFormat') }),
        /*
         * Validated as a string, not z.coerce.number(): the field is backed by a
         * text input, and coercion makes react-hook-form's input type `unknown`.
         * Digits-only also rejects decimals and negatives in one rule, which
         * matches the integer-afghani storage rule (CLAUDE.md).
         */
        price: z
          .string()
          .min(1, { message: t('errors.priceNumber') })
          .regex(/^\d+$/, { message: t('errors.priceInteger') })
          .refine((value) => Number(value) > 0, { message: t('errors.pricePositive') }),
        notes: z
          .string()
          .max(120, { message: t('errors.notesLong') })
          .optional(),
      }),
    [t],
  );

  const form = useForm<z.input<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', phone: '', price: '', notes: '' },
    mode: 'onBlur',
  });

  return (
    <Form {...form}>
      <form
        className="w-full max-w-md space-y-4"
        onSubmit={form.handleSubmit(() => toast.success(t('formSubmitted')))}
      >
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('fieldTitle')}</FormLabel>
              <FormControl>
                <Input placeholder={t('fieldTitlePlaceholder')} {...field} />
              </FormControl>
              <FormDescription>{t('fieldTitleHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('fieldPhone')}</FormLabel>
              <FormControl>
                <Input inputMode="numeric" placeholder="0700000000" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="price"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('fieldPrice')}</FormLabel>
              <FormControl>
                <Input inputMode="numeric" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('fieldNotes')}</FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-wrap gap-2">
          <Button type="submit">{t('submit')}</Button>
          <Button type="button" variant="ghost" onClick={() => form.reset()}>
            {t('reset')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void form.trigger();
            }}
          >
            {t('showErrors')}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function TableDemo() {
  const t = useTranslations('styleguide.interactive');
  const rows = [
    { product: t('rowPhone'), orders: '۲۴', revenue: '؋ ۱۲۰٬۰۰۰' },
    { product: t('rowPerfume'), orders: '۱۱', revenue: '؋ ۳۳٬۰۰۰' },
    { product: t('rowWatch'), orders: '۷', revenue: '؋ ۲۱٬۵۰۰' },
  ];

  return (
    <div className="w-full overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('colProduct')}</TableHead>
            <TableHead>{t('colOrders')}</TableHead>
            <TableHead>{t('colRevenue')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.product}>
              <TableCell className="font-medium">{row.product}</TableCell>
              <TableCell>{row.orders}</TableCell>
              <TableCell>{row.revenue}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
