import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { FlaskConical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog } from './Dialog';

/**
 * Small "Sample data" chip. Rendered next to any surface whose content comes
 * from the built-in demo dataset (`src/demo/demoData.ts`) instead of a live
 * market-data provider or LLM runtime, so sample content is never mistaken
 * for real data. The tooltip carries the full explanation.
 */
export const DemoBadge: React.FC<{ className?: string; reason?: string }> = ({ className = '', reason }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <><button
      type="button"
      data-testid="demo-badge"
      title={t('demo.hint')}
      aria-label={t('demo.about')}
      aria-haspopup="dialog"
      onClick={() => setOpen(true)}
      className={`inline-flex shrink-0 cursor-help items-center gap-1 rounded-full border border-[var(--mac-border)] bg-foreground/[0.04] px-2 py-0.5 text-[10px] font-medium text-foreground/55 ${className}`}
    >
      <FlaskConical className="h-3 w-3" aria-hidden="true" />
      {t('demo.badge')}
    </button>
    {open && createPortal(<Dialog open={open} onClose={() => setOpen(false)} title={t('demo.badge')}>
      <p className="text-sm leading-relaxed text-foreground/72">{t('demo.hint')}</p>
      {reason && <p className="mt-3 text-sm leading-relaxed text-foreground" data-testid="demo-reason">{reason}</p>}
      <p className="mt-3 text-xs leading-relaxed text-foreground/54">{t('demo.realDataHint')}</p>
    </Dialog>, document.body)}</>
  );
};
