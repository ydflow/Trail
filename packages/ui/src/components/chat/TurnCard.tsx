import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import { useAtomValue, useSetAtom } from 'jotai';
import { selectAtom } from 'jotai/utils';
import type { Message } from '@finagent/core';
import { AnswerContent } from './AnswerContent';
import { SourceInspector } from './SourceInspector';
import { ToolActivity } from '../agent/ToolActivity';
import { collectCitationSources } from '../../lib/citations';
import { AssistantIdentity } from '../brand/TrailIdentity';
import { answerExpansionAtomFamily } from '../../atoms/sessionAtoms';
import { useAnswerCollapse } from './useAnswerCollapse';

interface TurnCardProps {
  message: Message;
  sessionId?: string;
}

export const TurnCard: React.FC<TurnCardProps> = ({ message, sessionId = '' }) => {
  const { t } = useTranslation();
  const isUser = message.role === 'user';
  const isTool = message.role === 'tool';
  const toolCalls = message.toolCalls ?? [];
  const isAssistant = !isUser && !isTool;
  const expansionAtom = answerExpansionAtomFamily(sessionId);
  const selectedExpansionAtom = useMemo(
    () => selectAtom(expansionAtom, (choices) => choices[message.id] ?? false),
    [expansionAtom, message.id]
  );
  const expanded = useAtomValue(selectedExpansionAtom);
  const setExpansion = useSetAtom(expansionAtom);
  const collapse = useAnswerCollapse({
    message,
    enabled: isAssistant,
    expanded,
    onExpandedChange: (value) => setExpansion((choices) => ({ ...choices, [message.id]: value })),
  });

  // provenance surface for this assistant turn.
  const citationIndex = useMemo(
    () => (isAssistant ? collectCitationSources(message) : { sources: [], byId: new Map() }),
    [message, isAssistant]
  );
  const [inspectorFocus, setInspectorFocus] = useState<string | undefined>(undefined);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const openInspector = (sourceId?: string) => {
    setInspectorFocus(sourceId);
    setInspectorOpen(true);
  };

  return (
    <div
      ref={collapse.turnRef}
      data-message-id={message.id}
      className={`trail-chat-turn flex ${isUser ? 'trail-chat-turn--user justify-end' : 'justify-start'}`}
    >
      <div
        className={`min-w-0 rounded-[10px] ${isUser ? 'max-w-[88%] px-3.5 py-3' : 'w-full'} ${
          isUser
            ? 'mac-message-user rounded-br-[4px]'
            : isTool
            ? 'mac-message-assistant rounded-bl-[6px] text-foreground'
            : 'mac-message-assistant rounded-bl-[4px] text-foreground'
        }`}
      >
        {isAssistant && <AssistantIdentity timestamp={message.timestamp} action={collapse.collapsible && expanded ? (
          <button type="button" className="trail-answer-collapse-top" data-answer-toggle="true"
            aria-expanded={expanded} aria-controls={collapse.contentId} onClick={collapse.toggle}>
            <ChevronUp aria-hidden="true" />{t('agent.chat.collapse')}
          </button>
        ) : undefined} />}
        <div className={isAssistant ? 'trail-answer-body' : undefined}>
          {isTool && message.toolName && (
            <div className="mb-1.5 text-[12px] font-semibold text-accent">
              {t('agent.tool.label', { name: message.toolName })}
            </div>
          )}
          {isUser ? (
            <div className="max-w-none whitespace-pre-wrap text-[14px] leading-relaxed">{message.content}</div>
          ) : (
            <div className="trail-answer-preview" data-collapsed={collapse.collapsed || undefined}
              style={collapse.collapsed ? { maxHeight: collapse.height ?? undefined } : undefined}
              id={collapse.contentId}>
              <div ref={collapse.contentRef} className="trail-answer-content">
                <AnswerContent
                  content={message.content}
                  message={isAssistant ? message : undefined}
                  onOpenSource={isAssistant ? (sourceId) => openInspector(sourceId) : undefined}
                />
              </div>
            </div>
          )}
          {collapse.collapsed && collapse.height === 0 && <p className="trail-answer-preview-hint">{t('agent.chat.longAnswer')}</p>}
          {!isUser && toolCalls.length > 0 && (
            <div className="mt-3 border-t mac-section-divider pt-3">
              <ToolActivity toolCalls={toolCalls} />
            </div>
          )}
          {isAssistant && (
            <div className="trail-answer-sources mt-2 flex items-center gap-3">
              {collapse.collapsible && (
                <div className="trail-answer-toggle-row">
                  <button type="button" data-testid="answer-toggle" data-answer-toggle="true"
                    aria-expanded={expanded} aria-controls={collapse.contentId} onClick={collapse.toggle}>
                    {t(expanded ? 'agent.chat.collapseFull' : 'agent.chat.expandFull')}
                    {expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
                  </button>
                </div>
              )}
              {citationIndex.sources.length > 0 && (
                <button
                  type="button"
                  data-testid="open-source-inspector"
                  onClick={() => openInspector()}
                  className="flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-[11px] text-foreground/48 transition-smooth hover:bg-foreground/6 hover:text-foreground"
                >
                  <BookOpen className="h-3 w-3" />
                  {t('agent.sources.count', { count: citationIndex.sources.length })}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {isAssistant && inspectorOpen && (
        <SourceInspector
          message={message}
          focusSourceId={inspectorFocus}
          onClose={() => setInspectorOpen(false)}
        />
      )}
    </div>
  );
};
