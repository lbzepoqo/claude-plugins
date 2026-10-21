import { atom, read, update } from 'claude-code'
import type { EngineInterface, PromptSubmitInput, Register } from 'claude-code'

import type { PromptHistory } from '../types'

const EMPTY: PromptHistory = { sessionId: null, prompts: [] }
const history = atom({ plugin: 'topic-nudge', key: 'history' } as const, EMPTY)

// Shorter prompts ("yes", "go on") answer the model rather than ask for something new.
const MIN_PROMPT_LENGTH = 15
// The classifier sees this many earlier requests, each cut to PROMPT_ROOM characters.
const KEEP_PROMPTS = 5
const PROMPT_ROOM = 300

export const SAME_TOPIC = 'continues the earlier work'
export const NEW_TOPIC = 'starts a different topic'

// A request the person typed, at the terminal or through Remote Control: not a slash command, a prompt
// the engine, a task or an SDK host sent, or a prompt too short to judge.
export function isTypedRequest(e: Pick<PromptSubmitInput, 'text' | 'origin' | 'command' | 'isMeta'>): boolean {
  const text = e.text.trim()
  return ['composer', 'bridge'].includes(e.origin.kind) && !e.command && !e.isMeta && !text.startsWith('/') && text.length >= MIN_PROMPT_LENGTH
}

// The requests to compare with: none after /clear or in another session, since each has its own id.
export function earlierPrompts(stored: PromptHistory, sessionId: string): string[] {
  return stored.sessionId === sessionId ? stored.prompts : []
}

export function remember(earlier: readonly string[], sessionId: string, prompt: string): PromptHistory {
  return { sessionId, prompts: [...earlier, prompt.slice(0, PROMPT_ROOM)].slice(-KEEP_PROMPTS) }
}

// After a new topic the older requests no longer describe the work, so the next prompt is compared with the new one only.
export function afterNewTopic(stored: PromptHistory, sessionId: string, prompt: string): PromptHistory {
  if (stored.sessionId !== sessionId) return stored
  const start = stored.prompts.lastIndexOf(prompt.slice(0, PROMPT_ROOM))
  return start < 0 ? stored : { sessionId, prompts: stored.prompts.slice(start) }
}

export function classifierText(earlier: readonly string[], request: string): string {
  return [
    'Earlier requests from the user in this Claude Code session, oldest first:',
    ...earlier.map(prompt => `- ${prompt}`),
    '',
    `New request from the user: ${request}`,
  ].join('\n')
}

export const NUDGE = 'New topic? /clear starts a fresh session, or say how it relates to the current work.'

async function check($: EngineInterface, earlier: readonly string[], sessionId: string, request: string) {
  const label = await $.model.classify(classifierText(earlier, request.slice(0, PROMPT_ROOM)), [SAME_TOPIC, NEW_TOPIC], { model: 'haiku' })
  if (label !== NEW_TOPIC) return
  $.ui.toast(NUDGE, { timeoutMs: 10_000 })
  await update($, history, stored => afterNewTopic(stored, sessionId, request))
}

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    if (!isTypedRequest(e)) return next(e)
    const request = e.text.trim()
    try {
      const sessionId = await $.session.id()
      const earlier = earlierPrompts(await read($, history), sessionId)
      await update($, history, stored => remember(earlierPrompts(stored, sessionId), sessionId, request))
      // The check runs beside the turn, so a slow or failed model call never holds the prompt.
      if (earlier.length > 0) void check($, earlier, sessionId, request).catch(() => undefined)
    } catch {
      // The nudge is a convenience: a failed read or write must never block the prompt.
    }
    return next(e)
  })

  // /clear ends the session too; the session id check covers a state that outlives it.
  on('session.end', async ($, e, next) => {
    await update($, history, () => EMPTY).catch(() => undefined)
    return next(e)
  })
}
