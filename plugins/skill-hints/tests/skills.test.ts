import { describe, expect, test } from 'claude-code/testing'
import { NO_SKILL, age, classifierLabels, classifierText, filterSkills, groupByOrigin, hiddenNames, hintFor, hintToast, promptWithSkill, shortName, skillCatalog, suggestable } from '../hooks/skills'

const COMMANDS = [
  { name: 'clear', description: 'Clear the conversation', source: 'builtin' },
  { name: 'mattpocock-skills:implement', description: 'Build a ticket   from a spec', source: 'plugin', plugin: 'mattpocock-skills' },
  { name: 'humanizer', description: 'Rewrite AI-sounding text', source: 'user' },
  { name: 'skills', description: 'List the installed skills', source: 'plugin', plugin: 'skill-hints' },
  { name: 'mcp__docs__query', description: 'Query docs', source: 'mcp' },
]

describe('skillCatalog', () => {
  test('keeps user and plugin skills, drops built-in, MCP and own commands', () => {
    const catalog = skillCatalog(COMMANDS, 'skill-hints')
    expect(catalog.map(skill => skill.name)).toEqual(['mattpocock-skills:implement', 'humanizer'])
  })

  test('collapses whitespace and records the origin', () => {
    const [implement] = skillCatalog(COMMANDS, 'skill-hints')
    expect(implement?.description).toBe('Build a ticket from a spec')
    expect(implement?.origin).toBe('mattpocock-skills')
  })
})

describe('classifier input', () => {
  const catalog = skillCatalog(COMMANDS, 'skill-hints')

  test('the text lists every skill and the request', () => {
    const text = classifierText(catalog, 'build issue 1')
    expect(text).toContain('- humanizer: Rewrite AI-sounding text')
    expect(text).toContain('Request from the user: build issue 1')
  })

  test('the labels start with the no-skill label', () => {
    expect(classifierLabels(catalog)).toEqual([NO_SKILL, 'mattpocock-skills:implement', 'humanizer'])
  })
})

describe('hintFor', () => {
  const catalog = skillCatalog(COMMANDS, 'skill-hints')

  test('a known label gives a hint', () => {
    const hint = hintFor('humanizer', catalog, 'make this sound less robotic', 5)
    expect(hint).toEqual({ name: 'humanizer', description: 'Rewrite AI-sounding text', request: 'make this sound less robotic', at: 5 })
  })

  test('no skill, no answer or an unknown label gives no hint', () => {
    expect(hintFor(NO_SKILL, catalog, 'x', 1)).toBeNull()
    expect(hintFor(undefined, catalog, 'x', 1)).toBeNull()
    expect(hintFor('clear', catalog, 'x', 1)).toBeNull()
  })

  test('the toast names the command that runs the skill', () => {
    const hint = hintFor('mattpocock-skills:implement', catalog, 'x', 1)
    expect(hint && hintToast(hint)).toBe('Skill that fits: /mattpocock-skills:implement')
  })
})

describe('groupByOrigin', () => {
  test('groups in catalog order', () => {
    const groups = groupByOrigin(skillCatalog(COMMANDS, 'skill-hints'))
    expect(groups.map(group => group.origin)).toEqual(['mattpocock-skills', 'user'])
  })
})

describe('names and hidden skills', () => {
  test('shortName drops the plugin prefix', () => {
    expect(shortName('mattpocock-skills:implement')).toBe('implement')
    expect(shortName('humanizer')).toBe('humanizer')
  })

  test('hidden skills are never suggested, by full or short name', () => {
    const catalog = [
      { name: 'mattpocock-skills:ask-matt', description: 'Routes to a skill', origin: 'mattpocock-skills' },
      { name: 'humanizer', description: 'Rewrite text', origin: 'user' },
    ]
    expect(suggestable(catalog, hiddenNames(' ask-matt, ')).map(skill => skill.name)).toEqual(['humanizer'])
    expect(suggestable(catalog, hiddenNames('mattpocock-skills:ask-matt')).map(skill => skill.name)).toEqual(['humanizer'])
    expect(suggestable(catalog, hiddenNames(undefined))).toHaveLength(2)
  })
})

describe('pane helpers', () => {
  test('the filter matches every word in name, description or origin', () => {
    const catalog = skillCatalog(COMMANDS, 'skill-hints')
    expect(filterSkills(catalog, '').length).toBe(catalog.length)
    expect(filterSkills(catalog, 'REWRITE text').map(skill => skill.name)).toEqual(['humanizer'])
    expect(filterSkills(catalog, 'mattpocock').map(skill => skill.name)).toEqual(['mattpocock-skills:implement'])
    expect(filterSkills(catalog, 'rewrite spec')).toEqual([])
  })

  test('the skill command goes in front of the draft', () => {
    const commands = ['humanizer', 'tdd']
    expect(promptWithSkill('', 'humanizer', commands)).toBe('/humanizer ')
    expect(promptWithSkill('fix this text', 'humanizer', commands)).toBe('/humanizer fix this text')
    expect(promptWithSkill('/tdd fix this', 'humanizer', commands)).toBe('/humanizer fix this')
    expect(promptWithSkill('/home/app.log shows a crash', 'humanizer', commands)).toBe('/humanizer /home/app.log shows a crash')
  })

  test('age names the largest whole unit', () => {
    expect(age(0, 30_000)).toBe('just now')
    expect(age(0, 5 * 60_000)).toBe('5m ago')
    expect(age(0, 3 * 3_600_000)).toBe('3h ago')
  })
})
