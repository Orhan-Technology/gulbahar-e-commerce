'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { EyeOff, Store, Undo2 } from 'lucide-react';
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
import { setQuestionHidden } from '@/lib/actions/questions';
import { formatDate } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

export type ModeratedQuestion = {
  id: string;
  body: string;
  status: 'pending' | 'answered' | 'hidden';
  createdAt: string;
  askerName: string;
  productSlug: string;
  productTitle: string;
  shopName: string;
  answerBody: string | null;
};

/**
 * Admin moderation of a customer question (Prompt P4).
 *
 * The same rule as review moderation (PRD §7.2, §3.1): admin decides
 * VISIBILITY and never wording. There is no edit control here and there must
 * not be one — hiding an abusive question is governance, rewriting it is
 * putting words in a customer's mouth.
 *
 * Hiding asks first because it removes something a shop may already have
 * answered; restoring does not, because it can only ever put back what was
 * there. Restoring returns the question to `answered` when an answer exists —
 * see the action, which works that out from the data rather than guessing.
 */
export function QuestionModerationCard({ question }: { question: ModeratedQuestion }) {
  const t = useTranslations('adminQuestions');
  const locale = useLocale();
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const hidden = question.status === 'hidden';

  function run(next: boolean) {
    startTransition(async () => {
      const result = await setQuestionHidden(question.id, next);
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(next ? t('hidden') : t('restored'));
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <li className="rounded-card border-border bg-card border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/products/${question.productSlug}`}
            className="hover:text-primary text-sm font-semibold"
          >
            {question.productTitle}
          </Link>
          <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-2 text-xs">
            <span className="flex items-center gap-1">
              <Store className="h-3 w-3" aria-hidden />
              {question.shopName}
            </span>
            <span>
              {t('askedBy', {
                name: question.askerName,
                date: formatDate(question.createdAt, locale, 'short'),
              })}
            </span>
          </p>
        </div>

        <Badge variant={hidden ? 'destructive' : question.answerBody ? 'secondary' : 'warning'}>
          {t(`status.${question.status}`)}
        </Badge>
      </div>

      <p className="mt-3 text-sm leading-relaxed">{question.body}</p>

      {question.answerBody && (
        <div className="rounded-control border-primary-200 bg-primary-50/50 mt-3 border-s-2 p-3">
          <p className="text-primary-800 text-xs font-semibold">{t('shopAnswer')}</p>
          <p className="mt-1 text-sm leading-relaxed text-neutral-700">{question.answerBody}</p>
        </div>
      )}

      <div className="mt-3 flex justify-end">
        {hidden ? (
          <Button variant="outline" size="sm" disabled={pending} onClick={() => run(false)}>
            <Undo2 />
            {t('restore')}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="hover:text-danger text-neutral-600"
            onClick={() => setConfirming(true)}
          >
            <EyeOff />
            {t('hide')}
          </Button>
        )}
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('hideTitle')}</DialogTitle>
            <DialogDescription>{t('hideBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" disabled={pending} onClick={() => run(true)}>
              {pending ? t('working') : t('confirmHide')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
