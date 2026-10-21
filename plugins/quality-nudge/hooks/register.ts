import type { EngineInterface, Register } from 'claude-code'
import {
  codeChange,
  commitDirectory,
  commitNudge,
  DEFAULT_LIMITS,
  expandHome,
  madeCommit,
  parseCommitLine,
  reviewSkill,
  type Limits,
  type Reviews,
} from './rules'

type Git = (cwd: string | undefined, args: string[]) => Promise<string | undefined>

function gitRunner($: EngineInterface): Git {
  return async (cwd, args) => {
    // Unquoted paths, so a non-ASCII name still matches the extension and path checks. A run that rejects
    // (git missing, a timeout) counts as a failed one, since a hook that throws is skipped and the call runs.
    const run = await $.process.run(['git', '-c', 'core.quotePath=false', ...args], cwd === undefined ? {} : { cwd }).catch(() => undefined)
    if (run?.exitCode !== 0) return undefined
    // Only the line end goes, since a -z listing can start with a space. Output over 4 MiB is cut: its partial
    // last record is dropped, and the rest is far over any threshold.
    const output = run.stdout.replace(/\n$/, '')
    const lastRecord = output.lastIndexOf('\0')
    return run.isStdoutTruncated && lastRecord >= 0 ? output.slice(0, lastRecord + 1) : output
  }
}

// Author time survives a rebase; 0 when the commit cannot be read (a root
// commit's missing parent, a shallow clone).
async function authorTime(git: Git, cwd: string, revision: string): Promise<number> {
  const time = revision ? await git(cwd, ['log', '-1', '--format=%at', revision, '--']) : undefined
  return Number(time || 0) * 1000
}

type HeadState = { head: string | undefined; entries: number }

// HEAD and the length of its reflog; 0 entries when there is no reflog (none yet, or turned off).
async function headState(git: Git, root: string): Promise<HeadState> {
  const [head, entries] = await Promise.all([git(root, ['rev-parse', '--verify', '-q', 'HEAD']), git(root, ['rev-list', '-g', '--count', 'HEAD'])])
  return { head, entries: Number(entries) || 0 }
}

// A commit that printed nothing: the newest commit among the reflog entries the call added. With the reflog
// off, a HEAD whose parent is the start HEAD, so a pull or checkout in the same command is not taken for it.
async function quietCommit(git: Git, root: string, start: HeadState): Promise<string | undefined> {
  const end = await headState(git, root)
  const added = end.entries - start.entries
  if (end.entries > 0) return added > 0 ? madeCommit((await git(root, ['log', '-g', '-n', String(added), '--format=%H%x09%gs', 'HEAD'])) ?? '', added) : undefined
  if (end.head === undefined || end.head === start.head) return undefined
  return (await git(root, ['log', '-1', '--format=%P', end.head])) === (start.head ?? '') ? end.head : undefined
}

// The top of the repository a commit runs in: a -C or cd directory, else the session's.
async function repositoryRoot($: EngineInterface, git: Git, directory: string | null): Promise<string> {
  const cwd = directory === null ? undefined : expandHome(directory, (await $.env.get('HOME')) ?? '')
  return (await git(cwd, ['rev-parse', '--show-toplevel'])) ?? cwd ?? (await $.session.cwd())
}

// A code commit that no required review saw gets a reminder in the tool
// result. A hook that fails is skipped by the engine and the call runs
// unchanged.
export const limitOption = (value: unknown, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const register: Register = (on, options) => {
  const limits: Limits = {
    reviewLines: limitOption(options.reviewLines, DEFAULT_LIMITS.reviewLines),
    simplifyLines: limitOption(options.simplifyLines, DEFAULT_LIMITS.simplifyLines),
  }
  // Per session and per repository of the session's directory, so a review of one repository does not
  // cover commits in another. A reload starts over, which costs at most one extra reminder.
  const reviewsByRoot = new Map<string, Reviews>()
  const noReviews: Reviews = { simplify: 0, 'code-review': 0 }

  // Reviews count from any agent, so one run by a fork covers the change. A denied or failed call is no review.
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const skill = reviewSkill(e.skill)
    const startedAt = await $.clock.now()
    const result = await next(e)
    if (!skill || result.deny !== undefined || result.isError || result.result.success === false) return result
    const root = await repositoryRoot($, gitRunner($), null)
    const reviews = reviewsByRoot.get(root) ?? noReviews
    reviewsByRoot.set(root, { ...reviews, [skill]: startedAt })
    return result
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (e.agentId) return next(e)
    const commitAt = commitDirectory(e.command)
    const git = gitRunner($)
    // Read before the call, so only the reflog entries the call adds are searched for a quiet commit.
    const startRoot = commitAt === undefined ? undefined : await repositoryRoot($, git, commitAt)
    const start = startRoot === undefined ? undefined : await headState(git, startRoot)
    const result = await next(e)
    if (result.deny !== undefined || result.isError) return result

    // The engine reports the git operations it reads from a command's output, so commits by an alias or a
    // script are seen too. `git commit -q` prints nothing, so for a git commit call in the command the
    // reflog is read as well. The repository is found again after the call, which may have created it.
    const operation = result.result.gitOperation
    if (!operation?.commit && commitAt === undefined) return result
    if (operation?.commit && operation.commit.kind !== 'committed') return result
    const root = await repositoryRoot($, git, commitAt ?? null)
    const sha = operation?.commit?.sha ?? (await quietCommit(git, root, startRoot === root && start ? start : { head: undefined, entries: 0 }))
    if (!sha) return result

    const [line = '', numstat = ''] = await Promise.all([
      git(root, ['log', '-1', '--format=%s%x09%P', sha]),
      git(root, ['diff-tree', '--root', '-M', '--no-commit-id', '--numstat', '-z', '-r', sha]),
    ])
    const commit = parseCommitLine(line)
    if (!commit) return result
    const parentTime = await authorTime(git, root, commit.parent)
    const text = commitNudge({ subject: commit.subject, change: codeChange(numstat), parentTime }, reviewsByRoot.get(root) ?? noReviews, limits)
    if (!text) return result
    return { ...result, context: [...(result.context ?? []), `${$.plugin.name}: ${text}`] }
  })
}
