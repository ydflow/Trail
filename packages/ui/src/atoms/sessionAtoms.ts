import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import type { Message, SessionMeta } from '@finagent/core';
import type { FinagentClient } from '../client';

// The kernel (main process) is the source of truth for sessions and messages;
// these atoms are the renderer's view cache, hydrated from and updated by it.

export const sessionsAtom = atom<SessionMeta[]>([]);

export const sessionInteractionLockedAtom = atom(false);
const selectedSessionIdAtom = atom<string | null>(null);
export const activeSessionIdAtom = atom(
  (get) => get(selectedSessionIdAtom),
  (get, set, id: string | null) => {
    if (!get(sessionInteractionLockedAtom) || id === get(selectedSessionIdAtom)) set(selectedSessionIdAtom, id);
  }
);
export const sessionDraftAtomFamily = atomFamily((_id: string) => atom(''));
export const sessionScrollAtomFamily = atomFamily((_id: string) => atom<{ top: number; follow: boolean }>({ top: 0, follow: true }));

export const activeSessionAtom = atom((get) => {
  const activeId = get(activeSessionIdAtom);
  if (!activeId) return null;
  return get(sessionsAtom).find((session) => session.id === activeId) ?? null;
});

// Per-session message cache, loaded lazily from the kernel.
export const messagesAtomFamily = atomFamily((_sessionId: string) => atom<Message[]>([]));

/** Presentation only; retained across panel/session switches, never saved in messages. */
export const answerExpansionAtomFamily = atomFamily((_sessionId: string) => atom<Record<string, boolean>>({}));

export const activeMessagesAtom = atom((get) => {
  const activeId = get(activeSessionIdAtom);
  if (!activeId) return [];
  return get(messagesAtomFamily(activeId));
});

export const loadedSessionIdsAtom = atom<Set<string>>(new Set<string>());

/** Internal synthesis sessions are implementation details, not user chats. */
function isInternalSession(title: string): boolean {
  return title === 'Research' || title.startsWith('__trail_internal_');
}

export const hydrateSessionsAtom = atom(
  null,
  async (_get, set, client: FinagentClient) => {
    const result = await client.kernel.hydrate();
    if (!result.ok) return;
    const visibleSessions = result.data.sessions.filter((session) => !isInternalSession(session.title));
    set(sessionsAtom, visibleSessions);
    if (!_get(activeSessionIdAtom) && visibleSessions.length > 0) {
      set(activeSessionIdAtom, visibleSessions[0].id);
    }
  }
);

export const loadMessagesAtom = atom(
  null,
  async (get, set, client: FinagentClient, sessionId: string, minimumCount: number = 0) => {
    // The terminal event can precede transcript persistence. Keep the complete
    // live turn until the saved answer (including its evidence) is available.
    // Ordinary hydration remains a single read; only completion refreshes poll.
    const attempts = minimumCount > 0 ? 8 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const result = await client.kernel.getMessages(sessionId);
      if (!result.ok) return;
      const previous = get(messagesAtomFamily(sessionId));
      const persisted = result.data;
      const persistedIds = new Set(persisted.map(({ id }) => id));
      const savedAnswers = new Map<string, Message>();
      let savedQuestionId: string | undefined;
      let firstSavedQuestion = persisted.length;
      persisted.forEach((message, index) => {
        if (message.role === 'user') {
          savedQuestionId = message.id;
          firstSavedQuestion = Math.min(firstSavedQuestion, index);
        } else if (message.role === 'assistant' && savedQuestionId) {
          savedAnswers.set(savedQuestionId, message);
        }
      });

      // A long first read can still be missing the entire live turn. Match
      // temporary replies within their own turn, where even repeated answers
      // have a unique persisted question ID.
      const expansion = get(answerExpansionAtomFamily(sessionId));
      const nextExpansion = { ...expansion };
      let expansionChanged = false;
      let questionId: string | undefined;
      const pending = previous.filter((message, index) => {
        if (message.role === 'user') questionId = message.id;
        if (persistedIds.has(message.id)) return false;
        if (message.role !== 'assistant') return true;
        const saved = questionId
          ? savedAnswers.get(questionId)
          : index < firstSavedQuestion ? persisted[index] : undefined;
        if (saved?.role !== 'assistant' || saved.content !== message.content) return true;
        if (Object.hasOwn(expansion, message.id)) {
          nextExpansion[saved.id] = expansion[message.id];
          delete nextExpansion[message.id];
          expansionChanged = true;
        }
        return false;
      });
      if (expansionChanged) set(answerExpansionAtomFamily(sessionId), nextExpansion);
      set(messagesAtomFamily(sessionId), [...persisted, ...pending]);
      set(loadedSessionIdsAtom, (loaded) => loaded.has(sessionId) ? loaded : new Set([...loaded, sessionId]));
      if (pending.length === 0 && persisted.length >= minimumCount) return;
      if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 75));
    }
  }
);

export const createSessionAtom = atom(
  null,
  async (_get, set, client: FinagentClient, title?: string) => {
    if (_get(sessionInteractionLockedAtom)) return null;
    const result = await client.kernel.createSession(title);
    if (!result.ok) return null;
    set(sessionsAtom, (sessions) => [...sessions, result.data]);
    set(activeSessionIdAtom, result.data.id);
    set(messagesAtomFamily(result.data.id), []);
    return result.data;
  }
);

export const renameSessionAtom = atom(
  null,
  async (_get, set, client: FinagentClient, sessionId: string, title: string) => {
    const result = await client.kernel.renameSession(sessionId, title.trim());
    if (!result.ok) return false;
    // Keep live run/message metadata that may have arrived while the request was in flight.
    set(sessionsAtom, (sessions) => sessions.map((session) => session.id === sessionId
      ? { ...session, title: result.data.title, updatedAt: result.data.updatedAt }
      : session));
    return true;
  }
);

export const deleteSessionAtom = atom(
  null,
  async (_get, set, client: FinagentClient, sessionId: string) => {
    const result = await client.kernel.deleteSession(sessionId);
    if (!result.ok) return false;
    set(sessionsAtom, (sessions) => sessions.filter((session) => session.id !== sessionId));
    sessionDraftAtomFamily.remove(sessionId);
    sessionScrollAtomFamily.remove(sessionId);
    messagesAtomFamily.remove(sessionId);
    answerExpansionAtomFamily.remove(sessionId);
    if (_get(activeSessionIdAtom) === sessionId) {
      const remaining = _get(sessionsAtom);
      set(activeSessionIdAtom, remaining.length > 0 ? remaining[0].id : null);
    }
    return true;
  }
);
