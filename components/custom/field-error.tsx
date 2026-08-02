import { AlertCircle } from 'lucide-react';

/**
 * The message under an input that is wrong.
 *
 * Every form in the shop panel reported failures as a TOAST of a translated
 * code — which for a shopkeeper on a phone behind a counter is the weakest
 * surface available: it appears away from the field, it names nothing, and it
 * has gone by the time they look up from a customer. This puts the sentence
 * under the control it is about, in their language, and says what to do rather
 * than what happened.
 *
 * Renders nothing when there is no message, so a caller can drop it under every
 * field unconditionally.
 *
 * The `id` is the contract with the input: pair it with `aria-describedby` and
 * `aria-invalid` on the control, or a screen reader announces a red line it has
 * no way to connect to the field.
 */
export function FieldError({ id, message }: { id: string; message?: string | null }) {
  if (!message) return null;

  return (
    <p id={id} role="alert" className="text-danger flex items-start gap-1.5 text-xs font-medium">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  );
}
