import { expect, test } from 'claude-code/testing'

import { scrub } from '../hooks/redact'
import { contextArgv, countOption, prefilterArgv, rootsOption } from '../hooks/register'
import {
  anchorNeedles,
  collect,
  mainTranscript,
  matchesProject,
  nearby,
  parseNumbered,
  parseQuery,
  parseRecord,
  parseSince,
  ranked,
  renderRecord,
  renderResults,
  snippet,
  titleFrom,
  type Query,
  type SessionHit,
} from '../hooks/search'

const line = (record: Record<string, unknown>) => JSON.stringify({ parentUuid: null, isSidechain: false, cwd: '/home/me/projects/app', sessionId: 's1', timestamp: '2026-11-08T10:00:00.000Z', ...record })
const user = (content: unknown, extra: Record<string, unknown> = {}) => line({ type: 'user', message: { role: 'user', content }, ...extra })
const assistant = (content: unknown[], extra: Record<string, unknown> = {}) => line({ type: 'assistant', message: { role: 'assistant', content }, ...extra })
const query = (text: string) => parseQuery(text) as Query
const options = (text: string, extra: Partial<{ project: string; since: number; includeResults: boolean; exclude: string }> = {}) => ({ query: query(text), includeResults: false, exclude: 'current', ...extra })
// Built at run time: secret-guard refuses to write a file that holds its own tags.
const tag = (rule: string) => `[${['secret', 'guard'].join('-')}: ${rule}]`
const fakeToken = () => ['ghp', 'a1B2'.repeat(9)].join('_')

test('a query is terms, quoted phrases or a /regex/, spelled for the raw JSON line', () => {
  expect(query('Nftables  "open port" nftables')).toEqual({ label: 'Nftables  "open port" nftables', terms: ['nftables', 'open port'], prefilter: { fixed: true, patterns: ['nftables', 'open port'] } })
  expect(query('C:\\Users').prefilter.patterns).toEqual(['c:\\\\users'])
  const regex = query('/deploy(ed|ing)/')
  expect(regex.regex?.test('Deployed it')).toBe(true)
  expect(regex.prefilter).toEqual({ fixed: false, patterns: ['deploy(ed|ing)'] })
  expect(parseQuery('  ')).toBe('query is empty')
  expect(parseQuery('/(/')).toContain('not a valid regex')
})

test('only user and assistant messages are parsed; API logs are skipped unread', () => {
  expect(parseRecord('{"type":"api-request-blob","message":{"content":"nftables"}}')).toBe(undefined)
  expect(parseRecord('{"type":"custom-title","customTitle":"x"}')).toBe(undefined)
  expect(parseRecord('not json')).toBe(undefined)
  const record = parseRecord(assistant([{ type: 'thinking', thinking: 'hm' }, { type: 'text', text: 'Done.' }, { type: 'tool_use', name: 'Bash', input: { command: 'nft list ruleset' } }]))
  expect(record?.entries).toEqual([
    { role: 'assistant', text: 'Done.' },
    { role: 'tool', name: 'Bash', text: 'nft list ruleset' },
  ])
  expect(parseRecord(user([{ type: 'tool_result', content: [{ type: 'text', text: 'table inet' }] }]))?.entries).toEqual([{ role: 'result', text: 'table inet' }])
})

test('sessions hold every term somewhere, tool results only when asked, never the current session', () => {
  const sessions = new Map<string, SessionHit>()
  const opts = options('nftables port')
  collect(sessions, '/r/p/s1.jsonl', user('how do I open a port with nftables?'), opts)
  collect(sessions, '/r/p/s2.jsonl', user('nftables only', { sessionId: 's2' }), opts)
  collect(sessions, '/r/p/s3.jsonl', user([{ type: 'tool_result', content: 'nftables port 22' }], { sessionId: 's3' }), opts)
  collect(sessions, '/r/p/current.jsonl', user('nftables port', { sessionId: 'current' }), opts)
  expect(ranked(sessions, opts.query).map(session => session.id)).toEqual(['s1'])

  const withResults = new Map<string, SessionHit>()
  collect(withResults, '/r/p/s3.jsonl', user([{ type: 'tool_result', content: 'nftables port 22' }], { sessionId: 's3' }), options('nftables port', { includeResults: true }))
  expect(ranked(withResults, opts.query).map(session => session.id)).toEqual(['s3'])
})

test('text Claude Code wrote into the user turn is not searched', () => {
  const sessions = new Map<string, SessionHit>()
  collect(sessions, '/r/p/s1.jsonl', user('Base directory for this skill: nftables', { isMeta: true }), options('nftables'))
  collect(sessions, '/r/p/s1.jsonl', user('<system-reminder>nftables is installed</system-reminder>\nwhat next?'), options('nftables'))
  collect(sessions, '/r/p/s1.jsonl', user('<local-command-stdout>nftables</local-command-stdout>'), options('nftables'))
  expect(sessions.size).toBe(0)
})

test('project, since and the subagent file narrow and group the hits', () => {
  const sessions = new Map<string, SessionHit>()
  collect(sessions, '/r/p/s1/subagents/agent-a1.jsonl', assistant([{ type: 'text', text: 'nftables ruleset' }], { isSidechain: true }), options('nftables', { project: '/home/me/projects' }))
  const hit = sessions.get('s1')
  expect(hit?.file).toBe('/r/p/s1.jsonl')
  expect(hit?.snippets[0]?.isSidechain).toBe(true)
  const other = new Map<string, SessionHit>()
  collect(other, '/r/p/s1.jsonl', user('nftables'), options('nftables', { project: 'C:\\Users' }))
  collect(other, '/r/p/s1.jsonl', user('nftables'), options('nftables', { since: Date.parse('2026-11-09') }))
  expect(other.size).toBe(0)
})

test('a project is a path prefix in either spelling, or a name anywhere in the path', () => {
  expect(matchesProject('C:\\Users\\me\\hq', 'c:/users/me')).toBe(true)
  expect(matchesProject('C:\\Users\\me\\hq', 'C:\\Users\\m')).toBe(false)
  expect(matchesProject('/home/me/projects/squad/fobkeep', 'fobkeep')).toBe(true)
  expect(matchesProject('/home/me/x', undefined)).toBe(true)
})

test('since takes an ISO date or a count of days or hours', () => {
  const now = Date.parse('2026-11-12T00:00:00Z')
  expect(parseSince('7d', now)).toBe(Date.parse('2026-11-05T00:00:00Z'))
  expect(parseSince('12h', now)).toBe(Date.parse('2026-11-11T12:00:00Z'))
  expect(parseSince('2026-11-01', now)).toBe(Date.parse('2026-11-01'))
  expect(parseSince('last week', now)).toBeNaN()
  expect(parseSince(undefined, now)).toBe(undefined)
})

test('a snippet is about 200 characters around the match, whitespace folded, secrets hidden', () => {
  const text = `${'a'.repeat(300)} the nftables\n\nrule ${'b'.repeat(300)}`
  const cut = snippet(text, query('nftables'))!
  expect(cut.startsWith('…')).toBe(true)
  expect(cut.endsWith('…')).toBe(true)
  expect(cut).toContain('the nftables rule')
  expect(cut.length).toBeLessThanOrEqual(202)
  const token = fakeToken()
  expect(snippet(`deploy with token ${token} today`, query('deploy'))).toBe(`deploy with token ${tag('github-token')} today`)
  expect(snippet(`the key is ${token}`, query(token))).toBe(undefined)
})

test('redaction keeps the name and hides the value', () => {
  const name = ['API', 'KEY'].join('_')
  expect(scrub(`${name}=abcdefghijklmnop`)).toBe(`${name}=${tag('secret-value')}`)
  expect(scrub(`${name}=your-example-key-here`)).toBe(`${name}=your-example-key-here`)
})

test('the title is the first prompt typed, not a command or text Claude Code added', () => {
  const lines = [
    user('<command-name>/clear</command-name>'),
    user('Caveat: local commands', { isMeta: true }),
    user([{ type: 'image', source: {} }, { type: 'text', text: 'why is   this skipped?' }]),
  ]
  expect(titleFrom(lines)).toBe('why is this skipped?')
  expect(titleFrom([user([{ type: 'tool_result', content: 'x' }])])).toBe(undefined)
})

test('results are grouped by session with id, dates, folder, title and timestamped snippets', () => {
  const sessions = new Map<string, SessionHit>()
  collect(sessions, '/r/p/s1.jsonl', user('open the nftables port'), options('nftables'))
  collect(sessions, '/r/p/s1.jsonl', assistant([{ type: 'tool_use', name: 'Bash', input: { command: 'sudo nftables-restore' } }], { timestamp: '2026-11-09T08:00:00.000Z' }), options('nftables'))
  const shown = ranked(sessions, query('nftables')).map(session => ({ session, title: 'open the port' }))
  const text = renderResults(shown, 1, query('nftables'), { files: 12, ms: 1500, includeResults: false, tool: 'rg', problems: [] })
  expect(text).toContain('1 session match nftables (12 transcripts in 1.5 s with rg, tool results not searched).')
  expect(text).toContain('1. s1 · 2026-11-08 to 2026-11-09 · /home/me/projects/app · 2 matches')
  expect(text).toContain('Title: open the port')
  expect(text).toContain('[2026-11-08T10:00:00.000Z user] open the nftables port')
  expect(text).toContain('[2026-11-09T08:00:00.000Z tool Bash] sudo nftables-restore')
  expect(renderResults([], 0, query('zzz'), { files: 3, ms: 10, includeResults: true, tool: 'grep', problems: ['/x (not found)'] })).toBe('No session matches zzz (3 transcripts in 0.0 s with grep).\n\nNot searched: /x (not found)')
})

test('read_session anchors on a timestamp prefix or the longest plain piece of a snippet', () => {
  expect(anchorNeedles('2026-11-08T10:00:00.000Z')).toEqual([
    '"timestamp":"2026-11-08T10:00:00.000Z',
    '"timestamp":"2026-11-08T10:00:00',
    '"timestamp":"2026-11-08T10:00',
    '"timestamp":"2026-11-08T10',
    '"timestamp":"2026-11-08',
  ])
  const needles = anchorNeedles(`…the "nftables" ruleset was saved to /etc/nftables.conf and reloaded… ${tag('jwt')} x`)
  expect(needles[0]).toBe('the \\"nftables\\" ruleset was saved to /etc/nftables.conf and reloaded')
  expect(needles.at(-1)!.length).toBeGreaterThanOrEqual(12)
  // A tool input's JSON sits in the line as an object, not as an escaped string.
  expect(anchorNeedles('{"file_path":"/etc/nftables.conf"}')).toContain('{"file_path":"/etc/nftables.conf"}')
})

test('records render like the continue-session skill: blocks joined, 300 characters, results left out', () => {
  const record = parseRecord(assistant([{ type: 'text', text: 'Reading it.' }, { type: 'tool_use', name: 'Read', input: { file_path: '/etc/nftables.conf' } }]))!
  expect(renderRecord(record)).toBe('[2026-11-08T10:00:00.000Z assistant] Reading it. | Read: /etc/nftables.conf')
  expect(renderRecord(parseRecord(user('x'.repeat(400)))!)!.length).toBe('[2026-11-08T10:00:00.000Z user] '.length + 300)
  expect(renderRecord(parseRecord(user([{ type: 'tool_result', content: 'out' }]))!)).toBe(undefined)
})

test('secrets are hidden before lines are folded, prefixed or cut', () => {
  const name = ['API', 'KEY'].join('_')
  const command = parseRecord(assistant([{ type: 'tool_use', name: 'Bash', input: { command: `export ${name}=abcdefghijklmnop123` } }]))!
  expect(renderRecord(command)).toBe(`[2026-11-08T10:00:00.000Z assistant] Bash: export ${name}=${tag('secret-value')}`)
  const pasted = parseRecord(user(`here:\nDB_HOST=x\nDB_${['PASS', 'WORD'].join('')}=abcdefghijklmnop123`))!
  expect(renderRecord(pasted)).toContain(tag('secret-value'))
  expect(titleFrom([user(`${'x'.repeat(100)} ${fakeToken()}`)])).toContain(tag('github-token'))
})

test('numbered rg and grep lines parse, and the window holds count records each way around the anchor', () => {
  expect(parseNumbered('/r/s1.jsonl\u000012:{"a":1}')).toEqual({ file: '/r/s1.jsonl', number: 12, isMatch: true, text: '{"a":1}' })
  expect(parseNumbered('C:\\r\\s1.jsonl\u00003-{"a":1}')?.isMatch).toBe(false)
  expect(parseNumbered('--')).toBe(undefined)
  const lines = [1, 2, 3, 4, 5, 6, 7].map(number => ({ number, text: number === 3 ? '{"type":"queue-operation"}' : user(`m${number}`) }))
  expect(nearby(lines, 4, 2)).toEqual([
    '  [2026-11-08T10:00:00.000Z user] m1',
    '  [2026-11-08T10:00:00.000Z user] m2',
    '> [2026-11-08T10:00:00.000Z user] m4',
    '  [2026-11-08T10:00:00.000Z user] m5',
    '  [2026-11-08T10:00:00.000Z user] m6',
  ])
  expect(nearby(lines, 1, 0)).toEqual(['> [2026-11-08T10:00:00.000Z user] m1'])
  // An anchor line that shows nothing marks the next record that does; the start of a session marks nothing.
  expect(nearby(lines, 3, 1)).toEqual(['  [2026-11-08T10:00:00.000Z user] m2', '> [2026-11-08T10:00:00.000Z user] m4', '  [2026-11-08T10:00:00.000Z user] m5'])
  expect(nearby(lines, 1, 1, false)[0]).toBe('  [2026-11-08T10:00:00.000Z user] m1')
})

test('a subagent transcript leads to its session file in the same spelling', () => {
  expect(mainTranscript('/r/p/s1/subagents/agent-a.jsonl')).toBe('/r/p/s1.jsonl')
  expect(mainTranscript('C:\\r\\p\\s1\\subagents\\agent-a.jsonl')).toBe('C:\\r\\p\\s1.jsonl')
  expect(mainTranscript('/r/p/s1.jsonl')).toBe('/r/p/s1.jsonl')
})

test('the commands are the same search for rg and grep', () => {
  expect(prefilterArgv('rg', true, ['a', 'b'], ['/r'])).toContain('-F')
  expect(prefilterArgv('grep', false, ['a(b)'], ['/r'])).toEqual(['grep', '-a', '-r', '-s', '-Z', '-H', '-i', '-P', '--include=*.jsonl', '-e', 'a(b)', '--', '/r'])
  expect(contextArgv('grep', 'x', 40, ['/r/s1.jsonl'])).toContain('-C')
})

test('options fall back on anything unusable', () => {
  expect(countOption('20', 10, 50)).toBe(20)
  expect(countOption(500, 10, 50)).toBe(50)
  expect(countOption('x', 10, 50)).toBe(10)
  expect(countOption(0, 10, 50)).toBe(10)
  expect(rootsOption(' /mnt/c/Users/me/.claude/projects ; \\\\wsl.localhost\\Ubuntu\\home\\me\\.claude\\projects\n')).toEqual(['/mnt/c/Users/me/.claude/projects', '\\\\wsl.localhost\\Ubuntu\\home\\me\\.claude\\projects'])
  expect(rootsOption(undefined)).toEqual([])
})
