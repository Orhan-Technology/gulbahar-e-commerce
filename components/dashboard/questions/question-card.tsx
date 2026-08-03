'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Clock, MessageSquareReply, Undo2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { answerQuestion } from '@/lib/actions/questions';
import { formatDate } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

export type ShopQuestionView = {
  id: string;
  body: string;
  status: 'pending' | 'answered' | 'hidden';
  createdAt: string;
  askerName: string;
  productSlug: string;
  productTitle: string;
  productImage: string | null;
  answer: { body: string; createdAt: string } | null;
};

/**
 * One customer question with the shop's answer (Prompt P4).
 *
 * The composer is INLINE, unlike the review reply, which is a dialog. The
 * difference is deliberate: a public reply to a one-star review deserves a beat
 * of deliberation, while a question is a customer waiting for a fact — "yes,
 * size 43 is in stock" — and every extra click between the shopkeeper and that
 * sentence is a question that stays unanswered for another day.
 *
 * Optimistic, with an UNDO rather than a confirm. The answer appears the moment
 * it is sent and the row offers to take it back for a few seconds; a confirm
 * dialog before every answer would cost more attention than the mistake it
 * prevents, and the answer is editable afterwards anyway — sending a second one
 * replaces the first.
 */
export function QuestionCard({
  question,
  autoAnswer = false,
}: {
  question: ShopQuestionView;
  /**
   * Opens the composer on mount, for the question named in `?answer=`.
   *
   * The dashboard's queue row deep-links here, and the whole point of that row
   * is that answering is one tap away — a link that merely scrolls to the
   * question is not that.
   */
  autoAnswer?: boolean;
}) {
  const t = useTranslations('shopQuestions');
  const locale = useLocale();
  const router = useRouter();

  const [open, setOpen] = React.useState(autoAnswer && !question.answer);
  const [body, setBody] = React.useState(question.answer?.body ?? '');
  const [sent, setSent] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const answer =
    sent !== null ? { body: sent, createdAt: new Date(0).toISOString() } : question.answer;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = body.trim();
    if (text.length < 2) return;

    startTransition(async () => {
      const result = await answerQuestion({ questionId: question.id, body: text });
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }

      setSent(text);
      setOpen(false);
      toast.success(t('answered'), {
        action: {
          label: t('undo'),
          // "Undo" reopens the composer with the text still in it rather than
          // deleting the answer: the shopkeeper's intent is almost always to
          // fix a word, and a delete would leave the customer with nothing.
          onClick: () => {
            setSent(null);
            setOpen(true);
          },
        },
      });
      router.refresh();
    });
  }

  return (
    <li className="rounded-card border-border bg-card border p-3">
      <div className="flex items-start gap-3">
        <Link
          href={`/products/${question.productSlug}`}
          className="rounded-control relative h-12 w-12 shrink-0 overflow-hidden bg-neutral-100"
        >
          {question.productImage && (
            <Image src={question.productImage} alt="" fill sizes="48px" className="object-cover" />
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/products/${question.productSlug}`}
              className="hover:text-primary truncate text-sm font-semibold"
              dir="auto"
            >
              {question.productTitle}
            </Link>
            {answer ? (
              <Badge variant="secondary">{t('statusAnswered')}</Badge>
            ) : (
              <Badge variant="warning" className="gap-1">
                <Clock className="h-3 w-3" aria-hidden />
                {t('statusPending')}
              </Badge>
            )}
          </div>

          <p className="text-muted-foreground mt-0.5 text-xs">
            {t('askedBy', {
              name: question.askerName,
              date: formatDate(question.createdAt, locale, 'short'),
            })}
          </p>

          {/* The customer wrote this, and the shopkeeper wrote the answer below;
              either may be in the other language. */}
          <p className="mt-2 text-sm leading-relaxed" dir="auto">
            {question.body}
          </p>

          {answer && !open && (
            <div className="rounded-control border-primary-200 bg-primary-50/50 mt-2 border-s-2 p-2.5">
              <p className="text-primary-800 text-xs font-semibold">{t('yourAnswer')}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-neutral-700" dir="auto">
                {answer.body}
              </p>
            </div>
          )}

          {open ? (
            <form onSubmit={submit} className="mt-2 space-y-2">
              <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={3}
                maxLength={1000}
                autoFocus
                placeholder={t('placeholder')}
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={pending || body.trim().length < 2}>
                  <MessageSquareReply />
                  {pending ? t('sending') : t('send')}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  {t('cancel')}
                </Button>
              </div>
            </form>
          ) : (
            <Button
              type="button"
              variant={answer ? 'ghost' : 'outline'}
              size="sm"
              className="mt-2"
              onClick={() => setOpen(true)}
            >
              {answer ? <Undo2 /> : <MessageSquareReply />}
              {answer ? t('edit') : t('answer')}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
