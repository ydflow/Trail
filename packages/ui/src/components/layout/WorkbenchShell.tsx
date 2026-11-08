import React, { useEffect, useState } from 'react';
import { Allotment } from 'allotment';
import 'allotment/dist/style.css';
import { useAtom, useAtomValue } from 'jotai';
import { agentPanelExpandedAtom, agentPanelVisibleAtom, agentSessionsDrawerAtom } from '../../atoms';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AssistantSessionRail } from './AssistantSessionRail';
import { readPersisted, writePersisted } from '../../lib/persistedPrefs';
import { ErrorBoundary } from '../primitives/ErrorBoundary';
import { Sidebar } from './Sidebar';
import { FinanceWorkspace } from '../workspace/FinanceWorkspace';
import { AgentPanel } from '../agent/AgentPanel';
import { WorkspaceTopbar } from './WorkspaceTopbar';

const SIZES_KEY = 'allotmentSizes';
const DEFAULT_SIZES = [240, 810, 390];

export const WorkbenchShell: React.FC = () => {
  const agentPanelVisible = useAtomValue(agentPanelVisibleAtom);
  const [expanded, setExpanded] = useAtom(agentPanelExpandedAtom);
  const [drawer, setDrawer] = useAtom(agentSessionsDrawerAtom);
  const { t } = useTranslation();
  const [sizes, setSizes] = useState<number[]>(() => readPersisted<number[]>(SIZES_KEY, DEFAULT_SIZES));
  const [windowWidth, setWindowWidth] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 1440);
  const isNarrow = windowWidth < 900;
  useEffect(() => { if (!isNarrow) setDrawer(false); }, [isNarrow, setDrawer]);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !expanded || drawer) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], .trail-session-editor')) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.matches('input, textarea, [contenteditable="true"]')) return;
      setExpanded(false);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [expanded, drawer, setExpanded]);

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Keep persisted sizes sane: always three panes, positive values.
  const normalized = sizes.length === 3 && sizes.every((s) => Number.isFinite(s) && s > 0)
    ? sizes
    : DEFAULT_SIZES;

  const handleDragEnd = (next: number[]): void => {
    // Allotment redistributes the hidden pane's width when Copilot is closed.
    // Keep the user's sidebar preference while preserving the last Copilot
    // width for the next time the third pane is restored.
    if (next.length === 2) {
      setSizes((current) => [next[0] ?? current[0], current[1], current[2]]);
      return;
    }
    setSizes(next);
    writePersisted(SIZES_KEY, next);
  };

  // When the agent panel toggles off and back on, Allotment restores its
  // remembered width automatically; no extra state required.
  const showAgent = agentPanelVisible && !isNarrow;

  if (expanded && agentPanelVisible) return <div className="trail-assistant-focus" data-testid="assistant-focus">
    {!isNarrow && <aside className="trail-assistant-session-rail"><AssistantSessionRail /></aside>}
    {isNarrow && <Dialog.Root open={drawer} onOpenChange={setDrawer}>
      <Dialog.Portal>
        <Dialog.Overlay className="trail-assistant-drawer-overlay" />
        <Dialog.Content className="trail-assistant-drawer">
          <Dialog.Title className="sr-only">{t('navigation.showSessions')}</Dialog.Title>
          <Dialog.Description className="sr-only">{t('navigation.sessions')}</Dialog.Description>
          <Dialog.Close className="trail-assistant-drawer-close" aria-label={t('navigation.closeSessions')}><X size={18} /></Dialog.Close>
          <AssistantSessionRail />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>}
    <div className="trail-assistant-focus-main"><ErrorBoundary><AgentPanel /></ErrorBoundary></div>
  </div>;

  return (
    <div className="relative h-full flex-1 overflow-hidden">
      <Allotment
        key={showAgent ? 'workbench-with-agent' : isNarrow ? 'workbench-narrow' : 'workbench-without-agent'}
        className="h-full"
        defaultSizes={showAgent ? normalized : isNarrow ? [56, Math.max(320, normalized[1])] : [360, Math.max(720, normalized[1] + normalized[2])]}
        onDragEnd={handleDragEnd}
      >
        <Allotment.Pane minSize={isNarrow ? 56 : 200} preferredSize={isNarrow ? 56 : showAgent ? normalized[0] : 360}>
          <Sidebar />
        </Allotment.Pane>
        <Allotment.Pane minSize={isNarrow ? 320 : showAgent ? Math.min(500, windowWidth - 520) : 500}>
          <ErrorBoundary>
            <div className="trail-workspace-center flex h-full min-h-0 flex-col">
              <WorkspaceTopbar />
              <div className="min-h-0 flex-1">
                <FinanceWorkspace />
              </div>
            </div>
          </ErrorBoundary>
        </Allotment.Pane>
        {showAgent && (
          <Allotment.Pane minSize={320} preferredSize={normalized[2]} snap>
            <ErrorBoundary>
              <AgentPanel />
            </ErrorBoundary>
          </Allotment.Pane>
        )}
      </Allotment>
    </div>
  );
};
