import { afterAll, beforeAll, expect, it } from 'bun:test'
import React, { act } from 'react'
import { getDefaultStore } from 'jotai'
import { commandPaletteOpenAtom } from '../../atoms/commandPaletteAtoms'
import { I18nextProvider, makeTestI18n } from '../../test/i18nTest'
import { installHappyDom } from '../../test/setupHappyDom'

let dom: ReturnType<typeof installHappyDom>
const previousObserver = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver')

beforeAll(() => {
  dom = installHappyDom()
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: dom.window.ResizeObserver })
})

afterAll(() => {
  if (previousObserver) Object.defineProperty(globalThis, 'ResizeObserver', previousObserver)
  else Reflect.deleteProperty(globalThis, 'ResizeObserver')
  dom.restore()
})

for (const shortcut of ['Ctrl+K', '⌘K', 'Escape']) {
  it(`returns focus to the opener when closed with ${shortcut}`, async () => {
    const { createRoot } = await import('react-dom/client')
    const { CommandPalette } = await import('./CommandPalette')
    const container = document.createElement('div')
    const opener = document.createElement('button')
    document.body.append(opener, container)
    const root = createRoot(container)
    const toggle = { key: 'k', ctrlKey: shortcut !== '⌘K', metaKey: shortcut === '⌘K', bubbles: true }
    try {
      await act(async () => root.render(<I18nextProvider i18n={makeTestI18n('en-US')}><CommandPalette /></I18nextProvider>))
      opener.focus()
      await act(async () => { opener.dispatchEvent(new KeyboardEvent('keydown', toggle)) })
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const input = container.querySelector('input')
      expect(input).not.toBeNull()
      expect(document.activeElement).toBe(input)
      const close = shortcut === 'Escape' ? { key: 'Escape', bubbles: true } : toggle
      await act(async () => { input!.dispatchEvent(new KeyboardEvent('keydown', close)) })
      expect(container.querySelector('input')).toBeNull()
      expect(document.activeElement === opener).toBe(true)
    } finally {
      await act(async () => root.unmount())
      getDefaultStore().set(commandPaletteOpenAtom, false)
      container.remove()
      opener.remove()
    }
  })
}
