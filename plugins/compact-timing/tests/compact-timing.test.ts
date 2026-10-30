import { expect, test } from 'claude-code/testing'

import { compactInstructions, contextNote, contextNoteDue, isCommit, limitOption, openUserSteps, parseMark, ruleText, shouldCompact, shouldRemind, transcriptSearch, turnEnd } from '../hooks/register'

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

test('a boundary lasts one turn, also an interrupted one, which never compacts; busy stays', () => {
  const boundary = { state: 'boundary' as const, focus: 'x' }
  const busy = { state: 'busy' as const, focus: 'x' }
  expect(turnEnd(boundary, 250_000, false, limits)).toEqual({ next: null, compact: true })
  expect(turnEnd(boundary, 150_000, false, limits)).toEqual({ next: null, compact: false })
  expect(turnEnd(boundary, 250_000, true, limits)).toEqual({ next: null, compact: false })
  expect(turnEnd(busy, 450_000, false, limits)).toEqual({ next: busy, compact: false })
  expect(turnEnd(null, 300_000, false, limits)).toEqual({ next: null, compact: true })
})

test('a commit gets the reminder at the boundary limit, or below it while busy', () => {
  const busy = { state: 'busy' as const, focus: '' }
  expect(shouldRemind(null, 199_999, limits)).toBe(false)
  expect(shouldRemind(null, 200_000, limits)).toBe(true)
  expect(shouldRemind(busy, 150_000, limits)).toBe(true)
  expect(shouldRemind(null, undefined, limits)).toBe(false)
})

test('a commit is recognized, also after other commands and global options', () => {
  expect(isCommit("git add a.ts && git commit -m 'Fix'")).toBe(true)
  expect(isCommit('git -C /tmp/repo commit -qm x')).toBe(true)
  expect(isCommit('git -C "/my repo" --no-pager commit -m x')).toBe(true)
  expect(isCommit('git commit-tree HEAD^{tree}')).toBe(false)
  expect(isCommit('git log --grep commit')).toBe(false)
  expect(isCommit('git status')).toBe(false)
})

test('the rule names the configured limits', () => {
  const text = ruleText({ boundaryTokens: 150_000, softTokens: 250_000 })
  expect(text).toContain('contains 150k tokens or more')
  expect(text).toContain('compacts at 250k tokens')
})

test('an empty or misspelled limit falls back to the default', () => {
  expect(limitOption('150000', 200_000)).toBe(150_000)
  expect(limitOption('', 200_000)).toBe(200_000)
  expect(limitOption('300k', 300_000)).toBe(300_000)
  expect(limitOption(undefined, 300_000)).toBe(300_000)
})

test('every compaction asks for the open user steps and the transcript search; only one Claude Code starts falls back to the focus', () => {
  const busy = { state: 'busy' as const, focus: 'Keep the failing test name.' }
  const standing = `${openUserSteps}\n\n${transcriptSearch}`
  expect(compactInstructions('auto', undefined, busy)).toBe(`Keep the failing test name.\n\n${standing}`)
  expect(compactInstructions('precompute', ' ', busy)).toBe(`Keep the failing test name.\n\n${standing}`)
  expect(compactInstructions('auto', 'the user text', busy)).toBe(`the user text\n\n${standing}`)
  expect(compactInstructions('manual', undefined, busy)).toBe(standing)
  expect(compactInstructions('manual', 'keep the plan', busy)).toBe(`keep the plan\n\n${standing}`)
  expect(compactInstructions('plugin', 'Next: deploy.', null)).toBe(`Next: deploy.\n\n${standing}`)
  expect(compactInstructions('auto', undefined, null)).toBe(standing)
})

test('the context note comes once at the boundary limit and again only after the context fell below it', () => {
  expect(contextNoteDue(199_999, false, limits)).toEqual({ due: false, noted: false })
  expect(contextNoteDue(200_000, false, limits)).toEqual({ due: true, noted: true })
  expect(contextNoteDue(260_000, true, limits)).toEqual({ due: false, noted: true })
  expect(contextNoteDue(90_000, true, limits)).toEqual({ due: false, noted: false })
  expect(contextNoteDue(undefined, true, limits)).toEqual({ due: false, noted: true })
  expect(contextNote(204_000, 'mcp__x__mark')).toContain('The context holds 204k tokens')
  expect(contextNote(204_000, 'mcp__x__mark')).toContain('call mcp__x__mark with `boundary`')
})
