'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { resetDemoData } from '@/lib/actions/demo';

/**
 * Reseed the demo world (Prompt A4) — DEMO_MODE only.
 *
 * The page does not render this outside DEMO_MODE, and `resetDemoData()` calls
 * `assertDemoMode()` before it does anything. Both matter: an action is
 * reachable by anyone who knows its id whether or not a button exists
 * (CLAUDE.md's three-gate rule).
 *
 * The confirm is TYPE-THE-WORD rather than a second button. This drops every
 * table and reseeds ninety days of history, which takes minutes and signs the
 * presenter out as a side effect — `db:reset` reissues every uuid, so the JWT in
 * the browser names a user that no longer exists. A dialog with "Are you sure?"
 * is one distracted click; typing the word is a decision.
 */
export function DangerZone({ confirmWord }: { confirmWord: string }) {
  const t = useTranslations('adminSettings.danger');
  const router = useRouter();
  const [typed, setTyped] = React.useState('');
  const [running, setRunning] = React.useState(false);

  const armed = typed.trim().toLowerCase() === confirmWord.toLowerCase();

  async function run() {
    setRunning(true);
    const result = await resetDemoData();
    setRunning(false);
    setTyped('');

    if (!result.ok) {
      toast.error(t('failed'));
      return;
    }
    toast.success(t('done'));
    router.refresh();
  }

  return (
    <section className="rounded-card border-danger-border bg-danger-bg space-y-3 border p-4">
      <div className="flex items-start gap-3">
        <span className="text-danger shrink-0">
          <AlertTriangle className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-danger text-sm font-bold">{t('heading')}</h2>
          <p className="mt-1 text-xs leading-relaxed text-neutral-700">{t('body')}</p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-700">{t('signOutWarning')}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="danger-confirm" className="text-xs">
          {t('typeToConfirm', { word: confirmWord })}
        </Label>
        <Input
          id="danger-confirm"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          className="bg-card max-w-xs"
          autoComplete="off"
          disabled={running}
        />
      </div>

      <Button variant="destructive" size="sm" disabled={!armed || running} onClick={run}>
        {running ? t('running') : t('reset')}
      </Button>
    </section>
  );
}
