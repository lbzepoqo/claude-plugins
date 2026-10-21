// Pure checks for the quality-nudge hooks.

const PATH = String.raw`("[^"]+"|'[^']+'|\S+)`

export const REVIEW_SKILLS = ['simplify', 'code-review'] as const
export type ReviewSkill = (typeof REVIEW_SKILLS)[number]

const CODE_EXTENSIONS = /\.(?:[cm]?[jt]sx?|svelte|py|sh|bash|lua|go|rs|java|kt|cs|rb|php|sql)$/
// Guard code (secret-guard, rule-guards, a push guard, git hooks) is reviewed at any size: a few changed
// lines of a pattern can open a gap.
const GUARD_PATH = /(?:^|\/)(?:[\w.-]*guard[\w.-]*|git-hooks)\//
// Under a guard path every file counts (a hook without an extension, the hooks.json that picks which calls
// a guard sees), except documentation.
const DOCUMENTATION = /\.(?:md|txt)$/

export interface Limits {
  // Changes below this many added plus deleted code lines go unreviewed, unless they touch guard code.
  reviewLines: number
  // From this size code-review's findings cap can crowd out its cleanup angles, so /simplify runs too.
  simplifyLines: number
}
export const DEFAULT_LIMITS: Limits = { reviewLines: 30, simplifyLines: 300 }

const GIT_COMMIT = new RegExp(String.raw`\bgit\s+(?:-C\s+${PATH}\s+)?commit\b`, 'd')
const CHANGE_DIRECTORY = new RegExp(String.raw`(?:^|&&|;)\s*cd\s+${PATH}\s*(?:&&|;)`, 'gmd')

// Where a git commit in the command runs: the -C path, the last `cd <dir>` before it, or the session's
// working directory (null). undefined when the command has no git commit. A match inside quoted text only
// costs a reflog read, since no new commit is found there.
export function commitDirectory(command: string): string | null | undefined {
  const call = GIT_COMMIT.exec(command)
  if (!call) return undefined
  const before = command.slice(0, call.index)
  const directory = call.indices?.[1] ?? [...before.matchAll(CHANGE_DIRECTORY)].at(-1)?.indices?.[1]
  return directory ? unquote(command.slice(...directory)) : null
}

// A process cwd is taken relative to the session's directory, but ~ is not expanded.
export function expandHome(directory: string, home: string): string {
  if (directory === '~') return home
  return directory.startsWith('~/') ? `${home}/${directory.slice(2)}` : directory
}

export function reviewSkill(skill: string): ReviewSkill | undefined {
  return REVIEW_SKILLS.find(name => name === skill)
}

// Code files, and every file under a guard path except documentation.
export function isCounted(path: string): boolean {
  return CODE_EXTENSIONS.test(path) || isGuard(path)
}

function isGuard(path: string): boolean {
  return GUARD_PATH.test(path) && !DOCUMENTATION.test(path)
}

export interface ChangeSize {
  lines: number
  files: number
  guarded: boolean
}

// The code part of `git diff-tree --numstat -z` output. Each record is `added<TAB>deleted<TAB>path<NUL>`,
// or for a rename `added<TAB>deleted<TAB><NUL>old<NUL>new<NUL>`. Binary files show `-` counts and add no
// lines.
export function codeChange(numstatOutput: string): ChangeSize {
  const paths = new Set<string>()
  let lines = 0
  let guarded = false
  const fields = numstatOutput.split('\0')
  for (let index = 0; index < fields.length; index++) {
    const record = fields[index] ?? ''
    if (!record) continue
    const [added = '', deleted = ''] = record.split('\t', 2)
    const path = record.slice(added.length + deleted.length + 2)
    const sides = path ? [path] : [fields[++index] ?? '', fields[++index] ?? '']
    if (!sides.some(isCounted)) continue
    paths.add(sides[sides.length - 1] ?? '')
    lines += (Number(added) || 0) + (Number(deleted) || 0)
    guarded ||= sides.some(isGuard)
  }
  return { lines, files: paths.size, guarded }
}

// The newest commit made by `git commit` since startedAt (ms), from `git log -g --date=unix
// --format=%H%x09%gd%x09%gs` output: reflog entries newest first, each the sha, `HEAD@{<seconds>}` and the
// reflog subject. A pull, reset or checkout moves HEAD under another subject and is passed over. An amend
// counts only on top of a commit made in the same call, and then it is the one measured; amending an older
// commit is not a new change set.
export function madeCommit(reflog: string, startedAt: number): string | undefined {
  let amended: string | undefined
  for (const line of reflog.split('\n')) {
    const [sha = '', selector = ''] = line.split('\t', 2)
    const seconds = Number(/\{(\d+)\}/.exec(selector)?.[1])
    if (!(seconds >= Math.floor(startedAt / 1000))) return undefined
    const subject = line.slice(sha.length + selector.length + 2)
    if (/^commit(?: \((?:initial|merge)\))?:/.test(subject)) return amended ?? sha
    if (/^commit \(amend\):/.test(subject)) amended ??= sha
  }
  return undefined
}

export function needsReview(change: ChangeSize, limits: Limits): boolean {
  return change.files > 0 && (change.lines >= limits.reviewLines || change.guarded)
}

// code-review at high effort covers the /simplify angles, so /simplify is only asked for large changes.
export function requiredReviews(change: ChangeSize, limits: Limits): ReviewSkill[] {
  return change.lines >= limits.simplifyLines ? ['code-review', 'simplify'] : ['code-review']
}

function describe(change: ChangeSize): string {
  return `${change.lines} lines in ${change.files} code file${change.files === 1 ? '' : 's'}${change.guarded ? ', including guard code,' : ''}`
}

export function isWipSubject(subject: string): boolean {
  return /^wip\b/i.test(subject.trim())
}

// When each review skill last ran, in ms. A review cannot be tied to a
// repository, so these are kept per session.
export type Reviews = Record<ReviewSkill, number>

// The required skills that did not run after the given time, so did not see
// the changes made since then.
export function missingReviews(reviews: Reviews, since: number, required: readonly ReviewSkill[]): ReviewSkill[] {
  return required.filter(skill => !(reviews[skill] > since))
}

function skillList(skills: ReviewSkill[]): string {
  return skills.map(skill => `/${skill}`).join(' and ')
}

export interface CommitFacts {
  subject: string
  change: ChangeSize
  // When the commit's parent was authored, in ms. The changes in the commit
  // were made after it, so a review after it saw them. Fix commits made after
  // a review sit on a parent authored before it, so they are covered.
  parentTime: number
}

// A reminder after a commit whose changes no required review saw.
export function commitNudge(commit: CommitFacts, reviews: Reviews, limits: Limits = DEFAULT_LIMITS): string | undefined {
  if (isWipSubject(commit.subject) || !needsReview(commit.change, limits)) return undefined
  const missing = missingReviews(reviews, commit.parentTime, requiredReviews(commit.change, limits))
  if (missing.length === 0) return undefined
  return (
    `This commit changes ${describe(commit.change)} and ${skillList(missing)} did not run while they ` +
    `were made. Run ${missing.length > 1 ? 'them' : 'it'} before reporting the task done ` +
    'or pushing, or say in your reply why the review does not apply.'
  )
}

// One line of `git log --format=%s%x09%P`: the subject and the first parent.
export function parseCommitLine(line: string): { subject: string; parent: string } | undefined {
  const tab = line.lastIndexOf('\t')
  if (tab < 0) return undefined
  return { subject: line.slice(0, tab), parent: line.slice(tab + 1).split(' ')[0] ?? '' }
}

function unquote(value: string): string {
  return value.replace(/^(["'])(.*)\1$/, '$2')
}
