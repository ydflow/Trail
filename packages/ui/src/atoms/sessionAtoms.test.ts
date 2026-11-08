import { beforeEach, describe, expect, it } from 'bun:test';
import { createStore } from 'jotai';
import type { FinagentClient } from '../client';
import type { Run, SessionMeta } from '@finagent/core';
import {
  activeMessagesAtom,
  activeSessionIdAtom,
  answerExpansionAtomFamily,
  createSessionAtom,
  sessionInteractionLockedAtom,
  sessionDraftAtomFamily,
  renameSessionAtom,
  hydrateSessionsAtom,
  loadMessagesAtom,
  messagesAtomFamily,
  sessionsAtom,
} from './sessionAtoms.ts';

let sessionCounter = 0;
let savedSessions: SessionMeta[] = [];
let savedMessages: Record<string, unknown[]> = {};

function makeSession(title: string): SessionMeta {
  sessionCounter += 1;
  return {
    id: `s${sessionCounter}`,
    title,
    status: 'idle',
    createdAt: 1000,
    updatedAt: 1000,
    messageCount: 0,
  };
}

function makeClient(): FinagentClient {
  return {
    kernel: {
      hydrate: async () => ({ ok: true as const, data: { sessions: savedSessions } }),
      createSession: async (title?: string) => {
        const session = makeSession(title ?? 'New Session');
        savedSessions = [...savedSessions, session];
        return { ok: true as const, data: session };
      },
      renameSession: async (id: string, title: string) => {
        const session = savedSessions.find((item) => item.id === id)!;
        const renamed = { ...session, title, updatedAt: 2000 };
        savedSessions = savedSessions.map((item) => item.id === id ? renamed : item);
        return { ok: true as const, data: renamed };
      },
      deleteSession: async (id: string) => {
        savedSessions = savedSessions.filter((session) => session.id !== id);
        return { ok: true as const, data: undefined };
      },
      getMessages: async (sessionId: string) => ({
        ok: true as const,
        data: (savedMessages[sessionId] ?? []) as never[],
      }),
      listRuns: async () => ({ ok: true as const, data: [] as Run[] }),
      startRun: async () => ({ ok: false as const, error: { code: 'TEST', message: 'no-op' } }),
      cancelRun: async () => ({ ok: true as const, data: undefined }),
      streamReplay: async () => ({ ok: true as const, data: { recoverable: false, events: [], atEnd: true } }),
      onAgentEvent: () => () => undefined,
      onStreamEvent: () => () => undefined,
    },
    agent: {
      getTools: async () => ({ ok: true as const, data: [] }),
    },
    market: {
      getQuote: async () => ({ ok: false as const, error: { code: 'TEST', message: 'no-op' } }),
      getKline: async () => ({ ok: false as const, error: { code: 'TEST', message: 'no-op' } }),
      getPortfolio: async () => ({ ok: false as const, error: { code: 'TEST', message: 'no-op' } }),
      getStaticInfo: async () => ({ ok: false as const, error: { code: 'TEST', message: 'no-op' } }),
      getCalcIndex: async () => ({ ok: false as const, error: { code: 'TEST', message: 'no-op' } }),
      getMarketStatus: async () => ({ ok: false as const, error: { code: 'TEST', message: 'no-op' } }),
      getNews: async () => ({ ok: false as const, error: { code: 'TEST', message: 'no-op' } }),
    },
    longbridge: {
      getStatus: async () => ({ ok: false as const, error: { code: 'TEST', message: 'no-op' } }),
    },
    alerts: {
      loadRules: async () => ({ ok: true as const, data: [] }),
      saveRules: async () => ({ ok: true as const, data: undefined }),
      listEvents: async () => ({ ok: true as const, data: [] }),
      onTriggered: () => () => undefined,
    },
    llm: {
      getState: async () => ({ ok: false as const, error: { code: 'TEST', message: 'no-op' } }),
      listModels: async () => ({ ok: false as const, error: { code: 'TEST', message: 'no-op' } }),
      setModel: async () => ({ ok: false as const, error: { code: 'TEST', message: 'no-op' } }),
      listThinkingLevels: async () => ({ ok: false as const, error: { code: 'TEST', message: 'no-op' } }),
      setThinkingLevel: async () => ({ ok: false as const, error: { code: 'TEST', message: 'no-op' } }),
      getProviders: async () => ({ ok: false as const, error: { code: 'TEST', message: 'no-op' } }),
      listCredentials: async () => ({ ok: false as const, error: { code: 'TEST', message: 'no-op' } }),
      setCredential: async () => ({ ok: false as const, error: { code: 'TEST', message: 'no-op' } }),
      removeCredential: async () => ({ ok: false as const, error: { code: 'TEST', message: 'no-op' } }),
      setCustomProvider: async () => ({ ok: false as const, error: { code: 'TEST', message: 'no-op' } }),
      removeCustomProvider: async () => ({ ok: false as const, error: { code: 'TEST', message: 'no-op' } }),
      testProvider: async () => ({ ok: false as const, error: { code: 'TEST', message: 'no-op' } }),
    },
    skills: {
      list: async () => ({ ok: false as const, error: { code: 'TEST', message: 'no-op' } }),
      setEnabled: async () => ({ ok: false as const, error: { code: 'TEST', message: 'no-op' } }),
      listResources: async () => ({ ok: false as const, error: { code: 'TEST', message: 'no-op' } }),
      readResource: async () => ({ ok: false as const, error: { code: 'TEST', message: 'no-op' } }),
      readiness: async () => ({ ok: false as const, error: { code: 'TEST', message: 'no-op' } }),
    },
  };
}

describe('session atoms', () => {
  it('retains a complete live answer until its persisted replacement is ready', async () => {
    const store = createStore();
    const client = makeClient();
    const user = { id: 'u', role: 'user' as const, content: 'question', timestamp: 1 };
    const live = { id: 'live', role: 'assistant' as const, content: 'answer', timestamp: 2 };
    const saved = { ...live, id: 'saved' };
    store.set(messagesAtomFamily('completion'), [user, live]);
    store.set(answerExpansionAtomFamily('completion'), { live: false });
    let reads = 0;
    client.kernel.getMessages = async () => {
      reads += 1;
      expect(store.get(messagesAtomFamily('completion'))).toEqual([user, live]);
      return { ok: true, data: reads < 3 ? [user] : [user, saved] };
    };
    await store.set(loadMessagesAtom, client, 'completion', 2);
    expect(reads).toBe(3);
    expect(store.get(messagesAtomFamily('completion'))).toEqual([user, saved]);
    expect(store.get(answerExpansionAtomFamily('completion'))).toEqual({ saved: false });
  });

  it('does not erase a complete answer if persistence stays behind the refresh deadline', async () => {
    const store = createStore();
    const client = makeClient();
    const live = { id: 'live', role: 'assistant' as const, content: 'answer', timestamp: 2 };
    store.set(messagesAtomFamily('delayed'), [live]);
    client.kernel.getMessages = async () => ({ ok: true, data: [] });
    await store.set(loadMessagesAtom, client, 'delayed', 1);
    expect(store.get(messagesAtomFamily('delayed'))).toEqual([live]);
  });
  beforeEach(() => {
    sessionCounter = 0;
    savedSessions = [];
    savedMessages = {};
  });

  it('hydrates sessions from the kernel and activates the first one', async () => {
    const store = createStore();
    savedSessions = [makeSession('Session A')];

    await store.set(hydrateSessionsAtom, makeClient());

    expect(store.get(sessionsAtom)).toHaveLength(1);
    expect(store.get(activeSessionIdAtom)).toBe('s1');
    expect(store.get(sessionsAtom)[0]).toMatchObject({ title: 'Session A', messageCount: 0 });
  });

  it('hides internal research sessions while preserving user sessions', async () => {
    const store = createStore();
    savedSessions = [makeSession('Research'), makeSession('__trail_internal_research__'), makeSession('Session A')];

    await store.set(hydrateSessionsAtom, makeClient());

    expect(store.get(sessionsAtom)).toHaveLength(1);
    expect(store.get(sessionsAtom)[0].title).toBe('Session A');
    expect(store.get(activeSessionIdAtom)).toBe('s3');
  });

  it('creates a session through the kernel and activates it', async () => {
    const store = createStore();
    const client = makeClient();

    await store.set(createSessionAtom, client, 'Portfolio Review');

    expect(store.get(sessionsAtom)).toHaveLength(1);
    expect(store.get(activeSessionIdAtom)).toBe('s1');
    expect(store.get(sessionsAtom)[0].title).toBe('Portfolio Review');
  });

  it('blocks session changes and creation while a response is generating', async () => {
    const store = createStore();
    const client = makeClient();
    await store.set(createSessionAtom, client, 'First');
    store.set(sessionInteractionLockedAtom, true);
    store.set(activeSessionIdAtom, 'other');
    expect(store.get(activeSessionIdAtom)).toBe('s1');
    expect(await store.set(createSessionAtom, client, 'Second')).toBeNull();
    expect(savedSessions).toHaveLength(1);
    store.set(sessionInteractionLockedAtom, false);
    await store.set(createSessionAtom, client, 'Second');
    expect(store.get(activeSessionIdAtom)).toBe('s2');
  });

  it('keeps drafts separate while switching conversations', () => {
    const store = createStore();
    store.set(sessionDraftAtomFamily('first'), 'My draft');
    store.set(sessionDraftAtomFamily('second'), 'Another draft');
    store.set(activeSessionIdAtom, 'second');
    expect(store.get(sessionDraftAtomFamily('first'))).toBe('My draft');
    expect(store.get(sessionDraftAtomFamily('second'))).toBe('Another draft');
  });

  it('renames without switching conversations or replacing live message metadata', async () => {
    const store = createStore();
    const client = makeClient();
    await store.set(createSessionAtom, client, 'Original');
    await store.set(createSessionAtom, client, 'Other');
    store.set(sessionsAtom, (sessions) => sessions.map((session) => session.id === 's1'
      ? { ...session, status: 'running', messageCount: 7 } : session));
    expect(await store.set(renameSessionAtom, client, 's1', '  财报分析  ')).toBe(true);
    expect(store.get(activeSessionIdAtom)).toBe('s2');
    expect(store.get(sessionsAtom)[0]).toMatchObject({ title: '财报分析', messageCount: 7, status: 'running' });
    const restarted = createStore();
    await restarted.set(hydrateSessionsAtom, client);
    expect(restarted.get(sessionsAtom)[0].title).toBe('财报分析');
  });

  it('keeps the existing name when persistence fails', async () => {
    const store = createStore();
    const client = makeClient();
    await store.set(createSessionAtom, client, 'Original');
    client.kernel.renameSession = async () => ({ ok: false, error: { code: 'TEST', message: 'write failed' } });
    expect(await store.set(renameSessionAtom, client, 's1', 'Changed')).toBe(false);
    expect(store.get(sessionsAtom)[0].title).toBe('Original');
  });

  it('loads messages for the active session lazily from the kernel', async () => {
    const store = createStore();
    savedSessions = [makeSession('Session A')];
    savedMessages = {
      s1: [{ id: 'm1', role: 'user', content: 'AAPL.US quote', timestamp: 1000 }],
    };
    const client = makeClient();

    await store.set(hydrateSessionsAtom, client);
    await store.set(loadMessagesAtom, client, 's1');

    expect(store.get(activeMessagesAtom)).toHaveLength(1);
    expect(store.get(activeMessagesAtom)[0]).toMatchObject({
      id: 'm1',
      content: 'AAPL.US quote',
    });
  });

  it('keeps per-session message caches isolated', async () => {
    const store = createStore();
    savedSessions = [makeSession('A'), makeSession('B')];
    savedMessages = {
      s1: [{ id: 'm1', role: 'user', content: 'from A', timestamp: 1000 }],
      s2: [{ id: 'm2', role: 'user', content: 'from B', timestamp: 1000 }],
    };
    const client = makeClient();

    await store.set(hydrateSessionsAtom, client);
    await store.set(loadMessagesAtom, client, 's1');
    await store.set(loadMessagesAtom, client, 's2');

    expect(store.get(messagesAtomFamily('s1'))[0].content).toBe('from A');
    expect(store.get(messagesAtomFamily('s2'))[0].content).toBe('from B');
  });
});
