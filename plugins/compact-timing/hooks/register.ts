import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

export type Mark = { state: 'busy' | 'boundary'; focus: string }

// The last mark the model set in this session. Values are held per session, so sessions do not see
// each other's marks.
const mark = atom({ plugin: 'compact-timing', key: 'mark' } as const, null as Mark | null)

/** The tool input as the model sends it, or null when the state is not one of the two. */
export const parseMark = (input: { state?: unknown; focus?: unknown }): Mark | null => {
  const state = typeof input.state === 'string' ? input.state.trim().toLowerCase() : ''
  if (state !== 'busy' && state !== 'boundary') return null
  return { state, focus: typeof input.focus === 'string' ? input.focus.trim() : '' }
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

/** The tool description: what the model reads about the marks. */
export const ruleText = (limits: Limits) =>
  [
    'Sets the compaction mark for this conversation. The compact-timing plugin compacts at task boundaries instead of at a fixed token count.',
    `- \`boundary\`: call after a task or milestone whose state is saved outside the conversation (committed, or in a plan or notes file). The plugin compacts at the end of that turn when the context contains ${thousands(limits.boundaryTokens)} tokens or more.`,
    '- `busy`: call before a step whose details exist only in the conversation, such as a debugging sequence or reading test output. The plugin does not compact while the mark is `busy`. Call with `boundary` when the step is done.',
    '- `focus`: what the summary must keep: the next step, open decisions, file paths.',
    `Without a mark the plugin compacts at ${thousands(limits.softTokens)} tokens. Any compaction clears the mark.`,
  ].join('\n')

const markSchema = {
  type: 'object',
  properties: {
    state: { type: 'string', enum: ['boundary', 'busy'] },
    focus: { type: 'string', description: 'What the summary must keep: the next step, open decisions, file paths.' },
  },
  required: ['state'],
}

/** A `git commit`, also with `-C <dir>` or `-c <key=value>` before the subcommand. */
export const isCommit = (command: string) => /\bgit\s+(?:-[Cc]\s+\S+\s+)*commit\b/.test(command)

/**
 * Read right after a commit's result. The tool description alone is often missed, so the reminder
 * comes at the moment a boundary is most likely.
 */
export const commitReminder = (toolName: string) =>
  [
    `compact-timing: this commit saved work outside the conversation. If a task or milestone is done, call ${toolName} with \`boundary\` and a focus: the next step and open decisions.`,
    'If the work continues and its details exist only in the conversation, call it with `busy` instead.',
  ].join(' ')

export const register: Register = (on, options) => {
  const limits: Limits = {
    boundaryTokens: Number(options.boundaryTokens ?? 200_000),
    softTokens: Number(options.softTokens ?? 300_000),
  }
  let markTool = 'mcp__compact-timing__mark'

  on('session.start', async ($, e, next) => {
    const registered = await $.tool.register({ name: 'mark', description: ruleText(limits), inputSchema: markSchema, isDeferred: false })
    markTool = registered.tool
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool === markTool) {
      if (e.agentId !== undefined) return { result: 'Only the main conversation sets the compaction mark.' }
      const parsed = parseMark(e as unknown as { state?: unknown; focus?: unknown })
      if (!parsed) return { result: 'The mark was not set: state must be `boundary` or `busy`.' }
      await update($, mark, () => parsed)
      return { result: `The mark is \`${parsed.state}\`.` }
    }
    const result = await next(e)
    if (e.tool !== 'Bash' || e.agentId !== undefined || result.deny !== undefined || result.isError) return result
    const { command } = e as unknown as { command: string }
    if (!isCommit(command)) return result
    return { ...result, context: [...(result.context ?? []), commitReminder(markTool)] }
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
