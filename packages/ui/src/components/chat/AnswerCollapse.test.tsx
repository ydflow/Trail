import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createStore, Provider } from 'jotai';
import type { Message } from '@finagent/core';
import { installHappyDom } from '../../test/setupHappyDom';
import { I18nextProvider, makeTestI18n } from '../../test/i18nTest';
import { TurnCard } from './TurnCard';
import { answerExpansionAtomFamily } from '../../atoms/sessionAtoms';

const content = '## Title\n\nIntroduction.\n\n## Details\n\n| Metric | Value |\n| --- | --- |\n| Revenue | 10 |\n\nTail [Hidden link](https://example.com).';
const message: Message = { id: 'long', role: 'assistant', content, timestamp: 0,
  toolCalls: [{ id: 'quote', toolName: 'get_quote', args: {}, status: 'success', startedAt: 0, completedAt: 1 }] };
let restoreDom: (() => void) | undefined;
let root: Root | undefined;
let rectSpy: ReturnType<typeof spyOn>;
let short = false;

function rect(top: number, height: number): DOMRect {
  return { top, bottom: top + height, height, width: 400, left: 0, right: 400, x: 0, y: top, toJSON: () => ({}) };
}

beforeAll(() => { restoreDom = installHappyDom().restore; });
afterAll(() => restoreDom?.());
beforeEach(() => {
  short = false;
  // Happy DOM has no layout. These boxes represent a title, complete paragraph,
  // new section, table and link; real sizes/resize/scroll are checked in Electron.
  rectSpy = spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('trail-answer-content') || this.classList.contains('markdown-content')) return rect(0, short ? 100 : 650);
    if (this.tagName === 'H2') return rect(this.textContent === 'Title' ? 0 : 220, 28);
    if (this.tagName === 'P') return this.textContent?.startsWith('Introduction') ? rect(44, 144) : rect(540, 80);
    if (this.hasAttribute('data-citation-id')) return rect(630, 12);
    if (this.querySelector('table')) return rect(270, 230);
    return rect(0, 0);
  });
});
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; rectSpy.mockRestore(); });

async function render(messages: Message[] = [message], store = createStore(), sessionId = 'session') {
  const container = document.createElement('div');
  root = createRoot(container);
  await act(async () => root!.render(
    <Provider store={store}><I18nextProvider i18n={makeTestI18n('zh-CN')}>
      {messages.map((item) => <TurnCard key={item.id} message={item} sessionId={sessionId} />)}
    </I18nextProvider></Provider>
  ));
  return { container, store };
}

describe('answer collapse', () => {
  it('previews complete paragraphs, moves the entire table below the fold and keeps sources accessible', async () => {
    const { container } = await render();
    const toggle = container.querySelector<HTMLButtonElement>('[data-testid="answer-toggle"]')!;
    expect(toggle.textContent).toBe('展开全文');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector<HTMLElement>('.trail-answer-preview')?.style.maxHeight).toBe('188px');
    expect(container.querySelector('table')?.closest('[inert]')).not.toBeNull();
    expect(container.querySelector('a')?.closest('[inert]')).not.toBeNull();
    expect(container.querySelector('[data-testid="open-source-inspector"]')?.closest('[inert]')).toBeNull();
    await act(async () => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[inert]')).toBeNull();
    expect(container.querySelector('.trail-answer-collapse-top')).not.toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>('.trail-answer-collapse-top')!.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('remembers each message independently and restores its choice after the panel remounts', async () => {
    const { container, store } = await render([message, { ...message, id: 'second' }]);
    const toggles = container.querySelectorAll<HTMLButtonElement>('[data-testid="answer-toggle"]');
    await act(async () => toggles[0].click());
    expect(toggles[1].getAttribute('aria-expanded')).toBe('false');
    expect(store.get(answerExpansionAtomFamily('session'))).toEqual({ long: true });
    await act(async () => root!.unmount());
    root = undefined;
    const again = await render([message], store);
    expect(again.container.querySelector('[data-testid="answer-toggle"]')?.getAttribute('aria-expanded')).toBe('true');
    expect(store.get(answerExpansionAtomFamily('other-session'))).toEqual({});
  });

  it('leaves short answers and user messages without collapse controls', async () => {
    short = true;
    const { container } = await render([message, { ...message, id: 'user', role: 'user' }]);
    expect(container.querySelector('[data-testid="answer-toggle"]')).toBeNull();
    expect(container.querySelector('[inert]')).toBeNull();
  });

  it('remeasures when the panel changes size without losing the reader choice', async () => {
    const { container } = await render();
    short = true;
    await act(async () => window.dispatchEvent(new Event('resize')));
    expect(container.querySelector('[data-testid="answer-toggle"]')).toBeNull();
    short = false;
    await act(async () => window.dispatchEvent(new Event('resize')));
    expect(container.querySelector('[data-testid="answer-toggle"]')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps a hidden citation out of keyboard order when late evidence turns it into a button', async () => {
    const pending = { ...message, content: `${content}⟦cite:quote⟧`, toolCalls: undefined };
    const { container, store } = await render([pending]);
    expect(container.querySelector('[data-citation-id="quote"]')?.tagName).toBe('SUP');
    await act(async () => root!.render(
      <Provider store={store}><I18nextProvider i18n={makeTestI18n('zh-CN')}>
        <TurnCard key={pending.id} message={{ ...pending, toolCalls: message.toolCalls }} sessionId="session" />
      </I18nextProvider></Provider>
    ));
    const citation = container.querySelector('[data-citation-id="quote"]');
    expect(citation?.tagName).toBe('BUTTON');
    expect(citation?.closest('[inert]')).not.toBeNull();
  });
});
