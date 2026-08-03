'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FileText, Paperclip, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { submitVerification } from '@/lib/actions/verification';

const KINDS = ['business_licence', 'owner_id', 'unit_agreement', 'other'] as const;
type Kind = (typeof KINDS)[number];

type Attachment = {
  /** A stable key for React, not sent anywhere. */
  key: string;
  file: File;
  kind: Kind;
  /** An object URL for images, revoked on removal. */
  preview: string | null;
};

/**
 * The shop's side of verification (Prompt C7).
 *
 * Files are held in COMPONENT STATE until the shopkeeper presses submit, which
 * is what makes replace and remove possible: an upload-on-select flow would
 * write a tazkira to disk the moment someone picked the wrong file, and then
 * need a delete endpoint to undo it. Nothing leaves the browser until the whole
 * set is right.
 *
 * Each file carries its KIND beside it rather than by position. A licence
 * uploaded second and labelled by index becomes an "owner id" the moment
 * another upload fails, and the admin reviews the wrong thing.
 *
 * The statement above the picker is not boilerplate: these are identity
 * documents, and a person handing them over is entitled to know who reads them
 * and where they go before they choose a file, not after.
 */
export function VerificationForm({ canSubmit }: { canSubmit: boolean }) {
  const t = useTranslations('shopVerification');
  const router = useRouter();

  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [note, setNote] = React.useState('');
  const [pending, startTransition] = React.useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    // Object URLs are a leak if the component unmounts with previews open.
    return () => {
      for (const attachment of attachments) {
        if (attachment.preview) URL.revokeObjectURL(attachment.preview);
      }
    };
  }, [attachments]);

  function add(files: FileList | null) {
    if (!files) return;

    const next: Attachment[] = [...files].slice(0, 6 - attachments.length).map((file) => ({
      key: `${file.name}-${file.size}-${Math.round(file.lastModified)}`,
      file,
      kind: 'business_licence' as Kind,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    }));

    setAttachments((current) => [...current, ...next]);
    if (inputRef.current) inputRef.current.value = '';
  }

  function remove(key: string) {
    setAttachments((current) => {
      const target = current.find((attachment) => attachment.key === key);
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return current.filter((attachment) => attachment.key !== key);
    });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (attachments.length === 0) return;

    const formData = new FormData();
    attachments.forEach((attachment, index) => {
      formData.append(`file_${index}`, attachment.file);
      formData.append(`kind_${index}`, attachment.kind);
    });
    formData.append('note', note);

    startTransition(async () => {
      const result = await submitVerification(formData);
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t('submitted'));
      setAttachments([]);
      setNote('');
      router.refresh();
    });
  }

  if (!canSubmit) return null;

  return (
    <form onSubmit={submit} className="rounded-card border-border bg-card space-y-4 border p-4">
      <div>
        <h2 className="text-sm font-bold">{t('uploadTitle')}</h2>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{t('certifyNote')}</p>
      </div>

      <div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="sr-only"
          id="verification-files"
          onChange={(event) => add(event.target.files)}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          <Paperclip />
          {t('chooseFiles')}
        </Button>
        <p className="text-muted-foreground mt-1 text-xs">{t('fileHint')}</p>
      </div>

      {attachments.length > 0 && (
        <ul className="space-y-2">
          {attachments.map((attachment) => (
            <li
              key={attachment.key}
              className="rounded-control border-border flex flex-wrap items-center gap-3 border p-2"
            >
              <span className="rounded-control flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden bg-neutral-100">
                {attachment.preview ? (
                  /*
                   * A plain <img>, and one of the few in this product.
                   *
                   * The source is a local object URL for a file that has not
                   * left the browser: next/image would try to fetch and
                   * optimise it on the server, which cannot see it. The fixed
                   * 48px box above supplies the dimensions the audit rule is
                   * really asking for.
                   */
                  // audit-allow raw-img — a local object URL, sized by its container
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={attachment.preview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <FileText className="h-5 w-5 text-neutral-500" aria-hidden />
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium" dir="auto">
                  {attachment.file.name}
                </span>
                <span className="text-muted-foreground text-2xs">
                  {Math.max(1, Math.round(attachment.file.size / 1024))} KB
                </span>
              </span>

              <Select
                value={attachment.kind}
                onValueChange={(value) =>
                  setAttachments((current) =>
                    current.map((entry) =>
                      entry.key === attachment.key ? { ...entry, kind: value as Kind } : entry,
                    ),
                  )
                }
              >
                <SelectTrigger className="h-8 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {t(`kinds.${kind}` as never)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(attachment.key)}
                aria-label={t('removeFile')}
                className="hover:text-danger text-neutral-500"
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="verification-note">{t('noteLabel')}</Label>
        <Textarea
          id="verification-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          maxLength={500}
          placeholder={t('notePlaceholder')}
        />
      </div>

      <Button type="submit" disabled={pending || attachments.length === 0}>
        <Upload />
        {pending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
