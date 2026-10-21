import { describe, expect, test } from 'claude-code/testing'
import { codeChange, commitDirectory, commitNudge, madeCommit } from './rules'

describe('commitDirectory', () => {
  test('finds where the git commit runs', () => {
    expect(commitDirectory('git status')).toBeUndefined()
    expect(commitDirectory('git commit -m x')).toBeNull()
    expect(commitDirectory('git -C "/my repo" commit -m x')).toBe('/my repo')
    expect(commitDirectory('cd ~/.claude && git status && cd /other && git commit -m y')).toBe('/other')
  })
})

describe('codeChange', () => {
  test('counts added and deleted lines of code files only, and sees guard code', () => {
    expect(codeChange('20\t5\tsrc/a.ts\x003\t1\tREADME.md\x00-\t-\tlogo.png\x00')).toEqual({ lines: 25, files: 1, guarded: false })
    expect(codeChange('2\t1\tmods/secret-guard/hooks/rules.ts\x00')).toEqual({ lines: 3, files: 1, guarded: true })
    expect(codeChange('1\t0\tgit-hooks/pre-push\x00')).toEqual({ lines: 1, files: 1, guarded: true })
    expect(codeChange('1\t1\tmods/rule-guards/hooks/hooks.json\x00').guarded).toBe(true)
    expect(codeChange('4\t0\tmods/secret-guard/README.md\x00')).toEqual({ lines: 0, files: 0, guarded: false })
    expect(codeChange('1\t0\tsrc/say"hi".ts\x00')).toEqual({ lines: 1, files: 1, guarded: false })
    expect(codeChange('12\t3\tsrc/lib/BanForm.svelte\x00')).toEqual({ lines: 15, files: 1, guarded: false })
  })

  test('reads renamed paths, and joined outputs', () => {
    expect(codeChange('40\t2\t\x00mods/secret-guard/hooks/register.ts\x00mods/secret-guard/hooks/guard.ts\x00')).toEqual({ lines: 42, files: 1, guarded: true })
    expect(codeChange('3\t0\t\x00old.md\x00new.py\x00\x001\t1\tnew.py\x00')).toEqual({ lines: 5, files: 1, guarded: false })
  })
})

describe('madeCommit', () => {
  test('takes the newest commit among the entries the call added, past a pull', () => {
    expect(madeCommit('p2\tpull: Fast-forward\nc1\tcommit: feat: x\nc0\tcommit: y', 2)).toBe('c1')
    expect(madeCommit('m1\tcommit (merge): Merge branch x\nc0\tcommit: y', 1)).toBe('m1')
    expect(madeCommit('c1\tcommit (initial): x', 1)).toBe('c1')
  })

  test('finds a commit when the call checks out back to the HEAD it started from', () => {
    expect(madeCommit('c0\tcheckout: moving from fix to main\nc1\tcommit: x\nc0\tcheckout: moving from main to fix\nc0\tcommit: y', 3)).toBe('c1')
  })

  test('measures an amend of a commit from the same call, and skips an amend of an older one', () => {
    expect(madeCommit('a2\tcommit (amend): x\nc1\tcommit (initial): x', 2)).toBe('a2')
    expect(madeCommit('a2\tcommit (amend): x\nc1\tcommit: x', 1)).toBeUndefined()
  })

  test('ignores commits from before the call and moves that are not commits', () => {
    expect(madeCommit('c1\tcommit: x', 0)).toBeUndefined()
    expect(madeCommit('r1\treset: moving to HEAD~1\nc0\tcommit: x', 1)).toBeUndefined()
    expect(madeCommit('', 0)).toBeUndefined()
  })
})

const none = { simplify: 0, 'code-review': 0 }
const medium = { lines: 40, files: 2, guarded: false }

describe('commitNudge', () => {
  const commit = { subject: 'feat: thing', change: medium, parentTime: 1_000 }

  test('asks for code-review only, and /simplify too on a large change', () => {
    expect(commitNudge(commit, none)).toContain('40 lines in 2 code files and /code-review did not run')
    const large = { ...commit, change: { lines: 300, files: 9, guarded: false } }
    expect(commitNudge(large, none)).toContain('9 code files and /code-review and /simplify did not run')
    expect(commitNudge(large, { simplify: 0, 'code-review': 2_000 })).toContain('9 code files and /simplify did not run')
  })

  test('skips wip commits and changes under the threshold', () => {
    expect(commitNudge({ ...commit, subject: 'wip: half' }, none)).toBeUndefined()
    expect(commitNudge({ ...commit, change: { lines: 29, files: 3, guarded: false } }, none)).toBeUndefined()
  })

  test('the line limits come from the options', () => {
    const limits = { reviewLines: 50, simplifyLines: 100 }
    expect(commitNudge(commit, none, limits)).toBeUndefined()
    const sized = { ...commit, change: { lines: 120, files: 3, guarded: false } }
    expect(commitNudge(sized, none, limits)).toContain('/code-review and /simplify did not run')
  })

  test('a small change to guard code is still reviewed', () => {
    const guard = { ...commit, change: codeChange('2\t1\tmods/secret-guard/hooks/rules.ts\x00') }
    expect(commitNudge(guard, none)).toContain('including guard code')
  })

  test('reviews after its parent cover it, so a fix commit after a review is not reminded', () => {
    expect(commitNudge(commit, { simplify: 0, 'code-review': 2_500 })).toBeUndefined()
    expect(commitNudge(commit, { simplify: 0, 'code-review': 500 })).toContain('/code-review did not run')
  })
})
