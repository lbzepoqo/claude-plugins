import { expect, test } from 'claude-code/testing'

import { isCommit, markAfterTurn, parseMark, ruleText, shouldCompact, shouldRemind } from '../hooks/register'

const limits = { boundaryTokens: 200_000, softTokens: 300_000 }

test('the tool input gives the state and the focus', () => {
  expect(parseMark({ state: 'boundary', focus: ' Keep the plan file path.\n' })).toEqual({ state: 'boundary', focus: 'Keep the plan file path.' })
  expect(parseMark({ state: ' Busy ' })).toEqual({ state: 'busy', focus: '' })
  expect(parseMark({ state: 'done', focus: 'anything' })).toBe(null)
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

test('a boundary lasts one turn, busy stays', () => {
  expect(markAfterTurn({ state: 'boundary', focus: 'x' })).toBe(null)
  expect(markAfterTurn({ state: 'busy', focus: 'x' })).toEqual({ state: 'busy', focus: 'x' })
  expect(markAfterTurn(null)).toBe(null)
})

test('a commit gets the reminder at the boundary limit, or below it while busy', () => {
  const busy = { state: 'busy' as const, focus: '' }
  expect(shouldRemind(null, 199_999, limits)).toBe(false)
  expect(shouldRemind(null, 200_000, limits)).toBe(true)
  expect(shouldRemind(busy, 150_000, limits)).toBe(true)
  expect(shouldRemind(null, undefined, limits)).toBe(false)
})

test('a commit is recognized, also after other commands and with -C', () => {
  expect(isCommit("git add a.ts && git commit -m 'Fix'")).toBe(true)
  expect(isCommit('git -C /tmp/repo commit -qm x')).toBe(true)
  expect(isCommit('git log --grep commit')).toBe(false)
  expect(isCommit('git status')).toBe(false)
})

test('the rule names the configured limits', () => {
  const text = ruleText({ boundaryTokens: 150_000, softTokens: 250_000 })
  expect(text).toContain('contains 150k tokens or more')
  expect(text).toContain('compacts at 250k tokens')
})
