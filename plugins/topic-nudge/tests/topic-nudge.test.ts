import { expect, test } from 'claude-code/testing'

import type { PromptHistory } from '../types'
import { afterNewTopic, classifierText, earlierPrompts, isTypedRequest, remember } from '../hooks/register'

const composer = { kind: 'composer' } as const

test('only requests the person typed are judged', () => {
  expect(isTypedRequest({ text: 'fix the flaky login test please', origin: composer })).toBe(true)
  expect(isTypedRequest({ text: 'yes, go ahead', origin: composer })).toBe(false)
  expect(isTypedRequest({ text: '/review the whole branch please', origin: composer })).toBe(false)
  expect(isTypedRequest({ text: 'fix the flaky login test please', origin: composer, isMeta: true })).toBe(false)
  expect(isTypedRequest({ text: 'a background task finished its work', origin: { kind: 'task-notification' } as never })).toBe(false)
  expect(isTypedRequest({ text: 'fix the flaky login test please', origin: { kind: 'sdk' } as never })).toBe(false)
})

test('requests from another session or from before /clear are not compared', () => {
  const stored = { sessionId: 'a', prompts: ['fix the login test'] }
  expect(earlierPrompts(stored, 'a')).toEqual(['fix the login test'])
  expect(earlierPrompts(stored, 'b')).toEqual([])
})

test('the history keeps the last five requests, each cut to 300 characters', () => {
  let stored: PromptHistory = { sessionId: 'a', prompts: [] }
  for (const n of [1, 2, 3, 4, 5, 6]) stored = remember(stored.prompts, 'a', `request ${n}`)
  expect(stored.prompts).toEqual(['request 2', 'request 3', 'request 4', 'request 5', 'request 6'])
  expect(remember([], 'a', 'x'.repeat(400)).prompts[0]).toHaveLength(300)
})

test('after a new topic only the new request is kept', () => {
  const stored = { sessionId: 'a', prompts: ['fix the login test', 'and the logout one', 'write the release notes'] }
  expect(afterNewTopic(stored, 'a', 'write the release notes').prompts).toEqual(['write the release notes'])
  expect(afterNewTopic(stored, 'b', 'write the release notes')).toBe(stored)
  expect(afterNewTopic(stored, 'a', 'something else')).toBe(stored)
})

test('the classifier reads the earlier requests, then the new one', () => {
  const text = classifierText(['fix the login test'], 'write the release notes')
  expect(text).toContain('- fix the login test')
  expect(text.endsWith('New request from the user: write the release notes')).toBe(true)
})
