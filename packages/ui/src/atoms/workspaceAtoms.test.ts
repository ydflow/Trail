import { createStore } from 'jotai';
import { describe, expect, it } from 'bun:test';
import {
  activeSymbolAtom,
  activeViewAtom,
  selectedPositionAtom,
  workspaceContextAtom,
  navSectionAtom,
  agentPanelVisibleAtom,
  agentPanelExpandedAtom,
  openAssistantAtom,
} from './workspaceAtoms';
import { activeSessionIdAtom, sessionsAtom, sessionDraftAtomFamily } from './sessionAtoms';
import type { FinagentClient } from '../client';
import { compareSymbolsAtom } from './compareAtoms';

describe('workspace atoms', () => {
  it('opens the focused assistant without changing context or replacing the current draft', async () => {
    const store = createStore();
    store.set(activeSessionIdAtom, 'current');
    store.set(sessionDraftAtomFamily('current'), 'Keep my draft');
    store.set(navSectionAtom, 'today');
    await store.set(openAssistantAtom, {} as FinagentClient);
    expect(store.get(agentPanelExpandedAtom)).toBe(true);
    expect(store.get(agentPanelVisibleAtom)).toBe(true);
    expect(store.get(activeSessionIdAtom)).toBe('current');
    expect(store.get(sessionDraftAtomFamily('current'))).toBe('Keep my draft');
    expect(store.get(navSectionAtom)).toBe('today');
  });

  it('reuses an existing session when opening without a selection', async () => {
    const store = createStore();
    store.set(sessionsAtom, [{ id: 'existing', title: 'Research notes', status: 'idle', createdAt: 1, updatedAt: 1, messageCount: 0 }]);
    await store.set(openAssistantAtom, {} as FinagentClient);
    expect(store.get(activeSessionIdAtom)).toBe('existing');
    expect(store.get(sessionsAtom)).toHaveLength(1);
  });

  it('creates the first conversation once when opening an empty assistant', async () => {
    const store = createStore();
    let creates = 0;
    const client = { kernel: { createSession: async () => {
      creates++;
      return { ok: true, data: { id: 'first', title: 'New Session', status: 'idle', createdAt: 1, updatedAt: 1, messageCount: 0 } };
    } } } as unknown as FinagentClient;
    await store.set(openAssistantAtom, client);
    await store.set(openAssistantAtom, client);
    expect(creates).toBe(1);
    expect(store.get(activeSessionIdAtom)).toBe('first');
  });
  it('derives WorkspaceContext from active symbol and view', () => {
    const store = createStore();
    store.set(activeSymbolAtom, 'NVDA.US');
    store.set(activeViewAtom, 'chart');

    expect(store.get(workspaceContextAtom)).toEqual({
      activeSymbol: 'NVDA.US',
      activeView: 'chart',
    });
  });

  it('omits unset fields from the context', () => {
    const store = createStore();
    expect(store.get(workspaceContextAtom)).toEqual({
      activeView: 'overview',
    });

    store.set(selectedPositionAtom, 'pos-1');
    expect(store.get(workspaceContextAtom)).toEqual({
      activeView: 'overview',
      selectedPosition: 'pos-1',
    });
  });

  it('includes comparisonSymbols from the compare workspace when set', () => {
    const store = createStore();
    expect(store.get(workspaceContextAtom)).toEqual({ activeView: 'overview' });

    store.set(compareSymbolsAtom, ['AAPL.US', 'MSFT.US']);
    expect(store.get(workspaceContextAtom)).toEqual({
      activeView: 'overview',
      comparisonSymbols: ['AAPL.US', 'MSFT.US'],
    });
  });

  it('nav and panel visibility atoms have defaults', () => {
    const store = createStore();
    expect(store.get(navSectionAtom)).toBe('sessions');
    expect(store.get(agentPanelVisibleAtom)).toBe(true);
    store.set(agentPanelVisibleAtom, false);
    expect(store.get(agentPanelVisibleAtom)).toBe(false);
  });
});
