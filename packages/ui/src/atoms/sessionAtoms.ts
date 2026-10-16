import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import type { Message, SessionMeta } from '@finagent/core';
import type { FinagentClient } from '../client';

// The kernel (main process) is the source of truth for sessions and messages;
// these atoms are the renderer's view cache, hydrated from and updated by it.

export const sessionsAtom = atom<SessionMeta[]>([]);

export const activeSessionIdAtom = atom<string | null>(null);

export const activeSessionAtom = atom((get) => {
  const activeId = get(activeSessionIdAtom);
  if (!activeId) return null;
  return get(sessionsAtom).find((session) => session.id === activeId) ?? null;
});

// Per-session message cache, loaded lazily from the kernel.
export const messagesAtomFamily = atomFamily((_sessionId: string) => atom<Message[]>([]));

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
    for (let attempt = 0; attempt < (minimumCount > 0 ? 8 : 1); attempt += 1) {
      const result = await client.kernel.getMessages(sessionId);
      if (!result.ok) return;
      const requiredCount = minimumCount > 0
        ? Math.max(minimumCount, get(messagesAtomFamily(sessionId)).length)
        : 0;
      if (result.data.length >= requiredCount) {
        set(messagesAtomFamily(sessionId), result.data);
        set(loadedSessionIdsAtom, (loaded) => new Set([...loaded, sessionId]));
        return;
      }
      if (attempt < 7) await new Promise((resolve) => setTimeout(resolve, 75));
    }
  }
);

export const createSessionAtom = atom(
  null,
  async (_get, set, client: FinagentClient, title?: string) => {
    const result = await client.kernel.createSession(title);
    if (!result.ok) return null;
    set(sessionsAtom, (sessions) => [...sessions, result.data]);
    set(activeSessionIdAtom, result.data.id);
    set(messagesAtomFamily(result.data.id), []);
    return result.data;
  }
);

export const deleteSessionAtom = atom(
  null,
  async (_get, set, client: FinagentClient, sessionId: string) => {
    const result = await client.kernel.deleteSession(sessionId);
    if (!result.ok) return;
    set(sessionsAtom, (sessions) => sessions.filter((session) => session.id !== sessionId));
    messagesAtomFamily.remove(sessionId);
    if (_get(activeSessionIdAtom) === sessionId) {
      const remaining = _get(sessionsAtom);
      set(activeSessionIdAtom, remaining.length > 0 ? remaining[0].id : null);
    }
  }
);
