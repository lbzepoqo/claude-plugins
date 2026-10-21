import type { EngineInterface, Register } from 'claude-code'
import {
  codeChange,
  commitDirectory,
  commitNudge,
  expandHome,
  madeCommit,
  parseCommitLine,
  reviewSkill,
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

// The top of the repository a commit runs in: a -C or cd directory, else the session's.
async function repositoryRoot($: EngineInterface, git: Git, directory: string | null): Promise<string> {
  const cwd = directory === null ? undefined : expandHome(directory, (await $.env.get('HOME')) ?? '')
  return (await git(cwd, ['rev-parse', '--show-toplevel'])) ?? cwd ?? (await $.session.cwd())
}

// A code commit that no required review saw gets a reminder in the tool
// result. A hook that fails is skipped by the engine and the call runs
// unchanged.
export const register: Register = on => {
  // Per session; a reload starts over, which costs at most one extra reminder.
  const reviews: Reviews = { simplify: 0, 'code-review': 0 }

  // Reviews count from any agent, so one run by a fork covers the change.
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const skill = reviewSkill(e.skill)
    if (skill) reviews[skill] = await $.clock.now()
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (e.agentId) return next(e)
    const startedAt = await $.clock.now()
    const result = await next(e)
    if (result.deny !== undefined || result.isError) return result

    // The engine reports the git operations it reads from a command's output, so commits by an alias or a
    // script are seen too. `git commit -q` prints nothing, so for a git commit call in the command the
    // reflog is read as well. The repository is found after the call, which may have created it.
    const operation = result.result.gitOperation
    const commitAt = commitDirectory(e.command)
    if (!operation?.commit && commitAt === undefined) return result
    if (operation?.commit && operation.commit.kind !== 'committed') return result
    const git = gitRunner($)
    const root = await repositoryRoot($, git, commitAt ?? null)
    const sha =
      operation?.commit?.sha ??
      madeCommit((await git(root, ['log', '-g', '-n', '20', '--date=unix', '--format=%H%x09%gd%x09%gs', 'HEAD'])) ?? '', startedAt)
    if (!sha) return result

    const [line = '', numstat = ''] = await Promise.all([
      git(root, ['log', '-1', '--format=%s%x09%P', sha]),
      git(root, ['diff-tree', '-M', '--no-commit-id', '--numstat', '-z', '-r', sha]),
    ])
    const commit = parseCommitLine(line)
    if (!commit) return result
    const parentTime = await authorTime(git, root, commit.parent)
    const text = commitNudge({ subject: commit.subject, change: codeChange(numstat), parentTime }, reviews)
    if (!text) return result
    return { ...result, context: [...(result.context ?? []), `${$.plugin.name}: ${text}`] }
  })
}
