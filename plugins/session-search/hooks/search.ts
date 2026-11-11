// The parts of session-search that need no engine: the query, the transcript records, snippets, grouping and the text
// the model reads. register.ts streams the lines in through ripgrep or grep.
import { scrub } from './redact'

export type Query = {
  /** The query as shown back to the model. */
  label: string
  /** Lowercased terms; every one must occur somewhere in a session. Empty for a regex. */
  terms: string[]
  regex?: RegExp
  /** What the line prefilter looks for in the raw JSON line: any of `patterns`, literal when `fixed`. */
  prefilter: { fixed: boolean; patterns: string[] }
}

/** The term as it is spelled inside a JSON string, so the prefilter finds `"quoted"` or `C:\path` in the raw line. */
export const jsonEscape = (text: string) => JSON.stringify(text).slice(1, -1)

/** Terms (a "quoted phrase" is one term), or `/regex/`. Returns an error text when the query is unusable. */
export const parseQuery = (raw: unknown): Query | string => {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (!text) return 'query is empty'
  const slashed = /^\/(.+)\/$/s.exec(text)
  if (slashed?.[1]) {
    try {
      return { label: text, terms: [], regex: new RegExp(slashed[1], 'i'), prefilter: { fixed: false, patterns: [slashed[1]] } }
    } catch (error) {
      return `not a valid regex: ${error instanceof Error ? error.message : String(error)}`
    }
  }
  const terms = [...new Set([...text.matchAll(/"([^"]+)"|(\S+)/g)].map(match => (match[1] ?? match[2] ?? '').toLowerCase()).filter(Boolean))]
  if (!terms.length) return 'query is empty'
  return { label: text, terms, prefilter: { fixed: true, patterns: terms.map(jsonEscape) } }
}

export type Entry = {
  /** `user` and `assistant` text, a `tool` call's input, a tool `result`. */
  role: 'user' | 'assistant' | 'tool' | 'result'
  /** The tool's name, for `tool`. */
  name?: string
  text: string
}

export type TranscriptRecord = {
  sessionId: string
  timestamp: string
  cwd: string
  /** A subagent's record, from `<session>/subagents/*.jsonl`. */
  isSidechain: boolean
  /** A record Claude Code wrote itself into the user's turn (skill text, image notes, compaction summaries). */
  isMeta: boolean
  entries: Entry[]
}

type Block = { type?: unknown; text?: unknown; name?: unknown; input?: unknown; content?: unknown }

const resultText = (content: unknown): string => {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map(block => (typeof (block as Block)?.text === 'string' ? (block as Block).text : '')).filter(Boolean).join('\n')
}

/** The searchable text of a tool input: the command when there is one, else the input as JSON. */
export const toolInputText = (input: unknown): string => {
  if (input && typeof input === 'object' && typeof (input as { command?: unknown }).command === 'string') return (input as { command: string }).command
  return JSON.stringify(input ?? {})
}

/** One line of a transcript, or undefined when it is not a user or assistant message (titles, API logs, attachments). */
export const parseRecord = (line: string): TranscriptRecord | undefined => {
  // Most lines are other record types, and API logs repeat whole requests: skip those before parsing.
  if (line.startsWith('{"type":"') && !/^\{"type":"(?:user|assistant)"/.test(line)) return undefined
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(line)
  } catch {
    return undefined
  }
  const type = parsed.type
  if (type !== 'user' && type !== 'assistant') return undefined
  const message = parsed.message as { content?: unknown } | undefined
  const content = message?.content
  const isMeta = parsed.isMeta === true || parsed.isCompactSummary === true
  const entries: Entry[] = []
  const blocks: Block[] = typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : []
  for (const block of blocks) {
    if (block?.type === 'text' && typeof block.text === 'string') entries.push({ role: type, text: block.text })
    else if (block?.type === 'tool_use') entries.push({ role: 'tool', name: typeof block.name === 'string' ? block.name : 'tool', text: toolInputText(block.input) })
    else if (block?.type === 'tool_result') entries.push({ role: 'result', text: resultText(block.content) })
  }
  return {
    sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : '',
    timestamp: typeof parsed.timestamp === 'string' ? parsed.timestamp : '',
    cwd: typeof parsed.cwd === 'string' ? parsed.cwd : '',
    isSidechain: parsed.isSidechain === true,
    isMeta,
    entries,
  }
}

/** Text Claude Code adds inside a user's turn: reminders and the output of local commands. */
const ADDED_TEXT = /<(system-reminder|local-command-stdout|local-command-caveat)>[\s\S]*?<\/\1>/g

/**
 * The entries a search looks at: no text Claude Code wrote into the user's turn (meta records, and reminders and command
 * output inside a typed one), tool results only when asked.
 */
export const searchable = (record: TranscriptRecord, includeResults: boolean): Entry[] =>
  record.entries
    .filter(entry => (entry.role === 'result' ? includeResults : !(record.isMeta && entry.role === 'user')))
    .map(entry => (entry.role === 'user' && entry.text.includes('<') ? { ...entry, text: entry.text.replace(ADDED_TEXT, ' ') } : entry))
    .filter(entry => entry.text.trim())

/** Where the query occurs in the text: the position and length of each term found, or of the first regex match. */
export const findIn = (text: string, query: Query): { index: number; length: number; terms: number } | undefined => {
  if (query.regex) {
    const match = query.regex.exec(text)
    return match ? { index: match.index, length: match[0].length, terms: 1 } : undefined
  }
  const lower = text.toLowerCase()
  let first: { index: number; length: number } | undefined
  let count = 0
  for (const term of query.terms) {
    const index = lower.indexOf(term)
    if (index < 0) continue
    count++
    if (!first) first = { index, length: term.length }
  }
  return first ? { ...first, terms: count } : undefined
}

/** The terms of the query the text contains, for the every-term-in-the-session rule. */
export const termsIn = (text: string, query: Query): string[] => {
  if (query.regex) return query.regex.test(text) ? [query.label] : []
  const lower = text.toLowerCase()
  return query.terms.filter(term => lower.includes(term))
}

const flatten = (text: string) => text.replace(/\s+/g, ' ').trim()

/**
 * About `width` characters around the first match, secrets hidden. The whole text is scrubbed before it is cut, so a
 * key cut in half at the edge cannot slip past the rules. Undefined when the match was itself a secret.
 */
export const snippet = (text: string, query: Query, width = 200): string | undefined => {
  const clean = scrub(text)
  const found = findIn(clean, query)
  if (!found) return undefined
  const room = Math.max(0, width - found.length)
  let start = Math.max(0, found.index - Math.floor(room / 2))
  const end = Math.min(clean.length, start + Math.max(width, found.length))
  start = Math.max(0, Math.min(start, end - width))
  return `${start > 0 ? '…' : ''}${flatten(clean.slice(start, end))}${end < clean.length ? '…' : ''}`
}

/** Normalized for comparing paths from either OS: forward slashes, no trailing slash, lowercase. */
const normalPath = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

/** A path with a separator matches a cwd it is a prefix of; a bare name matches any cwd containing it. */
export const matchesProject = (cwd: string, project: string | undefined): boolean => {
  if (!project?.trim()) return true
  const wanted = normalPath(project.trim())
  const actual = normalPath(cwd)
  if (!/[\\/]/.test(project)) return actual.includes(wanted)
  return actual === wanted || actual.startsWith(`${wanted}/`)
}

/** `since` as epoch milliseconds: an ISO date or time, or `<n>d` / `<n>h` before now. Undefined when absent; NaN when unreadable. */
export const parseSince = (since: unknown, now: number): number | undefined => {
  if (typeof since !== 'string' || !since.trim()) return undefined
  const relative = /^(\d+)\s*([dh])$/i.exec(since.trim())
  if (relative) return now - Number(relative[1]) * (relative[2]?.toLowerCase() === 'd' ? 86_400_000 : 3_600_000)
  return Date.parse(since.trim())
}

export type Snip = { timestamp: string; role: Entry['role']; name?: string; isSidechain: boolean; text: string; score: number }

export type SessionHit = {
  id: string
  /** The transcript the first hit came from; a subagent's leads to its session's own file. */
  file: string
  cwd: string
  first: string
  last: string
  hits: number
  terms: Set<string>
  snippets: Snip[]
}

export type SearchOptions = { query: Query; project?: string; since?: number; includeResults: boolean; exclude: string }

/** The session's own transcript for a subagent's file: `<dir>/<session>/subagents/agent-x.jsonl` → `<dir>/<session>.jsonl`. */
export const mainTranscript = (file: string): string => {
  const match = /^(.*)[\\/]([^\\/]+)[\\/]subagents[\\/][^\\/]+$/.exec(file)
  return match ? `${match[1]}${file.includes('\\') && !file.includes('/') ? '\\' : '/'}${match[2]}.jsonl` : file
}

const MAX_SNIPPETS = 3

/** Adds one prefiltered line to the sessions found so far. */
export const collect = (sessions: Map<string, SessionHit>, file: string, line: string, options: SearchOptions): void => {
  const record = parseRecord(line)
  if (!record) return
  const id = record.sessionId || file.replace(/^.*[\\/]/, '').replace(/\.jsonl$/, '')
  if (id === options.exclude) return
  if (!matchesProject(record.cwd, options.project)) return
  if (options.since !== undefined && !(Date.parse(record.timestamp) >= options.since)) return
  for (const entry of searchable(record, options.includeResults)) {
    const found = termsIn(entry.text, options.query)
    if (!found.length) continue
    let session = sessions.get(id)
    if (!session) {
      session = { id, file: mainTranscript(file), cwd: record.cwd, first: record.timestamp, last: record.timestamp, hits: 0, terms: new Set(), snippets: [] }
      sessions.set(id, session)
    }
    session.hits++
    for (const term of found) session.terms.add(term)
    if (record.timestamp && (!session.first || record.timestamp < session.first)) session.first = record.timestamp
    if (record.timestamp > session.last) session.last = record.timestamp
    if (!record.isSidechain && session.cwd !== record.cwd && record.cwd) session.cwd = record.cwd
    // Keep the snippets that show the most terms, the earliest first among equals.
    const weakest = session.snippets.reduce<number>((low, snip, index) => (low < 0 || snip.score < session.snippets[low]!.score ? index : low), -1)
    if (session.snippets.length < MAX_SNIPPETS || (weakest >= 0 && found.length > session.snippets[weakest]!.score)) {
      const text = snippet(entry.text, options.query)
      if (text === undefined) continue
      const snip: Snip = { timestamp: record.timestamp, role: entry.role, name: entry.name, isSidechain: record.isSidechain, text, score: found.length }
      if (session.snippets.length < MAX_SNIPPETS) session.snippets.push(snip)
      else session.snippets[weakest] = snip
    }
  }
}

/** The sessions that hold every term, newest activity first. */
export const ranked = (sessions: Map<string, SessionHit>, query: Query): SessionHit[] => {
  const needed = query.regex ? 1 : query.terms.length
  return [...sessions.values()].filter(session => session.terms.size >= needed).sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : b.hits - a.hits))
}

/** The first prompt the user typed, from the head of a transcript: no command output, no text Claude Code wrote. */
export const titleFrom = (lines: Iterable<string>): string | undefined => {
  for (const line of lines) {
    const record = parseRecord(line)
    if (!record || record.isMeta || record.isSidechain) continue
    const text = record.entries.find(entry => entry.role === 'user')?.text
    if (!text) continue
    // Scrubbed before it is flattened and cut: the .env rule needs its line starts, and a cut key is too short to match.
    const flat = flatten(scrub(text.replace(/<(command-message|command-args|local-command-stdout|local-command-caveat|system-reminder)>[\s\S]*?<\/\1>/g, ' ')))
    if (!flat || /^<command-name>/.test(flat)) continue
    return flat
  }
  return undefined
}

const cut = (text: string, length: number) => (text.length > length ? `${text.slice(0, length - 1)}…` : text)

const label = (snip: Snip) => `${snip.isSidechain ? 'subagent ' : ''}${snip.role === 'tool' ? `tool ${snip.name}` : snip.role}`

export type Rendered = { session: SessionHit; title?: string }

/** The tool's answer: one block per session, its id, dates, folder, title and snippets. */
export const renderResults = (
  shown: Rendered[],
  total: number,
  query: Query,
  stats: { files: number; ms: number; includeResults: boolean; tool: string; problems: string[] },
): string => {
  const scope = `${stats.files} transcripts in ${(stats.ms / 1000).toFixed(1)} s with ${stats.tool}${stats.includeResults ? '' : ', tool results not searched'}`
  const head = total
    ? `${total} session${total === 1 ? '' : 's'} match ${query.label} (${scope})${total > shown.length ? `; the ${shown.length} with the newest matches shown` : ''}.`
    : `No session matches ${query.label} (${scope}).`
  const blocks = shown.map(({ session, title }, index) => {
    const dates = session.first.slice(0, 10) === session.last.slice(0, 10) ? session.first.slice(0, 10) : `${session.first.slice(0, 10)} to ${session.last.slice(0, 10)}`
    const lines = [`${index + 1}. ${session.id} · ${dates} · ${session.cwd || 'unknown folder'} · ${session.hits} match${session.hits === 1 ? '' : 'es'}`]
    if (title) lines.push(`   Title: ${cut(title, 120)}`)
    const snippets = [...session.snippets].sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1))
    for (const snip of snippets) lines.push(`   [${snip.timestamp} ${label(snip)}] ${snip.text}`)
    return lines.join('\n')
  })
  const tail = stats.problems.length ? [`Not searched: ${stats.problems.join('; ')}`] : []
  const hint = shown.length ? ['Read around a match with read_session, passing the id and a timestamp from a snippet.'] : []
  return [head, ...blocks, ...tail, ...hint].join('\n\n')
}

/** How read_session finds its place: a timestamp's prefixes from exact to the day, or a snippet's text, longest first. */
export const anchorNeedles = (around: string): string[] => {
  const text = around.trim()
  if (/^\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+Z?)?$/.test(text)) {
    const iso = text.replace(' ', 'T')
    return [...new Set([iso, iso.slice(0, 19), iso.slice(0, 16), iso.slice(0, 13), iso.slice(0, 10)])].filter(prefix => prefix.length >= 10).map(prefix => `"timestamp":"${prefix}`)
  }
  // A snippet from search_sessions: its ellipses, folded spaces and redaction tags are not in the file, so use the longest
  // plain piece, then shorter heads of it. Each as a JSON string holds it, and as it is when it was a tool input's JSON.
  const pieces = text.split(/…|\[secret-guard: [\w-]+\]/).map(piece => piece.trim()).sort((a, b) => b.length - a.length)
  const longest = pieces[0] ?? ''
  const heads: string[] = []
  for (let length = Math.min(longest.length, 80); length >= 12; length = Math.floor(length / 2)) heads.push(longest.slice(0, length).trim())
  if (!heads.length && longest) heads.push(longest)
  return [...new Set(heads.flatMap(head => [jsonEscape(head), head]))]
}

/** One record as read_session shows it, the way the continue-session skill does: its blocks joined, capped at `cap`. */
export const renderRecord = (record: TranscriptRecord, cap = 300): string | undefined => {
  if (record.isMeta) return undefined
  const parts = record.entries
    .filter(entry => entry.role !== 'result')
    // Each part scrubbed as written, before the tool name goes in front and its lines are folded: the .env rule needs its
    // line starts.
    .map(entry => (entry.role === 'tool' ? `${entry.name}: ${flatten(scrub(toolSummary(entry.text)))}` : flatten(scrub(entry.text))))
    .filter(part => part && !part.endsWith(': '))
  if (!parts.length) return undefined
  const role = record.entries.some(entry => entry.role === 'user') ? 'user' : 'assistant'
  return `[${record.timestamp}${record.isSidechain ? ' subagent' : ''} ${role}] ${cut(parts.join(' | '), cap)}`
}

/** A raw transcript line as read_session shows it, or undefined when it shows nothing. */
export const renderLine = (line: string): string | undefined => {
  const record = parseRecord(line)
  return record ? renderRecord(record) : undefined
}

/** A tool input for display: the command, path or pattern it names, else its JSON. */
const toolSummary = (text: string): string => {
  if (!text.startsWith('{')) return text
  try {
    const input = JSON.parse(text) as Record<string, unknown>
    for (const key of ['file_path', 'path', 'pattern', 'query', 'url', 'description', 'prompt']) if (typeof input[key] === 'string') return input[key] as string
  } catch {
    // Not JSON after all: shown as it is.
  }
  return text
}

/** Lines with their numbers, from `rg`/`grep -n --null` output: `path\0N:line` for a match, `path\0N-line` for context. */
export const parseNumbered = (raw: string): { file: string; number: number; isMatch: boolean; text: string } | undefined => {
  const nul = raw.indexOf('\0')
  if (nul < 0) return undefined
  const match = /^(\d+)([:-])/.exec(raw.slice(nul + 1, nul + 13))
  if (!match?.[1]) return undefined
  return { file: raw.slice(0, nul), number: Number(match[1]), isMatch: match[2] === ':', text: raw.slice(nul + 1 + match[0].length) }
}

/**
 * The ±`count` shown records nearest the anchor line, from numbered lines of one file, in file order. With `mark`, the
 * anchor's record is marked with `>`, or the first shown record after it when the anchor line itself shows nothing (an
 * API log or attachment with the same timestamp).
 */
export const nearby = (lines: { number: number; text: string }[], anchor: number, count: number, mark = true): string[] => {
  const shown = lines
    .map(line => ({ number: line.number, text: renderLine(line.text) }))
    .filter((line): line is { number: number; text: string } => line.text !== undefined)
    .sort((a, b) => a.number - b.number)
  const before = count > 0 ? shown.filter(line => line.number < anchor).slice(-count) : []
  const after = shown.filter(line => line.number >= anchor).slice(0, count + 1)
  const marked = mark ? after[0]?.number : undefined
  return [...before, ...after].map(line => `${line.number === marked ? '>' : ' '} ${line.text}`)
}
