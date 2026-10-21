import type { SkillEntry, SkillHint } from '../types'

export const NO_SKILL = 'none of these'

// Router skills fit almost any open question, so suggesting one tells the person nothing.
const ROUTER_SKILL = /(^|:)ask-matt$/

// The name without its plugin prefix: `mattpocock-skills:implement` becomes `implement`.
export function shortName(name: string): string {
  return name.replace(/^[^:]+:/, '')
}

// The catalog the classifier chooses from: every skill except the routers.
export function suggestable(catalog: readonly SkillEntry[]): SkillEntry[] {
  return catalog.filter(skill => !ROUTER_SKILL.test(skill.name))
}

// The longest description kept per skill: enough for the classifier and one pane row.
const DESCRIPTION_ROOM = 220

type CommandLike = { name: string; description: string; source: string; plugin?: string }

// Skills and plugin commands the person or Claude can use. Built-in and MCP commands are
// left out, and so are this plugin's own commands.
export function skillCatalog(commands: readonly CommandLike[], ownPlugin: string): SkillEntry[] {
  return commands
    .filter(command => command.source !== 'builtin' && command.source !== 'mcp' && command.plugin !== ownPlugin)
    .map(command => ({
      name: command.name,
      description: command.description.replace(/\s+/g, ' ').trim().slice(0, DESCRIPTION_ROOM),
      origin: command.plugin ?? command.source,
    }))
    .sort((left, right) => left.origin.localeCompare(right.origin) || left.name.localeCompare(right.name))
}

// The text the classifier reads: the catalog, then the request.
export function classifierText(catalog: readonly SkillEntry[], request: string): string {
  const lines = catalog.map(skill => `- ${skill.name}: ${skill.description}`)
  return [
    'Skills available in this Claude Code session:',
    ...lines,
    '',
    `Pick the one skill whose purpose matches this request, or "${NO_SKILL}" when no skill clearly fits.`,
    '',
    `Request from the user: ${request}`,
  ].join('\n')
}

export function classifierLabels(catalog: readonly SkillEntry[]): string[] {
  return [NO_SKILL, ...catalog.map(skill => skill.name)]
}

// The hint for a classifier answer, or null when no skill fits.
export function hintFor(label: string | undefined, catalog: readonly SkillEntry[], request: string, at: number): SkillHint | null {
  if (label === undefined || label === NO_SKILL) return null
  const skill = catalog.find(entry => entry.name === label)
  if (!skill) return null
  return { name: skill.name, description: skill.description, request: request.slice(0, 120), at }
}

// Short enough for one toast line; the /skill-hints pane has the description.
export function hintToast(hint: SkillHint): string {
  return `Skill that fits: /${hint.name}`
}

// The catalog grouped by where each skill comes from, for the /skill-hints pane.
export function groupByOrigin(catalog: readonly SkillEntry[]): { origin: string; skills: SkillEntry[] }[] {
  const groups = new Map<string, SkillEntry[]>()
  for (const skill of catalog) groups.set(skill.origin, [...(groups.get(skill.origin) ?? []), skill])
  return [...groups.entries()].map(([origin, skills]) => ({ origin, skills }))
}
