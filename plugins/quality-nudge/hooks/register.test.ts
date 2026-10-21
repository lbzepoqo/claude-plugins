import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

// A repository whose HEAD moves on each Bash call that commits, reported in the result's gitOperation as
// the Bash tool does. Commit cN was authored at N * 100 seconds.
function fakeRepository(on: On, { reviewFails = false, reflogOff = false, env = { HOME: '/home/user' } as Record<string, string> } = {}) {
  let commitCount = 0
  const reflog: string[] = []
  const gitDirectories: (string | undefined)[] = []
  const answer = (stdout: string, exitCode = 0) => ({
    value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  })
  on('session.cwd', () => ({ value: '/repo' }))
  on('env.get', (_$, e) => ({ value: env[e.name] }))
  on('process.run', (_$, e) => {
    gitDirectories.push(e.init?.cwd)
    const args = e.argv.slice(3).filter(arg => arg !== '--')
    const last = args[args.length - 1] ?? ''
    const head = `c${commitCount}`
    if (args[0] === 'rev-parse' && args[1] === '--verify') return commitCount === 0 ? answer('', 1) : answer(head)
    if (args[0] === 'rev-parse') return answer(e.init?.cwd ?? '/repo')
    // A pulled commit (uN) adds no code of its own.
    if (args[0] === 'diff-tree' && last.startsWith('u')) return answer('')
    if (args[0] === 'diff-tree') return answer('20\t5\tsrc/a.ts\x0010\t0\tsrc/b.ts\x003\t1\tREADME.md\x00')
    if (args[0] === 'rev-list') return reflogOff || reflog.length === 0 ? answer('', 128) : answer(String(reflog.length))
    if (args.includes('-g')) {
      const count = Number(args[args.indexOf('-n') + 1])
      return answer(reflogOff ? '' : reflog.slice(0, count).join('\n'))
    }
    if (args.includes('--format=%P')) return answer(last === 'c1' ? '' : `c${Number(last.slice(1)) - 1}`)
    if (args.includes('--format=%at')) {
      const revision = last === 'HEAD' ? head : last
      return answer(String(Number(revision.slice(1)) * 100))
    }
    if (args.includes('--format=%s%x09%P')) return answer(`feat: commit ${last.slice(1)}\tc${Number(last.slice(1)) - 1}`)
    return answer('', 128)
  })
  on('tool.call', { tool: 'Skill' }, (_$, e) =>
    reviewFails
      ? { result: { success: false, commandName: e.skill, status: 'inline' as const }, isError: true }
      : { result: { success: true, commandName: e.skill, status: 'inline' as const } },
  )
  on('tool.call', { tool: 'Bash' }, (_$, e) => {
    const commits = /git (-C \S+ )?commit/.test(e.command) && !/--dry-run/.test(e.command)
    if (commits) {
      commitCount++
      reflog.unshift(`c${commitCount}\tcommit: feat: commit ${commitCount}`)
    }
    if (/git pull/.test(e.command)) reflog.unshift('u9\tpull: Fast-forward')
    // `git commit -q` prints nothing, so the engine does not report it.
    const gitOperation = commits && !/ -q/.test(e.command) ? { commit: { sha: `c${commitCount}`, kind: 'committed' as const } } : {}
    return { result: { stdout: '', stderr: '', interrupted: false, gitOperation } }
  })
  return { gitDirectories }
}

test('reminds after each unreviewed code commit, not after a fix commit that follows a review', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  fakeRepository(on)

  const first = await $.tool.call({ tool: 'Bash', command: 'git commit -m "feat: commit 1"' })
  expect(first.context?.[0]).toContain('quality-nudge: This commit changes 35 lines in 2 code files')

  const second = await $.tool.call({ tool: 'Bash', command: 'git commit -m "feat: commit 2"' })
  expect(second.context?.[0]).toContain('This commit changes 35 lines')

  // The review runs at 1,000 s, after commit 3's parent (c2, authored at 200 s).
  await $.tool.call({ tool: 'Skill', skill: 'code-review' })
  const fix = await $.tool.call({ tool: 'Bash', command: 'git commit -m "fix: review findings"' })
  expect(fix.context).toBeUndefined()
})

test('sees a quiet commit by the HEAD it moved', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  fakeRepository(on)
  const quiet = await $.tool.call({ tool: 'Bash', command: 'git commit -qm "feat: commit 1"' })
  expect(quiet.context?.[0]).toContain('This commit changes 35 lines in 2 code files')
})

test('sees a quiet commit by the HEAD it moved when the reflog is off', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  fakeRepository(on, { reflogOff: true })
  const quiet = await $.tool.call({ tool: 'Bash', command: 'git commit -qm "feat: commit 1"' })
  expect(quiet.context?.[0]).toContain('This commit changes 35 lines in 2 code files')
  const nothing = await $.tool.call({ tool: 'Bash', command: 'git commit --dry-run -qm "feat: commit 2"' })
  expect(nothing.context).toBeUndefined()
})

test('finds a quiet commit followed by a pull in the same command', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  fakeRepository(on)
  const pulled = await $.tool.call({ tool: 'Bash', command: 'git commit -qam "feat: commit 1"; git pull' })
  expect(pulled.context?.[0]).toContain('This commit changes 35 lines in 2 code files')
})

test('a failed review call does not cover a commit', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  fakeRepository(on, { reviewFails: true })
  await $.tool.call({ tool: 'Skill', skill: 'code-review' })
  const afterFailure = await $.tool.call({ tool: 'Bash', command: 'git commit -m "feat: commit 1"' })
  expect(afterFailure.context?.[0]).toContain('/code-review did not run')
})

test('a review covers only the repository it ran in', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  fakeRepository(on)
  await $.tool.call({ tool: 'Skill', skill: 'code-review' })
  const other = await $.tool.call({ tool: 'Bash', command: 'git -C /other commit -m "feat: commit 1"' })
  expect(other.context?.[0]).toContain('/code-review did not run')
  const same = await $.tool.call({ tool: 'Bash', command: 'git commit -m "feat: commit 2"' })
  expect(same.context).toBeUndefined()
})

test('a cd to ~ uses USERPROFILE when HOME is unset (Windows)', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const { gitDirectories } = fakeRepository(on, { env: { USERPROFILE: '/users/u' } })
  await $.tool.call({ tool: 'Bash', command: 'cd ~/proj && git commit -m "feat: commit 1"' })
  expect(gitDirectories).toContain('/users/u/proj')
})
