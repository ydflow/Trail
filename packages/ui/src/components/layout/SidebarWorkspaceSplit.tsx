import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { readPersisted, writePersisted } from '../../lib/persistedPrefs';

const HEIGHT_KEY = 'sidebarWatchlistHeight';
const HANDLE_HEIGHT = 12;

/** A local layout preference: resizing never changes navigation or market state. */
export const SidebarWorkspaceSplit: React.FC<{
  enabled: boolean;
  upper: React.ReactNode;
  children: React.ReactNode;
}> = ({ enabled, upper, children }) => {
  const { t } = useTranslation();
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number; y: number; height: number; latest: number; previous: number | null;
  } | null>(null);
  const [available, setAvailable] = useState(0);
  const [preferred, setPreferred] = useState<number | null>(() => {
    const saved = readPersisted<unknown>(HEIGHT_KEY, null);
    return typeof saved === 'number' && Number.isFinite(saved) && saved > 0 ? saved : null;
  });
  const [dragging, setDragging] = useState(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;
    const measure = () => setAvailable(Math.max(0, container.getBoundingClientRect().height - HANDLE_HEIGHT));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [enabled]);

  // On short windows both panes yield space; the fixed footer stays outside.
  const minimum = Math.min(180, available * 0.6);
  const maximum = Math.max(minimum, available - Math.min(120, available * 0.4));
  const clamp = (value: number) => Math.min(maximum, Math.max(minimum, value));
  const defaultHeight = clamp(Math.max(340, available * 0.4));
  const height = clamp(preferred ?? defaultHeight);

  const save = (value: number | null) => {
    setPreferred(value);
    writePersisted(HEIGHT_KEY, value);
  };
  const cancelDrag = () => {
    if (dragRef.current) setPreferred(dragRef.current.previous);
    dragRef.current = null;
    setDragging(false);
  };

  return (
    <div ref={containerRef} className={`trail-sidebar-panels${dragging ? ' trail-sidebar-panels--resizing' : ''}`}>
      <div className="trail-sidebar-upper">{upper}</div>
      {enabled && <>
        <div
          role="separator"
          tabIndex={0}
          aria-label={t('navigation.resizeWatchlist')}
          aria-orientation="horizontal"
          aria-controls={panelId}
          aria-valuemin={Math.round(minimum)}
          aria-valuemax={Math.round(maximum)}
          aria-valuenow={Math.round(height)}
          title={t('navigation.resizeWatchlistHint')}
          className="trail-sidebar-resize-handle"
          onDoubleClick={() => save(null)}
          onPointerDown={(event) => {
            if (event.button !== 0 || !event.isPrimary || available <= 0) return;
            event.preventDefault();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            dragRef.current = { pointerId: event.pointerId, y: event.clientY, height, latest: height, previous: preferred };
            setDragging(true);
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            if (!drag || event.pointerId !== drag.pointerId) return;
            drag.latest = clamp(drag.height + drag.y - event.clientY);
            setPreferred(drag.latest);
          }}
          onPointerUp={(event) => {
            const drag = dragRef.current;
            if (!drag || event.pointerId !== drag.pointerId) return;
            save(clamp(drag.latest));
            dragRef.current = null;
            setDragging(false);
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={cancelDrag}
          onLostPointerCapture={cancelDrag}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && dragRef.current) {
              const pointerId = dragRef.current.pointerId;
              cancelDrag();
              event.currentTarget.releasePointerCapture(pointerId);
            } else if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
              event.preventDefault();
              if (dragRef.current) return;
              const step = event.shiftKey ? 48 : 16;
              save(event.key === 'Home' ? null : event.key === 'End' ? maximum : clamp(height + (event.key === 'ArrowUp' ? step : -step)));
            }
          }}
        ><span aria-hidden="true" /></div>
        <section id={panelId} aria-label={t('navigation.watchlist')} className="trail-sidebar-watchlist-panel" style={{ height }}>
          {children}
        </section>
      </>}
    </div>
  );
};
