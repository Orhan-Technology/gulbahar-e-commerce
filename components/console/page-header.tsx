import * as React from 'react';

/**
 * The one page-header recipe for both consoles (Prompt C3).
 *
 * Title, an optional line of description, and a slot for actions — the range
 * control, a primary button, a filter. Shared because the shopkeeper panel and
 * the mall console were visibly two products by two teams: one centred its
 * heading, the other left-aligned it, and neither had anywhere consistent to
 * put a control.
 *
 * ONE STRING PER FACT. The description says something the title does not; if it
 * would repeat the title, the count in a card below it, or the shop name
 * already in the chrome, it is omitted. That rule is the whole reason this
 * component exists rather than a `<h1>` per page.
 */
export function ConsolePageHeader({
  title,
  description,
  actions,
}: {
  /**
   * A string in almost every case. A NODE is allowed for the one header whose
   * title is itself a server component — the shopkeeper's greeting, which has
   * to await its translations.
   */
  title: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {typeof title === 'string' ? <h1 className="text-lg font-bold">{title}</h1> : title}
        {description && (
          <p className="text-muted-foreground max-w-prose text-sm">{description}</p>
        )}
      </div>

      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
