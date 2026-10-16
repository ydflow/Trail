import { afterAll, beforeAll, expect, it } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { DemoBadge } from './DemoBadge';
import { installHappyDom } from '../../test/setupHappyDom';
import { TestI18n } from '../../test/testI18n';

let restore: () => void;
beforeAll(() => { restore = installHappyDom().restore; });
afterAll(() => restore());

it('explains why a surface is using samples and closes without changing data', async () => {
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<TestI18n><DemoBadge reason="Account-data permission is missing." /></TestI18n>));
    await act(async () => container.querySelector('button')?.click());
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Account-data permission is missing.');
    expect(dialog?.textContent).toContain('not your actual holdings');
    await act(async () => dialog?.querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')?.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  } finally { await act(async () => root.unmount()); container.remove(); }
});
