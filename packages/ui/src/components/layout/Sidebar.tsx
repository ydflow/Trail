import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAtom, useSetAtom } from 'jotai';
import {
  Activity,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  ChartNoAxesCombined,
  CircleHelp,
  CirclePlus,
  Compass,
  FileText,
  FlaskConical,
  GitCompareArrows,
  House,
  MessageSquare,
  Settings,
  UserRound,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  createSessionAtom,
  openAssistantAtom,
  sessionInteractionLockedAtom,
  navSectionAtom,
  watchlistAtom,
  type NavSection,
} from '../../atoms';
import { useFinagentClient } from '../../client';
import { Watchlist } from '../stock/Watchlist';
import { TrailLogo } from '../brand/TrailIdentity';
import { SidebarWorkspaceSplit } from './SidebarWorkspaceSplit';
import { SidebarSessions } from './SidebarSessions';

type SidebarItem = { key: NavSection | 'assistant'; labelKey: string; icon: LucideIcon };

const SIDEBAR_ITEMS: SidebarItem[] = [
  { key: 'today', labelKey: 'today', icon: House },
  { key: 'discover', labelKey: 'discover', icon: Compass },
  { key: 'watchlist', labelKey: 'workspace', icon: ChartNoAxesCombined },
  { key: 'portfolio', labelKey: 'portfolio', icon: BriefcaseBusiness },
  { key: 'compare', labelKey: 'compare', icon: GitCompareArrows },
  { key: 'alerts', labelKey: 'alerts', icon: Bell },
  { key: 'assistant', labelKey: 'agentPanel', icon: MessageSquare },
  { key: 'research', labelKey: 'research', icon: BookOpen },
  { key: 'thesis', labelKey: 'thesis', icon: FileText },
  { key: 'skills', labelKey: 'skills', icon: Zap },
  { key: 'evaluation', labelKey: 'evaluation', icon: FlaskConical },
  { key: 'events', labelKey: 'events', icon: CalendarDays },
];

const SidebarNavButton: React.FC<{
  item: SidebarItem;
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ item, label, active, onClick }) => {
  const Icon = item.icon;
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`trail-sidebar-nav-item ${active ? 'trail-sidebar-nav-item--active' : ''}`}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2 : 1.7} />
      <span className="trail-sidebar-nav-label">{label}</span>
      {item.key === 'alerts' && <span className="trail-sidebar-alert-dot" aria-hidden="true" />}
    </button>
  );
};

export const Sidebar: React.FC = () => {
  const { t } = useTranslation();
  const client = useFinagentClient();
  const createSession = useSetAtom(createSessionAtom);
  const openAssistant = useSetAtom(openAssistantAtom);
  const [sessionLocked] = useAtom(sessionInteractionLockedAtom);
  const [navSection, setNavSection] = useAtom(navSectionAtom);
  const [watchlist] = useAtom(watchlistAtom);
  const showWorkspaceContext = navSection === 'sessions' || navSection === 'watchlist';

  return (
    <aside className="trail-sidebar h-full w-full overflow-hidden bg-surface" data-testid="sidebar">
      <div className="trail-sidebar-content flex h-full min-w-0 flex-col px-3 py-5">
        <div className="trail-sidebar-brand mb-6 px-2">
          <TrailLogo />
          <div>
            <div className="trail-sidebar-brand-name">Trail</div>
            <div className="trail-sidebar-brand-chinese">研迹</div>
            <div className="trail-sidebar-brand-kicker">{t('navigation.brandTagline')}</div>
          </div>
        </div>

        <button
          type="button"
          aria-label={t('navigation.newSession')}
          disabled={sessionLocked}
          title={sessionLocked ? t('navigation.sessionSwitchLocked') : t('navigation.newSession')}
          onClick={() => void createSession(client)}
          className="trail-sidebar-new-analysis mb-6 flex h-9 w-full items-center justify-center gap-2 rounded-[4px] px-3 text-[12px] font-semibold"
        >
          <CirclePlus className="h-4 w-4" />
          <span>{t('navigation.newSession')}</span>
        </button>

        <SidebarWorkspaceSplit
          enabled={showWorkspaceContext}
          upper={
            <>
              <nav aria-label={t('navigation.globalNavAria')} className="trail-sidebar-nav flex min-h-0 flex-1 flex-col gap-1">
                {SIDEBAR_ITEMS.map((item) => (
                  <SidebarNavButton
                    key={item.key}
                    item={item}
                    label={t(`navigation.${item.labelKey}`)}
                    active={navSection === item.key}
                    onClick={() => { if (item.key === 'assistant') void openAssistant(client); else setNavSection(item.key); }}
                  />
                ))}
                <SidebarNavButton
                  item={{ key: 'profile', labelKey: 'profile', icon: UserRound }}
                  label={t('navigation.profile')}
                  active={navSection === 'profile'}
                  onClick={() => setNavSection('profile')}
                />
              </nav>

              {showWorkspaceContext && <SidebarSessions />}
            </>
          }
        >
          <button type="button" onClick={() => setNavSection('watchlist')} className="trail-sidebar-context-heading flex w-full items-center gap-2 px-2 text-left">
            <Activity className="h-3.5 w-3.5" />
            <span>{t('navigation.watchlist')}</span>
            <span className="trail-sidebar-watchlist-count tnum">{watchlist.length}</span>
          </button>
          <div className="trail-sidebar-watchlist mt-1 min-h-0 flex-1">
            <Watchlist showHeader={false} />
          </div>
        </SidebarWorkspaceSplit>

        <div className="trail-sidebar-footer mt-auto border-t border-border pt-3">
          <SidebarNavButton
            item={{ key: 'settings', labelKey: 'settings', icon: Settings }}
            label={t('navigation.settings')}
            active={navSection === 'settings'}
            onClick={() => setNavSection('settings')}
          />
          <div className="trail-sidebar-support flex items-center gap-2 px-3 py-2 text-[11px] text-foreground/45">
            <CircleHelp className="h-4 w-4" />
            <span>{t('navigation.support')}</span>
          </div>
        </div>
      </div>

    </aside>
  );
};
