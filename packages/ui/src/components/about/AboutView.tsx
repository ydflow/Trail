import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFinagentClient, type AboutInfo } from '../../client';

/**
 * Load state for the `app:about` request. Version, channel and build come only
 * from `client.about.get()` (main process reads `app.getVersion()` and the
 * baked `trail` metadata); no hard-coded release number is ever shown, so a
 * pending or failed request cannot masquerade as the installed version.
 */
type AboutState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; info: AboutInfo };

/** About/version panel: version, channel, and build (git SHA) for this install. */
export const AboutView: React.FC = () => {
  const { t } = useTranslation();
  const client = useFinagentClient();
  const [state, setState] = useState<AboutState>({ status: 'loading' });

  useEffect(() => {
    let mounted = true;
    const about = client.about;
    if (!about) {
      setState({ status: 'error' });
      return;
    }
    setState({ status: 'loading' });
    about
      .get()
      .then((result) => {
        if (!mounted) return;
        setState(result.ok ? { status: 'ready', info: result.data } : { status: 'error' });
      })
      .catch(() => {
        if (mounted) setState({ status: 'error' });
      });
    return () => {
      mounted = false;
    };
  }, [client]);

  const placeholder =
    state.status === 'loading' ? t('settings.about.loading') : t('settings.about.unavailable');
  const valueOf = (key: keyof AboutInfo): string =>
    state.status === 'ready' ? state.info[key] : placeholder;

  const rows: Array<{ label: string; value: string }> = [
    { label: t('settings.about.version'), value: valueOf('version') },
    { label: t('settings.about.channel'), value: valueOf('channel') },
    { label: t('settings.about.build'), value: valueOf('build') },
  ];

  return (
    <dl
      className="space-y-3"
      data-testid="about-view"
      data-status={state.status}
      aria-busy={state.status === 'loading'}
    >
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4">
          <dt className="text-[13px] text-foreground/54">{row.label}</dt>
          <dd
            className={
              state.status === 'ready'
                ? 'text-right text-[13px] font-medium tabular-nums text-foreground'
                : 'text-right text-[13px] text-foreground/54'
            }
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
};
