import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

export type Mark = { state: 'busy' | 'boundary'; focus: string }

// The last mark the model wrote in this session. The file is only the carrier: the mark is taken from
// the Write call, so two sessions sharing the file do not read each other's marks.
const mark = atom({ plugin: 'compact-timing', key: 'mark' } as const, null as Mark | null)

/** The first line is the state, the rest is what the summary should keep. */
export const parseMark = (content: string): Mark | null => {
  const [first = '', ...rest] = content.split('\n')
  const state = first.trim().toLowerCase()
  if (state !== 'busy' && state !== 'boundary') return null
  return { state, focus: rest.join('\n').trim() }
}

export type Limits = { boundaryTokens: number; softTokens: number }

/**
 * Whether to compact at the end of a turn. A boundary allows it from `boundaryTokens`, no mark from
 * `softTokens`, and a busy mark never: autoCompactWindow stays the hard limit for a stale busy mark.
 */
export const shouldCompact = (current: Mark | null, tokens: number | undefined, limits: Limits): boolean => {
  if (tokens === undefined || current?.state === 'busy') return false
  return tokens >= (current?.state === 'boundary' ? limits.boundaryTokens : limits.softTokens)
}

const thousands = (tokens: number) => `${Math.round(tokens / 1000)}k`

/** What the model is told about the marks, next to its instruction files. */
export const ruleText = (path: string, limits: Limits) =>
  [
    'The compact-timing plugin compacts this conversation at task boundaries instead of at a fixed token count.',
    `Write the state to ${path} with the Write tool. The plugin does not see writes made through a shell.`,
    'The first line is `boundary` or `busy`. The lines after it say what the summary must keep: the next step, open decisions, file paths.',
    `- Write \`boundary\` after a task or milestone whose state is saved outside the conversation (committed, or in a plan or notes file). The plugin compacts at the end of that turn when the context contains ${thousands(limits.boundaryTokens)} tokens or more.`,
    '- Write `busy` before a step whose details exist only in the conversation, such as a debugging sequence or reading test output. The plugin does not compact while the mark is `busy`. Write `boundary` when the step is done.',
    `- Without a mark the plugin compacts at ${thousands(limits.softTokens)} tokens. Any compaction clears the mark.`,
  ].join('\n')

export const register: Register = (on, options) => {
  const limits: Limits = {
    boundaryTokens: Number(options.boundaryTokens ?? 200_000),
    softTokens: Number(options.softTokens ?? 300_000),
  }
  const stateFile = String(options.stateFile ?? '.cache/compact-timing/mark.md')

  // Core re-reads the context blocks after each compaction, so the rule stays after each compaction.
  on('prompt.context', async ($, e, next) => {
    const result = await next(e)
    const home = await $.env.get('HOME').catch(() => undefined)
    if (!home) return result
    return { ...result, blocks: [...result.blocks, { name: 'compactTiming', text: ruleText(`${home}/${stateFile}`, limits) }] }
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    if (e.tool !== 'Write' || e.agentId !== undefined || result.deny !== undefined || result.isError) return result
    const { file_path: path, content } = e as unknown as { file_path: string; content: string }
    // Reading the mark must never fail the Write itself.
    await $.env
      .get('HOME')
      .then(home => (path === `${home}/${stateFile}` ? update($, mark, () => parseMark(content)) : undefined))
      .catch(() => undefined)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined || e.isAborted) return result
    try {
      const current = await read($, mark)
      const { context } = await $.session.usage()
      if (!shouldCompact(current, context.tokens, limits)) return result
      const outcome = await $.session.compact(current?.focus ? { instructions: current.focus } : {})
      if ('skip' in outcome && outcome.skip !== undefined) $.ui.toast(`compact-timing: compaction skipped (${outcome.skip})`)
    } catch (error) {
      $.ui.toast(`compact-timing: compaction failed (${error instanceof Error ? error.message : String(error)})`)
    }
    return result
  })

  // Any compaction, also the automatic one at the hard limit, starts the next period without a mark.
  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined && result.skip === undefined) await update($, mark, () => null).catch(() => undefined)
    return result
  })
}
