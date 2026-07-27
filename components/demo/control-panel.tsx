'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  User,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  demoAccounts,
  demoScrubbableOrders,
  demoShops,
  resetDemoData,
  scrubOrderStatus,
  switchDemoUser,
  triggerNewOrder,
  triggerShopRegistration,
} from '@/lib/actions/demo';
import { QUALITY_BAR_SCREENS } from '@/lib/demo';
import { Link } from '@/lib/i18n/navigation';

type Accounts = Awaited<ReturnType<typeof demoAccounts>>;
type Orders = Awaited<ReturnType<typeof demoScrubbableOrders>>;
type Shops = Awaited<ReturnType<typeof demoShops>>;

/**
 * Presenter control panel (PRD §9.3).
 *
 * Opened with ctrl/cmd+shift+D and never by a visible button, so it cannot be
 * stumbled into on stage. Everything it does goes through the real actions — the
 * scrubber writes order_events and notifications, the scenario triggers create real
 * rows — because a panel that faked state would produce a walkthrough where the
 * notification log and the customer's timeline contradict each other.
 *
 * Data is fetched when the panel OPENS rather than on mount: the shortcut is
 * available on every page of every surface, and four queries per navigation for a
 * panel nobody has opened would be pure waste.
 */
export function DemoControlPanel({ currentShopId }: { currentShopId: string | null }) {
  const t = useTranslations('demoPanel');
  const locale = useLocale();
  const router = useRouter();

  const [open, setOpen] = React.useState(false);
  const [accounts, setAccounts] = React.useState<Accounts | null>(null);
  const [orders, setOrders] = React.useState<Orders | null>(null);
  const [shops, setShops] = React.useState<Shops | null>(null);
  const [targetShop, setTargetShop] = React.useState<string | null>(currentShopId);
  const [resetStage, setResetStage] = React.useState<'idle' | 'confirm' | 'running'>('idle');
  const [pending, startTransition] = React.useTransition();

  const refresh = React.useCallback(async () => {
    const [nextAccounts, nextOrders, nextShops] = await Promise.all([
      demoAccounts(locale),
      demoScrubbableOrders(),
      demoShops(locale),
    ]);
    setAccounts(nextAccounts);
    setOrders(nextOrders);
    setShops(nextShops);
  }, [locale]);

  /*
   * Loading happens HERE, on the open event, not in an effect watching `open`.
   * React 19 forbids calling setState synchronously from an effect body, and an
   * effect would be the wrong tool anyway: opening the panel is a user action, and
   * this is its handler.
   */
  const toggle = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) startTransition(async () => void (await refresh()));
    },
    [refresh, startTransition],
  );

  // ctrl/cmd + shift + D. One listener for the whole app; the effect body only
  // subscribes, which is exactly what an effect is for.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        setOpen((current) => {
          if (!current) startTransition(async () => void (await refresh()));
          return !current;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [refresh, startTransition]);

  function run<T>(work: () => Promise<T>, onDone: (result: T) => void) {
    startTransition(async () => {
      const result = await work();
      onDone(result);
    });
  }

  return (
    <Dialog open={open} onOpenChange={toggle}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="text-accent-600 h-4 w-4" aria-hidden />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('subtitle')}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="roles">
          <TabsList>
            <TabsTrigger value="roles">{t('tabs.roles')}</TabsTrigger>
            <TabsTrigger value="orders">{t('tabs.orders')}</TabsTrigger>
            <TabsTrigger value="scenarios">{t('tabs.scenarios')}</TabsTrigger>
            <TabsTrigger value="links">{t('tabs.links')}</TabsTrigger>
          </TabsList>

          {/* 1 — Role switcher */}
          <TabsContent value="roles" className="space-y-4 pt-4">
            <p className="text-muted-foreground text-xs">{t('roles.hint')}</p>

            {accounts?.ok ? (
              <>
                <AccountGroup
                  label={t('roles.admin')}
                  icon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden />}
                  accounts={accounts.data.admins.map((entry) => ({
                    phone: entry.phone,
                    primary: entry.name,
                    secondary: null,
                  }))}
                  disabled={pending}
                  onPick={(phone) =>
                    run(
                      () => switchDemoUser(phone),
                      (result) => {
                        if (!result.ok) {
                          toast.error(t(`errors.${result.error}` as never));
                          return;
                        }
                        toast.success(t('roles.switched'));
                        setOpen(false);
                        // The session cookie changed; re-render as the new person.
                        router.refresh();
                      },
                    )
                  }
                />
                <AccountGroup
                  label={t('roles.shopkeeper')}
                  icon={<Store className="h-3.5 w-3.5" aria-hidden />}
                  accounts={accounts.data.shopkeepers.map((entry) => ({
                    phone: entry.phone,
                    primary: entry.name,
                    secondary: entry.shopName,
                  }))}
                  disabled={pending}
                  onPick={(phone) =>
                    run(
                      () => switchDemoUser(phone),
                      (result) => {
                        if (!result.ok) {
                          toast.error(t(`errors.${result.error}` as never));
                          return;
                        }
                        toast.success(t('roles.switched'));
                        setOpen(false);
                        router.refresh();
                      },
                    )
                  }
                />
                <AccountGroup
                  label={t('roles.customer')}
                  icon={<User className="h-3.5 w-3.5" aria-hidden />}
                  accounts={accounts.data.customers.map((entry) => ({
                    phone: entry.phone,
                    primary: entry.name,
                    secondary: null,
                  }))}
                  disabled={pending}
                  onPick={(phone) =>
                    run(
                      () => switchDemoUser(phone),
                      (result) => {
                        if (!result.ok) {
                          toast.error(t(`errors.${result.error}` as never));
                          return;
                        }
                        toast.success(t('roles.switched'));
                        setOpen(false);
                        router.refresh();
                      },
                    )
                  }
                />
              </>
            ) : (
              <p className="text-muted-foreground text-sm">{t('loading')}</p>
            )}
          </TabsContent>

          {/* 2 — Order scrubber */}
          <TabsContent value="orders" className="space-y-3 pt-4">
            <p className="text-muted-foreground text-xs">{t('orders.hint')}</p>

            {orders?.ok ? (
              orders.data.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t('orders.none')}</p>
              ) : (
                <ul className="space-y-2">
                  {orders.data.map((order) => (
                    <li
                      key={order.id}
                      className="rounded-control border-border flex flex-wrap items-center gap-2 border p-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium" dir="ltr">
                          {order.reference}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {order.shopName} · {order.customerName}
                        </p>
                      </div>
                      <Badge variant="secondary">{t(`status.${order.status}`)}</Badge>
                      <div className="flex items-center gap-1">
                        {/* Chevrons mirror in RTL so "back" always points backwards. */}
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label={t('orders.back')}
                          disabled={pending || order.status === 'placed'}
                          onClick={() =>
                            run(
                              () => scrubOrderStatus({ orderId: order.id, direction: 'back' }),
                              (result) => {
                                if (!result.ok) {
                                  toast.error(t(`errors.${result.error}` as never));
                                  return;
                                }
                                toast.success(t(`orders.movedTo.${result.data.status}` as never));
                                void refresh();
                                router.refresh();
                              },
                            )
                          }
                        >
                          <ChevronLeft className="rtl:rotate-180" />
                        </Button>
                        <Button
                          size="icon"
                          aria-label={t('orders.forward')}
                          disabled={pending}
                          onClick={() =>
                            run(
                              () => scrubOrderStatus({ orderId: order.id, direction: 'forward' }),
                              (result) => {
                                if (!result.ok) {
                                  toast.error(t(`errors.${result.error}` as never));
                                  return;
                                }
                                toast.success(t(`orders.movedTo.${result.data.status}` as never));
                                void refresh();
                                router.refresh();
                              },
                            )
                          }
                        >
                          <ChevronRight className="rtl:rotate-180" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <p className="text-muted-foreground text-sm">{t('loading')}</p>
            )}
          </TabsContent>

          {/* 3 + 4 — Scenario triggers and reset */}
          <TabsContent value="scenarios" className="space-y-5 pt-4">
            <section className="space-y-2">
              <h3 className="text-sm font-bold">{t('scenarios.newOrderHeading')}</h3>
              <p className="text-muted-foreground text-xs">{t('scenarios.newOrderHint')}</p>

              {shops?.ok && (
                <div className="flex scrollbar-none gap-1.5 overflow-x-auto pb-1">
                  {shops.data.map((shop) => (
                    <button
                      key={shop.id}
                      type="button"
                      onClick={() => setTargetShop(shop.id)}
                      className={`rounded-pill shrink-0 border px-2.5 py-1 text-xs ${
                        targetShop === shop.id
                          ? 'border-primary bg-primary-50 text-primary font-medium'
                          : 'border-border hover:border-primary'
                      }`}
                    >
                      {shop.name}
                    </button>
                  ))}
                </div>
              )}

              <Button
                size="sm"
                disabled={pending || !targetShop}
                onClick={() =>
                  targetShop &&
                  run(
                    () => triggerNewOrder(targetShop),
                    (result) => {
                      if (!result.ok) {
                        toast.error(t(`errors.${result.error}` as never));
                        return;
                      }
                      toast.success(
                        t('scenarios.orderCreated', { reference: result.data.reference }),
                      );
                      void refresh();
                      router.refresh();
                    },
                  )
                }
              >
                <ShoppingBag />
                {t('scenarios.newOrder')}
              </Button>
            </section>

            <section className="border-border space-y-2 border-t pt-4">
              <h3 className="text-sm font-bold">{t('scenarios.newShopHeading')}</h3>
              <p className="text-muted-foreground text-xs">{t('scenarios.newShopHint')}</p>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  run(
                    () => triggerShopRegistration(),
                    (result) => {
                      if (!result.ok) {
                        toast.error(t(`errors.${result.error}` as never));
                        return;
                      }
                      toast.success(t('scenarios.shopCreated', { name: result.data.name }));
                      router.refresh();
                    },
                  )
                }
              >
                <Store />
                {t('scenarios.newShop')}
              </Button>
            </section>

            {/* Reset — double-confirm, because it destroys everything. */}
            <section className="border-border space-y-2 border-t pt-4">
              <h3 className="text-danger text-sm font-bold">{t('reset.heading')}</h3>
              <p className="text-muted-foreground text-xs">{t('reset.hint')}</p>

              {resetStage === 'idle' && (
                <Button variant="outline" size="sm" onClick={() => setResetStage('confirm')}>
                  <RotateCcw />
                  {t('reset.start')}
                </Button>
              )}

              {resetStage === 'confirm' && (
                <div className="rounded-card border-danger-border bg-danger-bg space-y-2 border p-3">
                  <p className="text-danger text-xs font-medium">{t('reset.confirmBody')}</p>
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setResetStage('running');
                        run(
                          () => resetDemoData(),
                          (result) => {
                            setResetStage('idle');
                            if (!result.ok) {
                              toast.error(t('reset.failed'));
                              return;
                            }
                            toast.success(t('reset.done'));
                            setOpen(false);
                            router.refresh();
                          },
                        );
                      }}
                    >
                      {t('reset.confirm')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setResetStage('idle')}>
                      {t('reset.cancel')}
                    </Button>
                  </div>
                </div>
              )}

              {resetStage === 'running' && (
                <div className="rounded-card border-border bg-card space-y-1 border p-3">
                  <p className="text-sm font-medium">{t('reset.running')}</p>
                  <p className="text-muted-foreground text-xs">{t('reset.runningHint')}</p>
                </div>
              )}
            </section>
          </TabsContent>

          {/* 5 — Quick links */}
          <TabsContent value="links" className="space-y-3 pt-4">
            <p className="text-muted-foreground text-xs">{t('links.hint')}</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {QUALITY_BAR_SCREENS.map((screen, index) => (
                <li key={screen.key}>
                  <Link
                    href={screen.href}
                    onClick={() => setOpen(false)}
                    className="rounded-card border-border bg-card hover:border-primary flex items-center gap-3 border p-3"
                  >
                    <span
                      className="rounded-control bg-primary-50 text-primary flex h-8 w-8 shrink-0 items-center justify-center text-sm font-bold"
                      aria-hidden
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-medium">
                      {t(`links.${screen.key}`)}
                    </span>
                    <ExternalLink
                      className="text-muted-foreground h-3.5 w-3.5 shrink-0"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </TabsContent>
        </Tabs>

        <p className="text-muted-foreground border-border border-t pt-3 text-xs">
          {t('shortcutHint')}
        </p>
      </DialogContent>
    </Dialog>
  );
}

function AccountGroup({
  label,
  icon,
  accounts,
  disabled,
  onPick,
}: {
  label: string;
  icon: React.ReactNode;
  accounts: Array<{ phone: string; primary: string; secondary: string | null }>;
  disabled: boolean;
  onPick: (phone: string) => void;
}) {
  if (accounts.length === 0) return null;

  return (
    <section className="space-y-1.5">
      <h3 className="text-muted-foreground flex items-center gap-1.5 text-xs font-bold uppercase">
        {icon}
        {label}
      </h3>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {accounts.map((account) => (
          <li key={account.phone}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(account.phone)}
              className="rounded-control border-border hover:border-primary hover:bg-primary-50 w-full border p-2 text-start disabled:opacity-50"
            >
              <span className="block text-sm font-medium">{account.primary}</span>
              <span className="text-muted-foreground block text-xs">
                {/* The number is Latin even in Dari; the shop name is not, so they
                    cannot share one dir. */}
                <span dir="ltr">{account.phone}</span>
                {account.secondary ? ` · ${account.secondary}` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
