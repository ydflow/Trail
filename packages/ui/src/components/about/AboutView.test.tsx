import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ApiResult } from '@finagent/core'
import { fallbackClient, FinagentClientProvider, type AboutInfo, type FinagentClient } from '../../client'
import { installHappyDom } from '../../test/setupHappyDom'
import { withI18n } from '../../test/i18n'
import { AboutView } from './AboutView'

let restoreDom: (() => void) | undefined

beforeAll(() => {
  restoreDom = installHappyDom().restore
})

afterAll(() => {
  restoreDom?.()
})

// Offline `app:about` fixture: deliberately unlike any real release so the test
// proves the rendered values come from the request result.
const ABOUT_FIXTURE: AboutInfo = { version: '9.8.7-fixture.1', channel: 'fixture-channel', build: 'f1x7ure5ha' }

async function flushAsync(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function clientWithAbout(get: () => Promise<ApiResult<AboutInfo>>): FinagentClient {
  return { ...fallbackClient, about: { get } }
}

async function render(client: FinagentClient) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      withI18n(
        <FinagentClientProvider client={client}>
          <AboutView />
        </FinagentClientProvider>,
      ),
    )
  })
  const cleanup = async () => {
    await act(async () => root.unmount())
    container.remove()
  }
  return { container, cleanup }
}

function ddValues(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('dd')).map((dd) => dd.textContent ?? '')
}

describe('AboutView', () => {
  it('shows a loading state while about.get() is pending instead of a stale version', async () => {
    const pending = deferred<ApiResult<AboutInfo>>()
    const { container, cleanup } = await render(clientWithAbout(() => pending.promise))
    await flushAsync()

    expect(ddValues(container)).toEqual(['Loading…', 'Loading…', 'Loading…'])
    expect(container.textContent).not.toMatch(/\d+\.\d+\.\d+/)

    await act(async () => {
      pending.resolve({ ok: true, data: ABOUT_FIXTURE })
    })
    await flushAsync()
    expect(ddValues(container)).toEqual([ABOUT_FIXTURE.version, ABOUT_FIXTURE.channel, ABOUT_FIXTURE.build])

    await cleanup()
  })

  it('shows an unavailable state when about.get() returns an error', async () => {
    const { container, cleanup } = await render(
      clientWithAbout(async () => ({ ok: false, error: { code: 'IPC_ERROR', message: 'boom' } })),
    )
    await flushAsync()

    expect(ddValues(container)).toEqual(['Unavailable', 'Unavailable', 'Unavailable'])
    expect(container.textContent).not.toMatch(/\d+\.\d+\.\d+/)

    await cleanup()
  })

  it('shows an unavailable state when about.get() rejects or the channel is missing', async () => {
    const rejected = await render(clientWithAbout(() => Promise.reject(new Error('ipc closed'))))
    await flushAsync()
    expect(ddValues(rejected.container)).toEqual(['Unavailable', 'Unavailable', 'Unavailable'])
    await rejected.cleanup()

    const missing = await render({ ...fallbackClient, about: undefined })
    await flushAsync()
    expect(ddValues(missing.container)).toEqual(['Unavailable', 'Unavailable', 'Unavailable'])
    await missing.cleanup()
  })

  it('renders version, channel and build from the app:about result on success', async () => {
    const { container, cleanup } = await render(clientWithAbout(async () => ({ ok: true, data: ABOUT_FIXTURE })))
    await flushAsync()

    expect(ddValues(container)).toEqual([ABOUT_FIXTURE.version, ABOUT_FIXTURE.channel, ABOUT_FIXTURE.build])
    expect(container.querySelector('[data-testid="about-view"]')?.getAttribute('data-status')).toBe('ready')

    await cleanup()
  })
})
