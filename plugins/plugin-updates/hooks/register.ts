import type { EngineInterface, Register } from 'claude-code'

import {
  Mirrors,
  checkPlugin,
  checkSkill,
  marketplaceRepos,
  parseInstalls,
  parseSourceFile,
  reportText,
  signature,
  statusText,
  toastText,
  type CopiedSkill,
  type Report,
} from './checks'

const DAY = 24 * 60 * 60 * 1000
const RETRY_AFTER = 60 * 60 * 1000
const START_DELAY = 30_000
const GIT_TIMEOUT = 5 * 60 * 1000

async function paths($: EngineInterface) {
  const home = (await $.env.get('HOME')) ?? ''
  const configDir = (await $.env.get('CLAUDE_CONFIG_DIR')) || `${home}/.claude`
  return { configDir, cacheRoot: `${home}/.cache/plugin-updates` }
}

async function copiedSkills($: EngineInterface, configDir: string): Promise<CopiedSkill[]> {
  const skillsDir = `${configDir}/skills`
  if (!(await $.fs.exists(skillsDir))) return []
  const skills: CopiedSkill[] = []
  for (const entry of await $.fs.list(skillsDir)) {
    const file = `${skillsDir}/${entry.name}/SOURCE.txt`
    if (!(await $.fs.exists(file))) continue
    const skill = parseSourceFile(entry.name, await $.fs.read(file))
    if (skill) skills.push(skill)
  }
  return skills
}

async function check($: EngineInterface): Promise<Report> {
  const { configDir, cacheRoot } = await paths($)
  const git = (args: readonly string[]) =>
    $.process.run(['git', ...args], { timeoutMs: GIT_TIMEOUT, env: { GIT_TERMINAL_PROMPT: '0' } })
  const mirrors = new Mirrors(git, cacheRoot)
  const installs = parseInstalls(await $.fs.read(`${configDir}/plugins/installed_plugins.json`))
  const repos = marketplaceRepos(await $.fs.read(`${configDir}/plugins/known_marketplaces.json`))
  const findings = await Promise.all([
    ...installs.map(install => checkPlugin(git, mirrors, install, repos.get(install.marketplace))),
    ...(await copiedSkills($, configDir)).map(skill => checkSkill(git, mirrors, skill)),
  ])
  return { checkedAt: await $.clock.now(), findings }
}

// Several sessions may start together; the attempt time in the store keeps them from fetching the same mirrors at once.
let running: Promise<Report | undefined> | undefined

function runCheck($: EngineInterface): Promise<Report | undefined> {
  running ??= (async () => {
    try {
      await $.store.set('lastAttempt', await $.clock.now())
      const report = await check($)
      await $.store.set('report', report)
      await show($, report, true)
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

async function show($: EngineInterface, report: Report | undefined, mayToast: boolean) {
  $.ui.status(statusText(report))
  if (!mayToast || !report) return
  const news = signature(report)
  if (news === '' || news === (await $.store.get('toasted'))) return
  await $.store.set('toasted', news)
  $.ui.toast(toastText(report), { timeoutMs: 12_000 })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'plugin-updates', description: 'Check installed plugins and copied skills for upstream updates' })
    const report = (await $.store.get('report')) as Report | undefined
    const lastAttempt = ((await $.store.get('lastAttempt')) as number | undefined) ?? 0
    const now = await $.clock.now()
    await show($, report, false)
    if ((!report || now - report.checkedAt >= DAY) && now - lastAttempt >= RETRY_AFTER) {
      $.clock.after(START_DELAY, () => void runCheck($))
    }
    return next(e)
  })

  on('command.run', { command: 'plugin-updates' }, async $ => {
    const report = await runCheck($)
    if (!report) return { text: 'The check failed; the debug log has the reason.' }
    return { text: reportText(report, await $.clock.now()) }
  })
}
