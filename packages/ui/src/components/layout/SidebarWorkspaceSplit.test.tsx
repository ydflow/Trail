import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SidebarWorkspaceSplit } from './SidebarWorkspaceSplit';
import { installHappyDom } from '../../test/setupHappyDom';
import { I18nextProvider, makeTestI18n } from '../../test/i18nTest';

const KEY = 'trail.prefs.sidebarWatchlistHeight';
let restore: () => void;
let root: Root | undefined;
let container: HTMLDivElement;
let measuredHeight = 612;
let resize: () => void;
let disconnects = 0;
const originalObserver = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');

beforeAll(() => {
  restore = installHappyDom().restore;
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect() { disconnects++; }
  } });
  HTMLElement.prototype.getBoundingClientRect = () => ({ height: measuredHeight } as DOMRect);
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
});
beforeEach(() => {
  window.localStorage.clear();
  measuredHeight = 612;
  disconnects = 0;
  container = document.createElement('div');
});
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; });
afterAll(() => {
  if (originalObserver) Object.defineProperty(globalThis, 'ResizeObserver', originalObserver);
  else Reflect.deleteProperty(globalThis, 'ResizeObserver');
  restore();
});

async function render(enabled = true) {
  root ??= createRoot(container);
  await act(async () => root!.render(
    <I18nextProvider i18n={makeTestI18n('zh-CN')}>
      <SidebarWorkspaceSplit enabled={enabled} upper={<nav>Navigation</nav>}>
        <div>Watchlist</div>
      </SidebarWorkspaceSplit>
    </I18nextProvider>
  ));
}
function handle() { return container.querySelector('[role="separator"]') as HTMLDivElement; }
function height() { return Number(handle().getAttribute('aria-valuenow')); }
async function key(value: string) {
  await act(async () => handle().dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true })));
}
async function pointer(type: string, y: number) {
  await act(async () => handle().dispatchEvent(new PointerEvent(type, {
    pointerId: 1, isPrimary: true, button: 0, clientY: y, bubbles: true,
  })));
}

describe('Sidebar watchlist resizing', () => {
  it('saves a completed upward/downward drag, but never persists intermediate moves', async () => {
    await render();
    expect(height()).toBe(340);
    await pointer('pointerdown', 400);
    await pointer('pointermove', 300);
    expect(height()).toBe(440);
    expect(window.localStorage.getItem(KEY)).toBeNull();
    await pointer('pointerup', 300);
    await pointer('lostpointercapture', 300);
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toBe(440);
    await pointer('pointerdown', 300);
    await pointer('pointermove', 380);
    await pointer('pointerup', 380);
    expect(height()).toBe(360);
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toBe(360);
    await act(async () => root!.unmount());
    root = undefined;
    await render();
    expect(height()).toBe(360);
  });

  it('cancels interrupted drags and restores the prior preference', async () => {
    window.localStorage.setItem(KEY, '340');
    await render();
    await pointer('pointerdown', 400);
    await pointer('pointermove', 250);
    await key('Escape');
    expect(height()).toBe(340);
    expect(window.localStorage.getItem(KEY)).toBe('340');
    await pointer('pointerdown', 400);
    await pointer('pointermove', 500);
    await pointer('pointercancel', 500);
    expect(height()).toBe(340);
  });

  it('supports keyboard bounds and resets, and double-click returns to the responsive default', async () => {
    await render();
    await key('ArrowUp');
    expect(height()).toBe(356);
    await key('ArrowDown');
    expect(height()).toBe(340);
    await key('End');
    expect(height()).toBe(480);
    await key('ArrowUp');
    expect(height()).toBe(480);
    await key('Home');
    expect(height()).toBe(340);
    expect(window.localStorage.getItem(KEY)).toBe('null');
    await pointer('pointerdown', 400);
    await pointer('pointermove', 1000);
    await pointer('pointerup', 1000);
    expect(height()).toBe(180);
    await act(async () => handle().dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(height()).toBe(340);
  });

  it('clamps short-window layouts without overwriting the saved desktop height', async () => {
    window.localStorage.setItem(KEY, '450');
    await render();
    expect(height()).toBe(450);
    measuredHeight = 212;
    await act(async () => resize());
    expect(height()).toBe(120);
    expect(window.localStorage.getItem(KEY)).toBe('450');
    measuredHeight = 612;
    await act(async () => resize());
    expect(height()).toBe(450);
    await render(false);
    expect(handle()).toBeNull();
    expect(container.textContent).toBe('Navigation');
    expect(disconnects).toBe(1);
    await render();
    expect(height()).toBe(450);
  });

  it.each(['{"bad":1}', '"320"', '-10', 'null', 'broken'])('ignores invalid persisted height %s', async (value) => {
    window.localStorage.setItem(KEY, value);
    await render();
    expect(height()).toBe(340);
  });
});
