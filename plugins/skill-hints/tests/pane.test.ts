import { describe, expect, mock, test } from 'claude-code/testing'

import { isTypedRequest } from '../hooks/register'

const PANE = {
  component: 'Pane',
  requestId: 'skill-hints',
  props: { title: 'Skills', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

describe('skills pane', () => {
  test('draws a tree the surface accepts', async ($, on) => {
    mock.clock(on)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'skill-hints', surface, ...PANE })
      await expect(ui.drawn()).resolves.toMatchObject({ type: 'Box' })
      await ui.unmount()
    }
  })
})

test('only requests typed at the prompt get a hint', () => {
  const composer = { kind: 'composer' } as const
  expect(isTypedRequest({ text: 'make this text sound less robotic', origin: composer })).toBe(true)
  expect(isTypedRequest({ text: 'ok', origin: composer })).toBe(false)
  expect(isTypedRequest({ text: '/humanizer make this sound less robotic', origin: composer })).toBe(false)
  expect(isTypedRequest({ text: 'make this text sound less robotic', origin: { kind: 'sdk' } as never })).toBe(false)
})
