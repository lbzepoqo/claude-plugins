export type RunResult = { exitCode: number; stdout: string; stderr: string }
export type Git = (args: readonly string[]) => Promise<RunResult>

export type Finding = {
  name: string
  kind: 'plugin' | 'skill'
  // 'behind': `behind` commits (or a version change) are missing; 'unchecked': `reason` says why.
  status: 'current' | 'behind' | 'unchecked'
  behind: number
  commits: string[]
  action?: string
  reason?: string
  upstream?: string
}

export type Report = { checkedAt: number; findings: Finding[] }

type InstallEntry = { scope?: string; projectPath?: string; version?: string; gitCommitSha?: string }
type SourceObject = { source?: string; repo?: string; url?: string; ref?: string; sha?: string; path?: string }
type ListingEntry = { name?: string; version?: string; source?: string | SourceObject }
type Listing = { metadata?: { pluginRoot?: string }; plugins?: ListingEntry[] }

export type Install = { key: string; plugin: string; marketplace: string; version?: string; sha?: string; where: string }
export type CopiedSkill = { name: string; url: string; commit: string; paths: string[] }

const SHA = /^[0-9a-f]{7,40}$/
const MAX_COMMITS = 10

// Marketplace and listing JSON is third-party input that ends up in git argv, so only plain HTTPS URLs,
// ref names and relative paths get through; no value may start with "-" and be read as an option.
export function httpsUrl(source: { source?: string; repo?: string; url?: string } | undefined): string | undefined {
  if (!source) return undefined
  if (source.source === 'github' && typeof source.repo === 'string' && /^[\w.-]+\/[\w.-]+$/.test(source.repo)) {
    return `https://github.com/${source.repo.replace(/\.git$/, '')}.git`
  }
  const url = source.url
  if (typeof url !== 'string') return undefined
  if (source.source === 'git-subdir' && /^[\w.-]+\/[\w.-]+$/.test(url)) return `https://github.com/${url.replace(/\.git$/, '')}.git`
  return /^https:\/\/[\w.-]+(:\d+)?\/[\w.~%\/-]+$/.test(url) ? url : undefined
}

export function safeRef(ref: unknown): string | undefined {
  if (typeof ref !== 'string' || !/^[\w./-]+$/.test(ref) || ref.startsWith('-') || ref.includes('..')) return undefined
  return ref
}

// '' means the whole repository.
export function safePath(path: unknown): string | undefined {
  if (typeof path !== 'string') return undefined
  const trimmed = path.replace(/^\.\/?/, '').replace(/\/+$/, '')
  if (trimmed === '') return ''
  const segments = trimmed.split('/')
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..') || trimmed.startsWith('-')) return undefined
  return /^[\w./ -]+$/.test(trimmed) ? trimmed : undefined
}

export function mirrorDir(cacheRoot: string, url: string): string {
  const segments = url
    .replace(/^https:\/\//, '')
    .replace(/\.git$/, '')
    .split('/')
    .map(segment => segment.replace(/[^\w.-]/g, '_'))
    .filter(segment => segment !== '' && segment !== '.' && segment !== '..')
  return `${cacheRoot}/${segments.join('/')}.git`
}

export function parseInstalls(json: string): Install[] {
  const data = JSON.parse(json) as { plugins?: Record<string, InstallEntry[]> }
  const installs: Install[] = []
  for (const [key, entries] of Object.entries(data.plugins ?? {})) {
    const at = key.lastIndexOf('@')
    if (at <= 0) continue
    const distinct = new Map<string, InstallEntry>()
    for (const entry of entries) distinct.set(`${entry.gitCommitSha ?? ''}|${entry.version ?? ''}`, entry)
    for (const entry of distinct.values()) {
      installs.push({
        key,
        plugin: key.slice(0, at),
        marketplace: key.slice(at + 1),
        version: entry.version,
        sha: typeof entry.gitCommitSha === 'string' && SHA.test(entry.gitCommitSha) ? entry.gitCommitSha : undefined,
        where: distinct.size > 1 ? (entry.scope === 'user' ? 'user scope' : `${entry.scope ?? '?'} scope ${entry.projectPath ?? ''}`.trim()) : '',
      })
    }
  }
  return installs
}

export type MarketplaceRepo = { url: string; ref?: string; file: string }

export function marketplaceRepos(json: string): Map<string, MarketplaceRepo | string> {
  const data = JSON.parse(json) as Record<string, { source?: SourceObject }>
  const repos = new Map<string, MarketplaceRepo | string>()
  for (const [name, entry] of Object.entries(data)) {
    const source = entry.source
    const kind = source?.source
    if (kind !== 'github' && kind !== 'git') {
      repos.set(name, `marketplace source "${kind ?? 'unknown'}" is not a git repository`)
      continue
    }
    const url = httpsUrl(kind === 'git' ? { source: 'url', url: source?.url } : source)
    const file = source?.path === undefined ? '.claude-plugin/marketplace.json' : safePath(source.path)
    if (!url || !file) {
      repos.set(name, 'marketplace URL is not a plain https URL')
      continue
    }
    const ref = source?.ref === undefined ? undefined : safeRef(source.ref)
    if (source?.ref !== undefined && !ref) {
      repos.set(name, 'marketplace ref is not a plain ref name')
      continue
    }
    repos.set(name, { url, ref, file })
  }
  return repos
}

export function parseSourceFile(name: string, text: string): CopiedSkill | undefined {
  const match = /Source:\s*(https:\/\/\S+?)(?:\.git)?\s+\(commit ([0-9a-f]{7,40})\)/.exec(text)
  if (!match) return undefined
  const url = httpsUrl({ source: 'url', url: `${match[1]}.git` })
  if (!url) return undefined
  const pathLine = /^Path:\s*(.+)$/m.exec(text)?.[1] ?? ''
  const paths = pathLine.split(/\s+/).filter(Boolean).map(safePath)
  if (paths.some(path => path === undefined)) return undefined
  return { name, url, commit: match[2]!, paths: paths.filter((path): path is string => !!path) }
}

// One fetch per repository and check, shared by every plugin and skill that comes from it.
export class Mirrors {
  private readonly synced = new Map<string, Promise<string | undefined>>()

  constructor(
    private readonly git: Git,
    private readonly cacheRoot: string,
  ) {}

  // Resolves the mirror's directory, or undefined when it could not be cloned or fetched.
  sync(url: string): Promise<string | undefined> {
    let pending = this.synced.get(url)
    if (!pending) {
      pending = this.fetch(url)
      this.synced.set(url, pending)
    }
    return pending
  }

  private async fetch(url: string): Promise<string | undefined> {
    const dir = mirrorDir(this.cacheRoot, url)
    // A bare mirror answers "."; anything else is a missing folder or a repository further up.
    const existing = await this.git(['-C', dir, 'rev-parse', '--git-dir']).catch(() => undefined)
    const result = existing?.exitCode === 0 && existing.stdout.trim() === '.'
      ? await this.git(['-C', dir, 'fetch', '--quiet', '--prune', 'origin'])
      : await this.git(['clone', '--quiet', '--mirror', '--filter=blob:none', '--', url, dir])
    return result.exitCode === 0 ? dir : undefined
  }
}

async function resolveCommit(git: Git, dir: string, rev: string): Promise<string | undefined> {
  const result = await git(['-C', dir, 'rev-parse', '--verify', '--quiet', '--end-of-options', `${rev}^{commit}`])
  return result.exitCode === 0 ? result.stdout.trim() : undefined
}

async function readAt(git: Git, dir: string, commit: string, file: string): Promise<string | undefined> {
  const result = await git(['-C', dir, 'show', `${commit}:${file}`])
  return result.exitCode === 0 ? result.stdout : undefined
}

// Commits between `from` and `to` that touch `paths` (the whole repository when empty).
async function missing(git: Git, dir: string, from: string, to: string, paths: readonly string[]) {
  const fromCommit = await resolveCommit(git, dir, from)
  if (!fromCommit) return undefined
  const range = [`${fromCommit}..${to}`, '--', ...paths]
  const count = await git(['-C', dir, 'rev-list', '--count', ...range])
  const log = await git(['-C', dir, 'log', `-n${MAX_COMMITS}`, '--format=%h %cs %s', ...range])
  if (count.exitCode !== 0 || log.exitCode !== 0) return undefined
  return { behind: Number(count.stdout.trim()), commits: log.stdout.split('\n').filter(Boolean) }
}

function finding(name: string, kind: Finding['kind'], fields: Partial<Finding>): Finding {
  return { name, kind, status: 'unchecked', behind: 0, commits: [], ...fields }
}

async function compare(git: Git, dir: string, from: string, to: string, paths: readonly string[], base: Finding): Promise<Finding> {
  const result = await missing(git, dir, from, to, paths)
  if (!result) return { ...base, status: 'unchecked', reason: `installed commit ${from.slice(0, 7)} not found upstream` }
  return { ...base, status: result.behind > 0 ? 'behind' : 'current', ...result }
}

function pluginPath(source: string, listing: Listing): string | undefined {
  const root = listing.metadata?.pluginRoot
  if (!source.startsWith('./') && !source.includes('/') && source !== '.' && root) return safePath(`${root.replace(/\/+$/, '')}/${source}`)
  return safePath(source)
}

export async function checkPlugin(git: Git, mirrors: Mirrors, install: Install, repo: MarketplaceRepo | string | undefined): Promise<Finding> {
  const label = install.where ? `${install.key} (${install.where})` : install.key
  const base = finding(label, 'plugin', { action: `claude plugin update ${install.key}` })
  if (repo === undefined) return { ...base, reason: 'marketplace not found in known_marketplaces.json' }
  if (typeof repo === 'string') return { ...base, reason: repo }

  const dir = await mirrors.sync(repo.url)
  if (!dir) return { ...base, reason: `could not fetch ${repo.url}` }
  const tip = await resolveCommit(git, dir, repo.ref ?? 'HEAD')
  const text = tip && (await readAt(git, dir, tip, repo.file))
  if (!tip || !text) return { ...base, reason: 'marketplace.json not found upstream' }
  const listing = JSON.parse(text) as Listing
  const entry = listing.plugins?.find(plugin => plugin.name === install.plugin)
  if (!entry?.source) return { ...base, reason: 'no longer listed in its marketplace' }

  // A plugin installed without a commit (one inside a marketplace that is not a git checkout) is compared by version.
  if (!install.sha) {
    if (!entry.version || !install.version) return { ...base, reason: 'no installed commit or version to compare' }
    return entry.version === install.version
      ? { ...base, status: 'current' }
      : { ...base, status: 'behind', behind: 0, upstream: `version ${install.version} → ${entry.version}` }
  }

  if (typeof entry.source === 'string') {
    const path = pluginPath(entry.source, listing)
    if (path === undefined) return { ...base, reason: `unsupported source path "${entry.source}"` }
    return compare(git, dir, install.sha, tip, path ? [path] : [], base)
  }

  const source = entry.source
  if (source.source !== 'github' && source.source !== 'url' && source.source !== 'git-subdir') {
    return { ...base, reason: `"${source.source ?? 'unknown'}" plugin sources are not checked` }
  }
  const url = httpsUrl(source)
  const path = source.source === 'git-subdir' ? safePath(source.path) : ''
  if (!url || path === undefined) return { ...base, reason: 'plugin source is not a plain https repository' }
  const pinned = source.sha !== undefined ? (SHA.test(source.sha) ? source.sha : undefined) : undefined
  const ref = source.ref !== undefined ? safeRef(source.ref) : 'HEAD'
  if ((source.sha !== undefined && !pinned) || !ref) return { ...base, reason: 'plugin source has an unusual ref or sha' }
  if (pinned === install.sha) return { ...base, status: 'current' }

  const pluginDir = await mirrors.sync(url)
  if (!pluginDir) return { ...base, reason: `could not fetch ${url}` }
  const target = await resolveCommit(git, pluginDir, pinned ?? ref)
  if (!target) return { ...base, reason: `upstream ${pinned ?? ref} not found` }
  return compare(git, pluginDir, install.sha, target, path ? [path] : [], base)
}

export async function checkSkill(git: Git, mirrors: Mirrors, skill: CopiedSkill): Promise<Finding> {
  const base = finding(skill.name, 'skill', {})
  const dir = await mirrors.sync(skill.url)
  if (!dir) return { ...base, reason: `could not fetch ${skill.url}` }
  const tip = await resolveCommit(git, dir, 'HEAD')
  if (!tip) return { ...base, reason: 'upstream default branch not found' }
  const github = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+?)\.git$/.exec(skill.url)?.[1]
  const action = github
    ? `review https://github.com/${github}/compare/${skill.commit}...${tip.slice(0, 12)} before copying`
    : `review the upstream diff since ${skill.commit} before copying`
  return compare(git, dir, skill.commit, tip, skill.paths, { ...base, action })
}

export function pending(report: Report | undefined): Finding[] {
  return report?.findings.filter(item => item.status === 'behind') ?? []
}

function amount(item: Finding): string {
  return item.upstream ?? `${item.behind} commit${item.behind === 1 ? '' : 's'}`
}

export function statusText(report: Report | undefined): string | undefined {
  const behind = pending(report)
  if (behind.length === 0) return undefined
  const shown = behind.slice(0, 3).map(item => `${item.name.split('@')[0]!.split(' ')[0]} ${item.upstream ? 'new version' : item.behind}`)
  return `updates: ${shown.join(', ')}${behind.length > 3 ? ` +${behind.length - 3}` : ''}`
}

// Changes when anything new appears upstream, so the daily toast repeats only for news.
export function signature(report: Report | undefined): string {
  return pending(report)
    .map(item => `${item.name}:${item.commits[0] ?? item.upstream ?? ''}`)
    .sort()
    .join('|')
}

export function toastText(report: Report): string {
  const behind = pending(report)
  const names = behind.slice(0, 3).map(item => `${item.name.split(' ')[0]} (${amount(item)})`)
  return `Updates available: ${names.join(', ')}${behind.length > 3 ? ` and ${behind.length - 3} more` : ''}. /plugin-updates lists them.`
}

export function reportText(report: Report | undefined, now: number): string {
  if (!report) return 'No check has run yet.'
  const lines: string[] = []
  const behind = pending(report)
  const unchecked = report.findings.filter(item => item.status === 'unchecked')
  const current = report.findings.filter(item => item.status === 'current')
  const minutes = Math.round((now - report.checkedAt) / 60_000)
  lines.push(`Checked ${minutes < 1 ? 'just now' : `${minutes} min ago`}: ${behind.length} behind, ${current.length} current, ${unchecked.length} not checked.`)
  for (const item of behind) {
    lines.push('', `${item.kind === 'skill' ? 'Skill' : 'Plugin'} ${item.name}: ${amount(item)} behind`)
    for (const commit of item.commits) lines.push(`  ${commit}`)
    if (item.behind > item.commits.length) lines.push(`  … ${item.behind - item.commits.length} older`)
    if (item.action) lines.push(`  → ${item.action}`)
  }
  if (unchecked.length > 0) {
    lines.push('', 'Not checked:')
    for (const item of unchecked) lines.push(`  ${item.name}: ${item.reason ?? 'unknown'}`)
  }
  if (current.length > 0) lines.push('', `Current: ${current.map(item => item.name).join(', ')}`)
  return lines.join('\n')
}
