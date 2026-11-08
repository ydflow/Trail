import React, { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { MessageSquare, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import type { SessionMeta } from '@finagent/core';
import { sessionInteractionLockedAtom, activeSessionIdAtom, createSessionAtom, deleteSessionAtom, renameSessionAtom, sessionsAtom } from '../../atoms/sessionAtoms';
import { useFinagentClient } from '../../client';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';

function SessionRow({ session, active, onSelect, locked, editing, onEdit, onFinish }: {
  session: SessionMeta; active: boolean; onSelect: () => void;
  locked: boolean; editing: boolean; onEdit: () => void; onFinish: () => void;
}) {
  const { t, i18n } = useTranslation();
  const client = useFinagentClient();
  const rename = useSetAtom(renameSessionAtom);
  const remove = useSetAtom(deleteSessionAtom);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLButtonElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const movingFocus = useRef(false);
  const restoreFocus = useRef(false);
  const errorId = useId();
  const title = session.title === 'New Session' ? t('navigation.untitledSession') : session.title;
  const invalidName = !draft.trim() || draft.trim().length > 100
    || draft.trim() === 'Research' || draft.trim().startsWith('__trail_internal_');

  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
      input.current?.scrollIntoView({ block: 'nearest' });
    } else if (restoreFocus.current) { menu.current?.focus(); restoreFocus.current = false; }
  }, [editing]);

  useEffect(() => { if (active) row.current?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const finish = () => { restoreFocus.current = true; setError(''); onFinish(); };
  const save = async () => {
    if (busy.current || invalidName) return;
    busy.current = true;
    setPending(true);
    setError('');
    try {
      if (await rename(client, session.id, draft)) finish();
      else setError(t('navigation.renameSessionFailed'));
    } catch { setError(t('navigation.renameSessionFailed')); }
    finally { busy.current = false; setPending(false); }
  };
  const confirmDelete = async () => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    try {
      if (await remove(client, session.id)) setDeleting(false);
      else setError(t('navigation.deleteSessionFailed'));
    } catch { setError(t('navigation.deleteSessionFailed')); }
    finally { busy.current = false; setPending(false); }
  };

  const lastMessage = session.lastMessageAt;
  let metadata = t('navigation.sessionNotStarted');
  if (session.messageCount > 0) {
    const count = t('navigation.messagesCount', { count: session.messageCount });
    if (lastMessage && Number.isFinite(lastMessage)) {
      const date = new Date(lastMessage);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const day = date.toDateString() === today.toDateString() ? t('navigation.sessionToday')
        : date.toDateString() === yesterday.toDateString() ? t('navigation.sessionYesterday')
        : date.toLocaleDateString(i18n.language, { month: 'numeric', day: 'numeric', ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' as const } : {}) });
      metadata = `${day} ${date.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit', hour12: false })} · ${count}`;
    } else metadata = count;
  }

  return <div ref={row} className={`trail-session-row${active ? ' trail-session-row--active' : ''}${editing ? ' trail-session-row--editing' : ''}`} data-session-id={session.id}>
    {editing ? <form className="trail-session-editor" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <input ref={input} value={draft} maxLength={100} disabled={pending}
        aria-label={t('navigation.sessionName')} aria-invalid={invalidName || !!error}
        aria-describedby={invalidName || error ? errorId : undefined}
        onChange={(event) => { setDraft(event.target.value); setError(''); }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) {
            if (event.key === 'Enter') event.preventDefault();
            return;
          }
          if (event.key === 'Escape' && !pending) { event.preventDefault(); finish(); }
        }} />
      <div className="trail-session-editor-actions">
        <button type="submit" className="trail-session-primary" disabled={pending || invalidName}>{t(pending ? 'common.loading' : 'common.save')}</button>
        <button type="button" className="trail-session-secondary" disabled={pending} onClick={finish}>{t('common.cancel')}</button>
      </div>
      <p className="trail-session-hint">{t('navigation.renameSessionHint')}</p>
      {(invalidName || error) && <p id={errorId} className="trail-session-error" role="alert">{invalidName ? t('navigation.sessionNameInvalid') : error}</p>}
    </form> : <>
      <button type="button" className="trail-session-select" aria-pressed={active} disabled={locked && !active} onClick={onSelect} title={title}>
        <span className="trail-session-title">{title}</span>
        <span className="trail-session-meta" title={metadata}>{metadata}</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button ref={menu} type="button" className="trail-session-menu" aria-label={t('navigation.sessionActions', { title })} title={t('navigation.sessionActions', { title })}>
            <MoreHorizontal size={18} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="trail-session-dropdown" onCloseAutoFocus={(event) => {
          if (movingFocus.current) { event.preventDefault(); movingFocus.current = false; }
        }}>
          <DropdownMenuItem onSelect={() => { movingFocus.current = true; setDraft(title); setError(''); onEdit(); }}>
            <Pencil size={16} />{t('navigation.renameSession')}
          </DropdownMenuItem>
          <div role="separator" className="trail-session-menu-divider" />
          <DropdownMenuItem className="trail-session-danger" onSelect={() => { movingFocus.current = true; setError(''); setDeleting(true); }}>
            <Trash2 size={16} />{t('navigation.deleteSessionAction')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>}
    <AlertDialog.Root open={deleting} onOpenChange={(open) => { if (!busy.current) { setDeleting(open); setError(''); } }}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="trail-session-dialog-overlay" />
        <AlertDialog.Content className="trail-session-dialog" onCloseAutoFocus={(event) => { event.preventDefault(); menu.current?.focus(); }}>
          <AlertDialog.Title>{t('navigation.deleteSessionConfirmTitle')}</AlertDialog.Title>
          <AlertDialog.Description>{t('navigation.deleteSessionConfirm', { title })}</AlertDialog.Description>
          {error && <p className="trail-session-error" role="alert">{error}</p>}
          <div className="trail-session-dialog-actions">
            <AlertDialog.Cancel asChild><button type="button" className="trail-session-secondary" disabled={pending}>{t('common.cancel')}</button></AlertDialog.Cancel>
            <button type="button" className="trail-session-delete" disabled={pending} onClick={() => void confirmDelete()}>{t(pending ? 'common.loading' : 'navigation.deleteSessionAction')}</button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  </div>;
}

export function SidebarSessions({ onSelected, focused = false }: { onSelected?: () => void; focused?: boolean } = {}) {
  const { t } = useTranslation();
  const sessions = useAtomValue(sessionsAtom);
  const locked = useAtomValue(sessionInteractionLockedAtom);
  const [activeId, setActiveId] = useAtom(activeSessionIdAtom);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(false);
  const create = useSetAtom(createSessionAtom);
  const client = useFinagentClient();
  const headingId = useId();
  return <section className={`trail-sidebar-context${focused ? ' trail-session-history' : ''}`} aria-labelledby={headingId}>
    <div className="trail-session-heading">
      <h2 id={headingId}>{!focused && <MessageSquare size={18} />}{t(focused ? 'navigation.recentSessions' : 'navigation.sessions')}<span className="trail-session-count">{sessions.length}</span></h2>
      <button type="button" className="trail-session-new" disabled={creating || locked} aria-label={t('navigation.newSession')} onClick={async () => {
        setCreating(true); setCreateError(false);
        try { if (!await create(client)) setCreateError(true); }
        catch { setCreateError(true); }
        finally { setCreating(false); }
      }}><Plus size={14} />{t(focused ? 'navigation.newSession' : 'navigation.newSessionShort')}</button>
    </div>
    {locked && <p className="trail-session-lock-hint" role="status">{t('navigation.sessionSwitchLocked')}</p>}
    {createError && <p className="trail-session-error" role="alert">{t('navigation.createSessionFailed')}</p>}
    <div className="trail-sidebar-sessions">
      {sessions.map((session) => <SessionRow key={session.id} locked={locked} session={session} active={session.id === activeId}
        onSelect={() => { setActiveId(session.id); setEditingId(null); onSelected?.(); }} editing={editingId === session.id}
        onEdit={() => setEditingId(session.id)} onFinish={() => setEditingId((current) => current === session.id ? null : current)} />)}
      {!sessions.length && <p className="trail-session-empty">{t('navigation.noSessions')}</p>}
    </div>
  </section>;
}
