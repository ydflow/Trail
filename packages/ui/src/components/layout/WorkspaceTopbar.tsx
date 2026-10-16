import React, { useState } from 'react';
import { Moon, RefreshCw, Sun } from 'lucide-react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { activeSymbolAtom, activeViewAtom, navSectionAtom, agentPanelVisibleAtom, fetchQuoteAtom, fetchPortfolioAtom, loadAlertsAtom, watchlistAtom, workspaceRefreshAtom } from '../../atoms';
import { loadPulseAtom } from '../../atoms/pulseAtoms';
import { loadBriefAtom } from '../../atoms/automationAtoms';
import { useFinagentClient } from '../../client';
import { useTheme } from './ThemeProvider';
import type { WorkspaceView } from '@finagent/core';

const TABS: Array<{ labelKey: string; view: WorkspaceView }> = [
  { labelKey: 'kLines', view: 'chart' },
  { labelKey: 'statements', view: 'financials' },
  { labelKey: 'news', view: 'news' },
  { labelKey: 'reports', view: 'overview' },
];

/** Stitch's persistent center-column header: asset tabs stay available while
 * the existing Trail navigation controls the actual page surface below. */
export const WorkspaceTopbar: React.FC = () => {
  const { t } = useTranslation();
  const activeSymbol = useAtomValue(activeSymbolAtom);
  const navSection = useAtomValue(navSectionAtom);
  const [activeView, setActiveView] = useAtom(activeViewAtom);
  const client = useFinagentClient();
  const { setMode } = useTheme();
  const [panelVisible, setPanelVisible] = useAtom(agentPanelVisibleAtom);
  const watchlist = useAtomValue(watchlistAtom);
  const fetchQuote = useSetAtom(fetchQuoteAtom);
  const fetchPortfolio = useSetAtom(fetchPortfolioAtom);
  const loadAlerts = useSetAtom(loadAlertsAtom);
  const loadPulse = useSetAtom(loadPulseAtom);
  const loadBrief = useSetAtom(loadBriefAtom);
  const refreshSecurity = useSetAtom(workspaceRefreshAtom);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState('');
  const canRefresh = ['today', 'sessions', 'watchlist', 'portfolio', 'alerts'].includes(navSection);
  const showAssetTabs = navSection !== 'today' && navSection !== 'alerts' && navSection !== 'events' && navSection !== 'profile' && navSection !== 'settings';

  const selectTab = (view: WorkspaceView) => {
    setActiveView(view);
  };

  const refresh = async () => {
    if (refreshing || !canRefresh) return;
    setRefreshing(true);
    setRefreshResult('');
    try {
      if (navSection === 'alerts') await loadAlerts(client);
      else if (navSection === 'portfolio') await fetchPortfolio(client);
      else {
        const symbols = navSection === 'today' ? watchlist : activeSymbol ? [activeSymbol] : watchlist;
        await Promise.all(symbols.map((symbol) => fetchQuote({ client, symbol })));
        if (navSection === 'today') {
          await fetchPortfolio(client);
          await Promise.all([loadPulse(client), loadBrief(client)]);
        }
      }
      refreshSecurity((value) => value + 1);
      setRefreshResult(t('navigation.refreshComplete'));
    } catch {
      setRefreshResult(t('navigation.refreshFailed'));
    } finally { setRefreshing(false); }
  };

  return (
    <header className="trail-workspace-topbar flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-6">
      <div className="flex min-w-0 items-center gap-7">
        <div className="trail-workspace-topbar-title shrink-0">{t('navigation.workbenchTitle')}</div>
        {showAssetTabs && (
          <nav aria-label={t('navigation.workspaceTabs')} className="trail-workspace-topbar-tabs flex h-full items-center gap-5">
            {TABS.map((tab) => (
              <button
                key={tab.labelKey}
                type="button"
                aria-pressed={activeSymbol != null && navSection === 'watchlist' && activeView === tab.view}
                onClick={() => selectTab(tab.view)}
                className={`trail-workspace-topbar-tab ${activeSymbol != null && navSection === 'watchlist' && activeView === tab.view ? 'trail-workspace-topbar-tab--active' : ''}`}
              >
                {t(`navigation.${tab.labelKey}`)}
              </button>
            ))}
          </nav>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3 text-foreground/48">
        <button type="button" data-testid="workspace-refresh" disabled={refreshing || !canRefresh} onClick={() => void refresh()} aria-label={t('navigation.refreshData')} title={t(canRefresh ? 'navigation.refreshData' : 'navigation.refreshUnavailable')} className="trail-toolbar-icon">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
        <button type="button" data-testid="workspace-theme-toggle" onClick={() => setMode(document.documentElement.classList.contains('dark') ? 'light' : 'dark')} aria-label={t('navigation.toggleTheme')} title={t('navigation.toggleTheme')} className="trail-toolbar-icon">
          <Moon className="trail-theme-moon h-4 w-4" aria-hidden="true" /><Sun className="trail-theme-sun h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" data-testid="workspace-agent-toggle" onClick={() => setPanelVisible(!panelVisible)} aria-pressed={panelVisible} className="trail-workspace-status trail-toolbar-agent"><span />{t('navigation.agentPanel')}</button>
        <span className="sr-only" role="status">{refreshResult}</span>
      </div>
    </header>
  );
};
