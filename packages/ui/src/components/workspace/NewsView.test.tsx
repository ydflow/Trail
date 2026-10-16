import { afterAll, beforeAll, expect, it } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider, createStore } from 'jotai';
import { activeSymbolAtom, workspaceRefreshAtom } from '../../atoms';
import { fallbackClient, FinagentClientProvider } from '../../client';
import { installHappyDom } from '../../test/setupHappyDom';
import { TestI18n } from '../../test/testI18n';
import { NewsView } from './NewsView';

let restore: () => void;
beforeAll(() => { restore = installHappyDom().restore; });
afterAll(() => restore());

it('shows second-based publication times, sorts newest first, and reloads on refresh', async () => {
  const store = createStore();
  store.set(activeSymbolAtom, 'AAPL.US');
  const now = Math.floor(Date.now() / 1000);
  let requests = 0;
  const client = { ...fallbackClient, market: { ...fallbackClient.market, getNews: async () => {
    requests++;
    return { ok: true as const, data: [
      { id: 'older', title: 'Earlier story', summary: '', url: 'https://example.test/older', timestamp: now - 7200, symbols: [] },
      { id: 'latest', title: 'Latest story', summary: '', url: 'https://example.test/latest', timestamp: now - 300, symbols: [] },
    ] };
  } } };
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(<TestI18n><Provider store={store}><FinagentClientProvider client={client}><NewsView /></FinagentClientProvider></Provider></TestI18n>);
    });
    expect(container.querySelector('li')?.textContent).toContain('Latest story');
    expect(container.textContent).toContain('5m ago');
    expect(container.textContent).not.toContain('57y');
    expect(container.querySelector('time')?.getAttribute('dateTime')).toBe(new Date((now - 300) * 1000).toISOString());
    await act(async () => { store.set(workspaceRefreshAtom, 1); });
    expect(requests).toBe(2);
  } finally { await act(async () => root.unmount()); container.remove(); }
});
