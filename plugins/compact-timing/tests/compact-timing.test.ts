import { expect, test } from 'claude-code/testing'

import { parseMark, ruleText, shouldCompact } from '../hooks/register'

const limits = { boundaryTokens: 200_000, softTokens: 300_000 }

test('the first line is the state, the rest the focus', () => {
  expect(parseMark('boundary\nKeep the plan file path.\n')).toEqual({ state: 'boundary', focus: 'Keep the plan file path.' })
  expect(parseMark(' Busy \n')).toEqual({ state: 'busy', focus: '' })
  expect(parseMark('done\nanything')).toBe(null)
})

test('a boundary compacts earlier, no mark at the soft limit, busy never', () => {
  const boundary = { state: 'boundary' as const, focus: '' }
  const busy = { state: 'busy' as const, focus: '' }
  expect(shouldCompact(boundary, 199_999, limits)).toBe(false)
  expect(shouldCompact(boundary, 200_000, limits)).toBe(true)
  expect(shouldCompact(null, 250_000, limits)).toBe(false)
  expect(shouldCompact(null, 300_000, limits)).toBe(true)
  expect(shouldCompact(busy, 450_000, limits)).toBe(false)
  expect(shouldCompact(null, undefined, limits)).toBe(false)
})

test('the rule names the state file and the configured limits', () => {
  const text = ruleText('/home/a/.cache/compact-timing/mark.md', { boundaryTokens: 150_000, softTokens: 250_000 })
  expect(text).toContain('Write the state to /home/a/.cache/compact-timing/mark.md with the Write tool.')
  expect(text).toContain('contains 150k tokens or more')
  expect(text).toContain('compacts at 250k tokens')
})
