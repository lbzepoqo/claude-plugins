import type { EngineInterface, Register } from 'claude-code'

import {
  Mirrors,
  checkPlugin,
  checkSkill,
  marketplaceRepos,
  newsKeys,
  parseInstalls,
  parseSourceFile,
  reportText,
  statusText,
  toastText,
  type CopiedSkill,
  type Report,
} from './checks'

const DAY = 24 * 60 * 60 * 1000
const RETRY_AFTER = 60 * 60 * 1000
const START_DELAY = 30_000
const GIT_TIMEOUT = 5 * 60 * 1000

type Stored = Report & { inputs: string }

async function paths($: EngineInterface) {
  // The order of Node's os.homedir(): USERPROFILE exists only on Windows, where HOME is usually unset.
  const home = (await $.env.get('USERPROFILE')) || (await $.env.get('HOME'))
  if (!home) throw new Error('Neither USERPROFILE nor HOME is set')
  const configDir = (await $.env.get('CLAUDE_CONFIG_DIR')) || `${home}/.claude`
  return { configDir, cacheRoot: `${home}/.cache/plugin-updates` }
}

// The files a check reads; when they change (a plugin updated, a skill copied again) the stored report is stale.
async function readInputs($: EngineInterface, configDir: string) {
  const installed = await $.fs.read(`${configDir}/plugins/installed_plugins.json`)
  const skillsDir = `${configDir}/skills`
  const sources: { name: string; text: string }[] = []
  if (await $.fs.exists(skillsDir)) {
    for (const entry of await $.fs.list(skillsDir)) {
      const file = `${skillsDir}/${entry.name}/SOURCE.txt`
      if (await $.fs.exists(file)) sources.push({ name: entry.name, text: await $.fs.read(file) })
    }
  }
  return { installed, sources, fingerprint: [installed, ...sources.map(source => source.text)].join('\n') }
}

async function check($: EngineInterface): Promise<Stored> {
  const { configDir, cacheRoot } = await paths($)
  // A git that cannot start or runs past the timeout fails its own plugin, not the whole check.
  const git = (args: readonly string[]) =>
    $.process
      .run(['git', ...args], { timeoutMs: GIT_TIMEOUT, env: { GIT_TERMINAL_PROMPT: '0' } })
      .catch((error: unknown) => ({ exitCode: 1, stdout: '', stderr: error instanceof Error ? error.message : String(error) }))
  const mirrors = new Mirrors(git, cacheRoot)
  const inputs = await readInputs($, configDir)
  const repos = marketplaceRepos(await $.fs.read(`${configDir}/plugins/known_marketplaces.json`))
  const skills = inputs.sources
    .map(source => parseSourceFile(source.name, source.text))
    .filter((skill): skill is CopiedSkill => skill !== undefined)
  const findings = await Promise.all([
    ...parseInstalls(inputs.installed).map(install => checkPlugin(git, mirrors, install, repos.get(install.marketplace))),
    ...skills.map(skill => checkSkill(git, mirrors, skill)),
  ])
  return { checkedAt: await $.clock.now(), findings, inputs: inputs.fingerprint }
}

let running: Promise<Stored | undefined> | undefined

function runCheck($: EngineInterface): Promise<Stored | undefined> {
  running ??= (async () => {
    try {
      await $.store.set('lastAttempt', await $.clock.now())
      const report = await check($)
      await $.store.set('report', report)
      $.ui.status(statusText(report))
      await toastNews($, report)
      return report
    } catch (error) {
      $.ui.log(`plugin-updates: check failed: ${error instanceof Error ? error.message : String(error)}`)
      return undefined
    } finally {
      running = undefined
    }
  })()
  return running
}

async function toastNews($: EngineInterface, report: Report) {
  const keys = newsKeys(report)
  const seen = new Set(((await $.store.get('toasted')) as string[] | undefined) ?? [])
  await $.store.set('toasted', keys)
  if (keys.some(key => !seen.has(key))) $.ui.toast(toastText(report), { timeoutMs: 12_000 })
}

// Sessions started together share the store: the attempt time written here keeps all but one from fetching the same mirrors.
async function claimAttempt($: EngineInterface, now: number): Promise<boolean> {
  const lastAttempt = ((await $.store.get('lastAttempt')) as number | undefined) ?? 0
  if (now - lastAttempt < RETRY_AFTER) return false
  await $.store.set('lastAttempt', now)
  return true
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'plugin-updates', description: 'Check installed plugins and copied skills for upstream updates' })
    const stored = (await $.store.get('report')) as Stored | undefined
    const { configDir } = await paths($)
    const changed = stored !== undefined && stored.inputs !== (await readInputs($, configDir)).fingerprint
    const now = await $.clock.now()
    $.ui.status(changed ? undefined : statusText(stored))
    const due = !stored || changed || now - stored.checkedAt >= DAY
    if (due && (changed || (await claimAttempt($, now)))) $.clock.after(START_DELAY, () => void runCheck($))
    return next(e)
  })

  on('command.run', { command: 'plugin-updates' }, async $ => {
    const report = await runCheck($)
    if (!report) return { text: 'The check failed; the debug log has the reason.' }
    return { text: reportText(report) }
  })
}
