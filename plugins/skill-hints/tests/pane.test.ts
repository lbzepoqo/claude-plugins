import type { CommandInfo, On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { isTypedRequest } from '../hooks/register'

const PANE = {
  component: 'Pane',
  requestId: 'skill-hints',
  props: { title: 'Skills', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const COMMANDS: CommandInfo[] = [
  { name: 'humanizer', description: 'Rewrite AI-sounding text', source: 'user' },
  { name: 'mattpocock-skills:tdd', description: 'Test-driven development', source: 'plugin', plugin: 'mattpocock-skills' },
]

const OPEN = { command: 'skill-hints', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } } as const

// The hooks beneath the plugin stand for the engine: the command list, the prompt box and the pane calls.
function engine(on: On, filled: string[]) {
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'skill-hints' } }))
  on('command.list', () => ({ value: COMMANDS }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('prompt.read', () => ({ value: { text: 'fix the flaky test', cursor: 0 } }))
  on('prompt.fill', (_, e) => {
    filled.push(e.text)
    return { isFilled: true }
  })
}

describe('skills pane', () => {
  test('draws the catalog on every surface, with a filter where the surface has one', async ($, on) => {
    engine(on, [])
    await $.command.run(OPEN)
    for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
      const ui = await $.ui.mount({ plugin: 'skill-hints', surface, ...PANE })
      expect(await ui.find({ key: 'humanizer' })).toBeDefined()
      expect(Boolean(await ui.find({ key: 'filter' }))).toBe(surface !== 'mobile')
      await ui.unmount()
    }
  })

  test('the filter narrows the list and a row puts its command in front of the draft', async ($, on) => {
    const filled: string[] = []
    engine(on, filled)
    await $.command.run(OPEN)
    const ui = await $.ui.mount({ plugin: 'skill-hints', surface: 'terminal', ...PANE })
    // Enter with nothing typed and no suggestion fills nothing.
    await ui.input({ key: 'filter', text: '' })
    expect(filled).toEqual([])
    await ui.input({ key: 'filter', text: 'test', kind: 'change' })
    expect(await ui.find({ key: 'humanizer' })).toBeUndefined()
    await ui.press({ key: 'mattpocock-skills:tdd' })
    expect(filled).toEqual(['/mattpocock-skills:tdd fix the flaky test'])
    await ui.unmount()
  })
})

test('only requests typed at the prompt get a hint', () => {
  const composer = { kind: 'composer' } as const
  expect(isTypedRequest({ text: 'make this text sound less robotic', origin: composer })).toBe(true)
  expect(isTypedRequest({ text: 'ok', origin: composer })).toBe(false)
  expect(isTypedRequest({ text: '/humanizer make this sound less robotic', origin: composer })).toBe(false)
  expect(isTypedRequest({ text: 'make this text sound less robotic', origin: { kind: 'sdk' } as never })).toBe(false)
})
