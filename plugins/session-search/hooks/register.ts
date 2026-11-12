import type { EngineInterface, Register } from 'claude-code'
import {
  anchorNeedles,
  collect,
  parseNumbered,
  parseQuery,
  parseSince,
  nearby,
  ranked,
  renderLine,
  renderResults,
  sessionIdFromPath,
  titleFrom,
  type Rendered,
  type SessionHit,
} from './search'

// Kept short: with `loadTools` on, both descriptions and schemas go with every request.
export const SEARCH_DESCRIPTION =
  'Searches past Claude Code sessions on this machine (not this one) by their transcripts. Query: words that must all occur in a session, a "quoted phrase", or /regex/. Lists matching sessions, newest first, with id, dates, folder, first prompt and snippets.'
export const READ_DESCRIPTION = 'Shows the messages of a past session around a timestamp or snippet that search_sessions returned, 300 characters each.'

const searchSchema = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    project: { type: 'string', description: 'Folder the session ran in: a path prefix, or a name any part of the path contains' },
    since: { type: 'string', description: 'ISO date, or 7d / 12h' },
    limit: { type: 'number', description: 'Sessions shown, default 10' },
    includeResults: { type: 'boolean', description: 'Also search tool results (slower, noisier)' },
  },
  required: ['query'],
}

const readSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Session id' },
    around: { type: 'string', description: 'Timestamp or snippet text; absent, the start' },
    count: { type: 'number', description: 'Messages before and after, default 5' },
  },
  required: ['id'],
}

/** A whole number from the settings or the call within [1, max], else the default. */
export const countOption = (value: unknown, fallback: number, max: number): number => {
  const parsed = Math.floor(Number(value))
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, max) : fallback
}

/** `extraRoots` from the settings: folders separated by `;` or new lines. */
export const rootsOption = (value: unknown): string[] =>
  typeof value === 'string' ? value.split(/[;\n]/).map(root => root.trim()).filter(Boolean) : []

type Searcher = 'rg' | 'grep'

/**
 * The prefilter's command line: every line of every transcript holding any pattern, as `path\0line`. `-a` everywhere:
 * some transcripts hold bytes that make grep call them binary and print only "binary file matches".
 */
export const prefilterArgv = (searcher: Searcher, fixed: boolean, patterns: string[], roots: string[]): string[] => {
  const each = patterns.flatMap(pattern => ['-e', pattern])
  return searcher === 'rg'
    ? // A regex: `--engine auto` switches to PCRE2 for lookaround and backreferences, as grep -P takes them.
      ['rg', '--no-config', '-a', '--no-ignore', '--hidden', '--no-messages', '--stats', '--null', '--with-filename', '--no-line-number', '--no-heading', '--color', 'never', '-i', ...(fixed ? ['-F'] : ['--engine', 'auto']), '-g', '*.jsonl', ...each, '--', ...roots]
    : ['grep', '-a', '-r', '-s', '-Z', '-H', '-i', fixed ? '-F' : '-P', '--include=*.jsonl', ...each, '--', ...roots]
}

/** Numbered lines around the first line of each file holding the needle, as `path\0N:line` (match) or `path\0N-line`. */
export const contextArgv = (searcher: Searcher, needle: string, lines: number, paths: string[]): string[] =>
  searcher === 'rg'
    ? ['rg', '--no-config', '-a', '--no-ignore', '--hidden', '--no-messages', '--null', '--with-filename', '-n', '--color', 'never', '-i', '-F', '-m', '1', '-C', String(lines), '-g', '*.jsonl', '-e', needle, '--', ...paths]
    : ['grep', '-a', '-r', '-s', '-Z', '-H', '-n', '-i', '-F', '-m', '1', '-C', String(lines), '--include=*.jsonl', '-e', needle, '--', ...paths]

let detected: Promise<Searcher | undefined> | undefined

/** ripgrep when it runs, else grep: both read the multi-megabyte lines and the files over 4 MiB that `$.fs.read` cannot. */
const searcher = ($: EngineInterface) =>
  (detected ??= (async () => {
    for (const command of ['rg', 'grep'] as const) {
      const works = await $.process.run([command, '--version'], { timeoutMs: 5000 }).then(result => result.exitCode === 0, () => false)
      if (works) return command
    }
    return undefined
  })())

const requireSearcher = async ($: EngineInterface): Promise<Searcher> => {
  const tool = await searcher($)
  if (!tool) throw new Error('neither rg (ripgrep) nor grep runs here; install ripgrep')
  return tool
}

/**
 * Runs a command and hands its standard output over line by line. `onLine` returning false ends the loop, which kills
 * the child. Resolves the exit code (null when stopped early) and the start of standard error.
 */
const eachLine = async ($: EngineInterface, argv: string[], onLine: (line: string) => boolean | void) => {
  const stream = $.process.spawn({ argv })
  // Leaving the loop early rejects `result`; nothing waits on it then.
  stream.result.catch(() => undefined)
  let buffer = ''
  let stderr = ''
  let isStopped = false
  for await (const chunk of stream) {
    if (chunk.stream === 'stderr') {
      if (stderr.length < 2000) stderr += chunk.text
      continue
    }
    buffer += chunk.text
    let start = 0
    let newline: number
    while ((newline = buffer.indexOf('\n', start)) >= 0) {
      const line = buffer.slice(start, newline)
      start = newline + 1
      if (onLine(line.endsWith('\r') ? line.slice(0, -1) : line) === false) {
        isStopped = true
        break
      }
    }
    if (isStopped) break
    buffer = buffer.slice(start)
  }
  if (isStopped) return { code: null, stderr }
  if (buffer) onLine(buffer)
  const result = await stream.result.catch(() => undefined)
  return { code: result?.code ?? null, stderr }
}

const firstLine = (text: string) => text.trim().split('\n')[0]?.slice(0, 200) ?? ''

async function transcriptRoots($: EngineInterface, extraRoots: string[]) {
  // The order of Node's os.homedir(): USERPROFILE exists only on Windows, where HOME is usually unset.
  const home = (await $.env.get('USERPROFILE')) || (await $.env.get('HOME'))
  const configDir = (await $.env.get('CLAUDE_CONFIG_DIR')) || (home ? `${home}/.claude` : undefined)
  const roots = [...(configDir ? [`${configDir}/projects`] : []), ...extraRoots]
  const found: string[] = []
  const missing: string[] = []
  for (const root of roots) {
    // `$.fs` rejects a network path such as \\wsl.localhost\...; the search command reads it, so it stays in.
    const exists = await $.fs.exists(root).catch(() => true)
    ;(exists ? found : missing).push(root)
  }
  // With no root, rg and grep would search the working directory instead.
  if (!found.length) throw new Error(`no transcript folder found: ${missing.join(', ') || 'no home or CLAUDE_CONFIG_DIR'}`)
  return { roots: found, missing }
}

async function searchSessions($: EngineInterface, input: Record<string, unknown>, extraRoots: string[]): Promise<string> {
  const query = parseQuery(input.query)
  if (typeof query === 'string') throw new Error(query)
  const started = await $.clock.now()
  const since = parseSince(input.since, started)
  if (Number.isNaN(since)) throw new Error(`since "${String(input.since)}" is neither an ISO date nor 7d / 12h`)
  const limit = countOption(input.limit, 10, 50)
  const includeResults = input.includeResults === true
  const tool = await requireSearcher($)
  const [{ roots, missing }, exclude] = await Promise.all([transcriptRoots($, extraRoots), $.session.id()])
  const problems = missing.map(root => `${root} (not found)`)
  const options = { query, project: typeof input.project === 'string' ? input.project : undefined, since, includeResults, exclude }
  const sessions = new Map<string, SessionHit>()
  let files: number | undefined
  const outcome = await eachLine($, prefilterArgv(tool, query.prefilter.fixed, query.prefilter.patterns, roots), line => {
    const nul = line.indexOf('\0')
    if (nul < 0) {
      const searched = /^(\d+) files searched$/.exec(line)
      if (searched) files = Number(searched[1])
      return
    }
    collect(sessions, line.slice(0, nul), line.slice(nul + 1), options)
  })
  if (outcome.code === 2 && !sessions.size) {
    const reason = firstLine(outcome.stderr)
    if (!query.prefilter.fixed) throw new Error(`${tool} rejected the regex${reason ? `: ${reason}` : ''}`)
    if (reason) problems.push(reason)
  }
  const all = ranked(sessions, query)
  // Titles 8 at a time: up to 50 children at once over a network share would crowd it.
  const shown: Rendered[] = []
  for (let start = 0; start < Math.min(limit, all.length); start += 8) {
    const batch = all.slice(start, Math.min(start + 8, limit))
    shown.push(...(await Promise.all(batch.map(async session => ({ session, title: await title($, tool, session.file) })))))
  }
  const ms = (await $.clock.now()) - started
  return renderResults(shown, all.length, query, { files, ms, includeResults, tool, problems })
}

/** The session's first typed prompt, from the first user lines of its transcript. */
async function title($: EngineInterface, tool: Searcher, file: string): Promise<string | undefined> {
  const needle = '"type":"user"'
  const argv = tool === 'rg' ? ['rg', '--no-config', '-a', '--no-filename', '--no-line-number', '-F', '-m', '40', '-e', needle, '--', file] : ['grep', '-a', '-h', '-F', '-m', '40', '-e', needle, '--', file]
  let found: string | undefined
  await eachLine($, argv, line => {
    found = titleFrom([line])
    if (found) return false
  }).catch(() => undefined)
  return found
}

/** The transcript files whose name starts with the id, outside the subagents folders. */
async function locate($: EngineInterface, tool: Searcher, id: string, roots: string[]): Promise<string[]> {
  const files: string[] = []
  const argv =
    tool === 'rg'
      ? ['rg', '--no-config', '--no-ignore', '--hidden', '--no-messages', '--files', '-g', `${id}*.jsonl`, '--', ...roots]
      : ['grep', '-a', '-r', '-s', '-l', '-m', '1', `--include=${id}*.jsonl`, '-e', '', '--', ...roots]
  await eachLine($, argv, line => {
    if (line.trim() && !/[\\/]subagents[\\/]/.test(line)) files.push(line.trim())
  })
  return files
}

async function readSession($: EngineInterface, input: Record<string, unknown>, extraRoots: string[]): Promise<string> {
  const id = typeof input.id === 'string' ? input.id.trim() : ''
  if (!/^[0-9a-f][0-9a-f-]{7,35}$/i.test(id)) throw new Error('id must be a session id from search_sessions (at least its first 8 characters)')
  const count = countOption(input.count, 5, 20)
  const around = typeof input.around === 'string' ? input.around.trim() : ''
  const tool = await requireSearcher($)
  const { roots } = await transcriptRoots($, extraRoots)
  const files = await locate($, tool, id, roots)
  const names = [...new Set(files.map(sessionIdFromPath))]
  if (!files.length) throw new Error(`no transcript named ${id}*.jsonl under ${roots.join(', ')}`)
  if (names.length > 1) throw new Error(`the id matches ${names.length} sessions (${names.slice(0, 5).join(', ')}); give more of it`)
  const file = files[0]!
  const subagents = `${file.replace(/\.jsonl$/, '')}/subagents`
  const head = `Session ${names[0]} · ${file}`

  if (!around) {
    const lines: { number: number; text: string }[] = []
    let shown = 0
    const argv = tool === 'rg' ? ['rg', '--no-config', '-a', '--null', '--with-filename', '-n', '--color', 'never', '', '--', file] : ['grep', '-a', '-Z', '-H', '-n', '', '--', file]
    await eachLine($, argv, raw => {
      const line = parseNumbered(raw)
      if (!line) return
      lines.push(line)
      if (renderLine(line.text) !== undefined) shown++
      if (shown > count * 2) return false
    })
    return [`${head} · from the start`, ...nearby(lines, lines[0]?.number ?? 1, count * 2, false)].join('\n')
  }

  // Context lines include API logs and attachments, so read well past `count` records each way.
  const contextLines = Math.max(40, count * 10)
  const needles = anchorNeedles(around)
  for (const needle of needles) {
    const byFile = new Map<string, { number: number; text: string; isMatch: boolean }[]>()
    await eachLine($, contextArgv(tool, needle, contextLines, [file, subagents]), raw => {
      const line = parseNumbered(raw)
      if (!line) return
      const list = byFile.get(line.file) ?? []
      list.push(line)
      byFile.set(line.file, list)
    })
    if (!byFile.size) continue
    // The session's own transcript before a subagent's.
    const target = byFile.has(file) ? file : [...byFile.keys()][0]!
    const lines = byFile.get(target)!
    const anchor = lines.find(line => line.isMatch)?.number ?? lines[0]!.number
    const where = target === file ? '' : ` · in subagent transcript ${sessionIdFromPath(target)}`
    const shown = nearby(lines, anchor, count)
    if (!shown.length) continue
    // A timestamp found only by a shorter prefix lands on the first record of that minute, hour or day: say so.
    const prefix = needle.startsWith('"timestamp":"') && needle !== needles[0] ? needle.slice('"timestamp":"'.length) : undefined
    const place = prefix ? `${around} not found; the first record at ${prefix}` : `around ${around}`
    return [`${head} · ${place}${where}`, ...shown].join('\n')
  }
  throw new Error(`"${around}" is not in session ${names[0]}; pass a timestamp from a search_sessions snippet`)
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

export const register: Register = (on, options) => {
  const extraRoots = rootsOption(options.extraRoots)
  // A value set through `--values-stdin` can arrive as the text "true".
  const isLoaded = options.loadTools === true || options.loadTools === 'true'
  const loading = isLoaded ? { isDeferred: false } : {}
  let searchTool = 'mcp__session-search__search_sessions'
  let readTool = 'mcp__session-search__read_session'

  on('session.start', async ($, e, next) => {
    const [search, read] = await Promise.all([
      $.tool.register({ name: 'search_sessions', description: SEARCH_DESCRIPTION, inputSchema: searchSchema, ...loading }),
      $.tool.register({ name: 'read_session', description: READ_DESCRIPTION, inputSchema: readSchema, ...loading }),
    ])
    searchTool = search.tool
    readTool = read.tool
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool !== searchTool && e.tool !== readTool) return next(e)
    const input = e as unknown as Record<string, unknown>
    try {
      return { result: e.tool === searchTool ? await searchSessions($, input, extraRoots) : await readSession($, input, extraRoots) }
    } catch (error) {
      return { deny: `session-search: ${message(error)}` }
    }
  }).catch(($, e, next) => {
    // Past its 10 s budget of own code (parsing a very common word's matches), say so instead of letting the call fall through.
    if (e.tool !== searchTool && e.tool !== readTool) return next(e)
    return {
      deny:
        next.error.kind === 'timeout'
          ? 'session-search: the search took too long; add words, or narrow it with project or since'
          : `session-search: ${next.error.message ?? 'failed'}`,
    }
  })
}
