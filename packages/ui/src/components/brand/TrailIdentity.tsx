import React from 'react';
import { useTranslation } from 'react-i18next';

const trailLogoUrl = new URL('../../assets/trail-logo.png', import.meta.url).href;

export const TrailLogo: React.FC<{ className?: string }> = ({ className = '' }) => (
  <img src={trailLogoUrl} alt="" draggable={false} className={`trail-logo ${className}`} />
);

/** Shared by live and persisted answers: one identity per assistant turn. */
export const AssistantIdentity: React.FC<{ timestamp?: number; streaming?: boolean; action?: React.ReactNode }> = ({ timestamp, streaming, action }) => {
  const { t } = useTranslation();
  return (
    <div className="trail-answer-identity" data-testid="assistant-identity">
      <TrailLogo />
      <span className="trail-answer-name">{t('agent.panel.assistantName')}</span>
      {timestamp != null && <time dateTime={new Date(timestamp).toISOString()}>{new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>}
      {streaming && <span className="trail-answer-live">{t('agent.panel.thinking')}</span>}
      {action}
    </div>
  );
};
