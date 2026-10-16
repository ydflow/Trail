import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createStore, Provider } from 'jotai';
import { WorkspaceTopbar } from './WorkspaceTopbar';
import { ThemeProvider } from './ThemeProvider';
import { FinagentClientProvider, fallbackClient } from '../../client';
import { activeSymbolAtom, agentPanelVisibleAtom, navSectionAtom, workspaceRefreshAtom } from '../../atoms';
import { installHappyDom } from '../../test/setupHappyDom';
import { I18nextProvider, makeTestI18n } from '../../test/i18nTest';

let restore: (() => void) | undefined;
beforeAll(() => { restore = installHappyDom().restore; });
afterAll(() => restore?.());

describe('WorkspaceTopbar controls', () => {
  it('switches themes, toggles the assistant, and refreshes data without reloading the app', async () => {
    const store = createStore();
    store.set(navSectionAtom, 'watchlist');
    store.set(activeSymbolAtom, 'AAPL.US');
    store.set(agentPanelVisibleAtom, true);
    window.localStorage.setItem('trail.theme', 'light');
    const requested: string[] = [];
    const client = { ...fallbackClient, market: { ...fallbackClient.market, getQuote: async (symbol: string) => {
      requested.push(symbol);
      return { ok: false as const, error: { code: 'OFFLINE', message: 'offline test' } };
    } } };
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => root.render(
      <Provider store={store}><I18nextProvider i18n={makeTestI18n('zh-CN')}><FinagentClientProvider client={client}><ThemeProvider><WorkspaceTopbar /></ThemeProvider></FinagentClientProvider></I18nextProvider></Provider>
    ));
    const button = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement;
    await act(async () => button('workspace-theme-toggle').click());
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(window.localStorage.getItem('trail.theme')).toBe('dark');
    await act(async () => button('workspace-theme-toggle').click());
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    await act(async () => button('workspace-agent-toggle').click());
    expect(store.get(agentPanelVisibleAtom)).toBe(false);
    await act(async () => button('workspace-agent-toggle').click());
    expect(store.get(agentPanelVisibleAtom)).toBe(true);
    await act(async () => { button('workspace-refresh').click(); });
    expect(requested).toEqual(['AAPL.US']);
    expect(store.get(workspaceRefreshAtom)).toBe(1);
    expect(button('workspace-refresh').disabled).toBe(false);
    expect(container.querySelector('[role="status"]')?.textContent).toBe('数据已刷新');
    await act(async () => store.set(navSectionAtom, 'research'));
    expect(button('workspace-refresh').disabled).toBe(true);
    await act(async () => root.unmount());
  });
});
