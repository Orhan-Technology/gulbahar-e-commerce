'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Clock, MessageCircleQuestion, Store } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { askQuestion } from '@/lib/actions/questions';
import { formatDate } from '@/lib/format';
import { Link, useRouter } from '@/lib/i18n/navigation';

export type QuestionThreadView = {
  id: string;
  body: string;
  status: 'pending' | 'answered' | 'hidden';
  /** ISO — the clock read belongs on the server (CLAUDE.md). */
  createdAt: string;
  askerName: string;
  mine: boolean;
  answer: { body: string; createdAt: string } | null;
};

/**
 * Questions and answers on a product (Prompt P4).
 *
 * The section NEVER HIDES. A product with no questions shows the composer and
 * an invitation to ask the first one, because the empty state is the moment the
 * feature is most useful — somebody is looking at this page with a question
 * right now, and the alternative is that they leave with it.
 *
 * A PENDING question is visible only to the person who asked it, marked as
 * awaiting an answer. Publishing unanswered questions would turn the section
 * into a list of a shop's silences, which is a punishment the shop has not
 * earned and a bad first impression the customer did not intend to cause.
 *
 * Signed-out visitors get the sign-in link with `?next=` back to this product,
 * so asking does not cost them their place.
 */
export function QuestionSection({
  productSlug,
  threads,
  signedIn,
  shopName,
}: {
  productSlug: string;
  threads: QuestionThreadView[];
  signedIn: boolean;
  shopName: string;
}) {
  const t = useTranslations('product.questions');
  const locale = useLocale();
  const router = useRouter();

  const [body, setBody] = React.useState('');
  const [pending, startTransition] = React.useTransition();
  /*
   * Optimistic rows live beside the server's, not merged into them: the server
   * list is re-fetched by `router.refresh()` and would otherwise briefly show
   * the same question twice.
   */
  const [optimistic, setOptimistic] = React.useState<QuestionThreadView[]>([]);

  const serverIds = new Set(threads.map((thread) => thread.id));
  const visibleOptimistic = optimistic.filter((thread) => !serverIds.has(thread.id));
  const all = [...visibleOptimistic, ...threads];

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = body.trim();
    if (text.length < 10) {
      toast.error(t('tooShort'));
      return;
    }

    startTransition(async () => {
      const result = await askQuestion({ productSlug, body: text });
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }

      setOptimistic((current) => [
        {
          id: result.data.id,
          body: text,
          status: 'pending' as const,
          // The row is replaced by the server's copy on the next refresh; this
          // date only has to be right for the seconds it is on screen.
          createdAt: new Date().toISOString(),
          askerName: t('you'),
          mine: true,
          answer: null,
        },
        ...current,
      ]);
      setBody('');
      toast.success(t('sent'));
      router.refresh();
    });
  }

  return (
    <section id="questions" className="scroll-mt-24 space-y-4" aria-labelledby="questions-heading">
      <h2 id="questions-heading" className="text-foreground text-xl font-bold">
        {t('heading')}
      </h2>

      {signedIn ? (
        <form onSubmit={submit} className="rounded-card border-border bg-card space-y-2 border p-4">
          <label htmlFor="question-body" className="text-sm font-medium">
            {t('composerLabel')}
          </label>
          <Textarea
            id="question-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={3}
            maxLength={500}
            placeholder={t('placeholder')}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? t('sending') : t('ask')}
            </Button>
            <span className="text-muted-foreground text-xs">{t('shopWillAnswer', { shop: shopName })}</span>
          </div>
        </form>
      ) : (
        <div className="rounded-card border-border bg-card flex flex-wrap items-center justify-between gap-3 border p-4">
          <p className="text-muted-foreground text-sm">{t('signInToAsk')}</p>
          <Button asChild size="sm" variant="outline">
            {/* `next` brings them back to the product, not to the account hub. */}
            <Link href={`/account/sign-in?next=/products/${productSlug}`}>{t('signIn')}</Link>
          </Button>
        </div>
      )}

      {all.length === 0 ? (
        <div className="rounded-card border-border flex flex-col items-center gap-2 border border-dashed px-6 py-8 text-center">
          <span className="rounded-pill bg-primary-50 text-primary-600 flex h-12 w-12 items-center justify-center">
            <MessageCircleQuestion className="h-6 w-6" aria-hidden />
          </span>
          <p className="text-sm font-semibold">{t('emptyTitle')}</p>
          <p className="text-muted-foreground max-w-sm text-sm">{t('emptyBody')}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {all.map((thread) => (
            <li key={thread.id} className="rounded-card border-border bg-card border p-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-semibold">{thread.askerName}</span>
                <span className="text-muted-foreground text-xs">
                  {formatDate(thread.createdAt, locale, 'short')}
                </span>
                {thread.status === 'pending' && (
                  <span className="rounded-pill bg-warning-bg text-warning-fg text-2xs inline-flex items-center gap-1 px-2 py-0.5 font-medium">
                    <Clock className="h-3 w-3" aria-hidden />
                    {t('awaitingAnswer')}
                  </span>
                )}
              </div>

              <p className="mt-1 text-sm leading-relaxed">{thread.body}</p>

              {thread.answer && (
                /* Indented and badged, so it reads as the shop speaking rather
                   than as another customer's opinion. */
                <div className="rounded-control border-primary-200 bg-primary-50/50 mt-3 border-s-2 p-3">
                  <p className="text-primary-800 flex items-center gap-1.5 text-xs font-semibold">
                    <Store className="h-3.5 w-3.5" aria-hidden />
                    {t('shopAnswer', { shop: shopName })}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-neutral-700">
                    {thread.answer.body}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
