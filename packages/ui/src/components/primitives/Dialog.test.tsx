import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Dialog } from './Dialog';
import { withI18n } from '../../test/i18n';
import { installHappyDom } from '../../test/setupHappyDom';

let restore: () => void;
beforeAll(() => {
  restore = installHappyDom().restore;
});
afterAll(() => restore());

describe('Dialog close button accessible name', () => {
  it.each([
    ['en-US', 'Close dialog'],
    ['zh-CN', '关闭弹窗'],
  ] as const)('exposes localized close button name for %s', async (locale, expectedName) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    let closed = false;
    try {
      await act(async () => {
        root.render(
          withI18n(
            <Dialog open onClose={() => { closed = true; }} title="Details">
              <p>Body</p>
            </Dialog>,
            locale
          )
        );
      });
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
      const closeButton = buttons.find((btn) => btn.getAttribute('aria-label') === expectedName);
      expect(closeButton).toBeDefined();
      await act(async () => closeButton?.click());
      expect(closed).toBe(true);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
