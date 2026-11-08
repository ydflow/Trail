import React from 'react';
import { ArrowLeft, MessageSquare, Settings } from 'lucide-react';
import { useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { agentPanelExpandedAtom, agentSessionsDrawerAtom, navSectionAtom } from '../../atoms';
import { SidebarSessions } from './SidebarSessions';

export function AssistantSessionRail() {
  const { t } = useTranslation();
  const setExpanded = useSetAtom(agentPanelExpandedAtom);
  const setDrawer = useSetAtom(agentSessionsDrawerAtom);
  const setNav = useSetAtom(navSectionAtom);
  const back = () => { setDrawer(false); setExpanded(false); };
  return <div className="trail-assistant-rail-content">
    <button type="button" className="trail-assistant-back" onClick={back}><ArrowLeft size={17} />{t('navigation.backToWorkspace')}</button>
    <div className="trail-assistant-rail-brand"><MessageSquare size={23} /><span>{t('navigation.agentPanel')}</span></div>
    <SidebarSessions focused onSelected={() => setDrawer(false)} />
    <button type="button" className="trail-assistant-rail-settings" onClick={() => { setNav('settings'); back(); }}><Settings size={17} />{t('navigation.settings')}</button>
  </div>;
}
