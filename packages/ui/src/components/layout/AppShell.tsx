import React, { useEffect, useState } from 'react';
import { TitleBar } from './TitleBar';
import { KernelBridge } from '../kernel/KernelBridge';
import { WorkbenchShell } from './WorkbenchShell';
import { OnboardingOverlay } from '../onboarding/OnboardingOverlay';
import { CommandPalette } from '../command/CommandPalette';
import { ThemeProvider } from './ThemeProvider';
import { TooltipProvider } from '../ui/tooltip';
import { Toaster } from 'sonner';
import {
  FinagentClientProvider,
  fallbackClient,
  useFinagentClient,
  type FinagentClient,
} from '../../client';
import { I18nProvider } from '../../i18n/I18nProvider';
import type { LongBridgeStatus } from '@finagent/core';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import { useAtomValue } from 'jotai';
import { workspaceRefreshAtom } from '../../atoms';

interface AppShellProps {
  client?: FinagentClient;
}

export const AppShell: React.FC<AppShellProps> = ({ client = fallbackClient }) => {
  return (
    <FinagentClientProvider client={client}>
      <I18nProvider>
        <ThemeProvider>
          <TooltipProvider delayDuration={450} skipDelayDuration={100}>
            <KernelBridge client={client} />
            <div className="mac-app-window flex h-screen flex-col overflow-hidden bg-background text-foreground">
              <TitleBar />
              <LongBridgeBanner />
              <WorkbenchShell />
            </div>
            <OnboardingOverlay />
            <CommandPalette />
            <Toaster closeButton richColors={false} />
          </TooltipProvider>
        </ThemeProvider>
      </I18nProvider>
    </FinagentClientProvider>
  );
};

const LongBridgeBanner: React.FC = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<LongBridgeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const client = useFinagentClient();
  const refreshRevision = useAtomValue(workspaceRefreshAtom);

  useEffect(() => {
    let mounted = true;
    const refresh = () => client.longbridge.getStatus().then((result) => {
      if (!mounted) return;
      if (result.ok) {
        setStatus(result.data);
        setError(null);
      } else {
        setStatus(null);
        setError(result.error.message);
      }
    });
    void refresh();
    const unsubscribe = client.connections?.onChanged(() => { void refresh(); });
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => {
      mounted = false;
      unsubscribe?.();
      window.removeEventListener('focus', onFocus);
    };
  }, [client, refreshRevision]);

  if (!error && (!status || status.available)) {
    return null;
  }

  const message = error ?? status?.message ?? 'LongBridge CLI status is unavailable.';
  const action = status?.action ?? 'Install LongBridge CLI and run longbridge auth login.';
  const title = t(status?.status === 'rate_limited' ? 'navigation.marketPaused' : 'navigation.marketSetupNeeded');

  return (
    <div className="trail-banner flex items-center gap-2 border-b px-4 py-2" title={`${message}\n${action}`}>
      <Info className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
      <span className="shrink-0 font-medium text-foreground">{title}</span>
      <span className="min-w-0 truncate text-foreground/54">{action}</span>
    </div>
  );
};
