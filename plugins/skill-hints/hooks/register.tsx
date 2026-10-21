import { atom, read, update } from 'claude-code'
import type { EngineInterface, PromptSubmitInput, Register } from 'claude-code'

import type { SkillEntry, SkillHint } from '../types'
import {
  age,
  classifierLabels,
  classifierText,
  filterSkills,
  groupByOrigin,
  hiddenNames,
  hintFor,
  hintToast,
  promptWithSkill,
  shortName,
  skillCatalog,
  suggestable,
} from './skills'

const PANE = 'skill-hints'
const skills = atom({ plugin: 'skill-hints', key: 'skills' } as const, [] as SkillEntry[])
const hint = atom({ plugin: 'skill-hints', key: 'hint' } as const, null as SkillHint | null)
const filter = atom({ plugin: 'skill-hints', key: 'filter' } as const, '')

// The widest name column in the pane; longer names are cut so the descriptions stay aligned.
const NAME_ROOM = 24

// Shorter prompts ("yes", "go on") answer the model rather than ask for something new.
const MIN_PROMPT_LENGTH = 15

// A request the person typed: not a slash command, a reply to the model, or a prompt the engine or a task sent.
export function isTypedRequest(e: Pick<PromptSubmitInput, 'text' | 'origin' | 'command' | 'isMeta'>): boolean {
  const text = e.text.trim()
  return e.origin.kind === 'composer' && !e.command && !e.isMeta && !text.startsWith('/') && text.length >= MIN_PROMPT_LENGTH
}

// Plugins register their commands in their own session.start, so the catalog is read again before each match.
async function refreshSkills($: EngineInterface) {
  const catalog = skillCatalog(await $.command.list(), $.plugin.name)
  await update($, skills, () => catalog)
  return catalog
}

// Each match is numbered, so a slow answer for an older prompt never replaces the hint for a newer one.
let latestMatch = 0

async function suggestSkill($: EngineInterface, request: string, hidden: readonly string[]) {
  const match = ++latestMatch
  const catalog = suggestable(await refreshSkills($), hidden)
  const label = catalog.length === 0 ? undefined : await $.model.classify(classifierText(catalog, request), classifierLabels(catalog), { model: 'haiku' })
  const matched = hintFor(label, catalog, request, await $.clock.now())
  if (match !== latestMatch) return
  // The status line shows the hint for the latest prompt only, so a prompt with no match clears it.
  await update($, hint, () => matched)
  $.ui.status(matched ? `skill: ${shortName(matched.name)}` : undefined)
  if (matched) $.ui.toast(hintToast(matched), { timeoutMs: 12_000 })
}

// Puts the skill's command in front of the draft and closes the pane, so the person can finish the prompt.
async function useSkill($: EngineInterface, name: string) {
  const draft = (await $.prompt.read()).text
  const commands = (await read($, skills)).map(skill => skill.name)
  const filled = await $.prompt.fill({ text: promptWithSkill(draft, name, commands) })
  if (filled.isFilled) await $.ui.close({ id: PANE })
  else $.ui.toast(`The prompt box is not available here; type /${name} instead.`)
}

// Cut by code point, so an emoji is never split.
function clip(text: string, room: number): string {
  const chars = Array.from(text)
  if (room < 2) return ''
  return chars.length <= room ? text : `${chars.slice(0, room - 1).join('')}…`
}

export const register: Register = (on, options) => {
  const hidden = hiddenNames(options.hiddenSkills)

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'skill-hints', description: 'List the installed skills and the one that fits your last prompt' })
    void refreshSkills($).catch(() => undefined)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    // The match runs beside the turn, so a slow or failed model call never holds the prompt.
    if (isTypedRequest(e)) void suggestSkill($, e.text.trim(), hidden).catch(() => undefined)
    return next(e)
  })

  // A hint from before /clear or a resume describes a prompt the new session never saw.
  on('session.end', async ($, e, next) => {
    $.ui.status(undefined)
    await update($, hint, () => null).catch(() => undefined)
    return next(e)
  })

  on('command.run', { command: 'skill-hints' }, async $ => {
    await refreshSkills($)
    await update($, filter, () => '')
    await $.ui.open({ id: PANE, title: 'Skills', focus: true, closeOnEscape: true })
    return { text: 'Skills pane opened (Esc closes it).' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Button } = elements
    const Input = 'Input' in elements ? elements.Input : undefined
    const catalog = await read($, skills)
    const matched = await read($, hint)
    const query = await read($, filter)
    const shown = filterSkills(catalog, query)
    const nameWidth = Math.min(NAME_ROOM, Math.max(0, ...catalog.map(skill => shortName(skill.name).length)))
    const descriptionRoom = e.props.bodyColumns - nameWidth - 2
    const now = await $.clock.now()

    return (
      <Box flexDirection="column" gap={1}>
        {matched && (
          <Box flexDirection="column">
            <Text color="cyan" bold>Fits your last prompt</Text>
            <Text wrap="truncate-end">
              <Text bold>/{matched.name}</Text>
              <Text dimColor> {matched.description}</Text>
            </Text>
            <Text dimColor wrap="truncate-end">"{matched.request}" · {age(matched.at, now)}</Text>
            <Box>
              <Button key="use-hint" variant="primary" onPress={() => void useSkill($, matched.name).catch(() => undefined)}>
                Put /{shortName(matched.name)} in the prompt
              </Button>
            </Box>
          </Box>
        )}
        {Input && catalog.length > 0 && (
          <Input
            key="filter"
            value={query}
            placeholder="Filter skills"
            submitLabel="use first"
            autoFocus
            onInput={value => void update($, filter, () => value).catch(() => undefined)}
            onSubmit={value => {
              // With nothing typed, Enter takes the suggested skill on top, never the first in the list.
              const chosen = value.trim() ? filterSkills(catalog, value)[0]?.name : matched?.name
              if (chosen) void useSkill($, chosen).catch(() => undefined)
            }}
          />
        )}
        {catalog.length === 0 && <Text dimColor>No skills or plugin commands are installed.</Text>}
        {catalog.length > 0 && shown.length === 0 && <Text dimColor>No skill matches "{query}".</Text>}
        {groupByOrigin(shown).map(group => (
          <Box key={group.origin} flexDirection="column">
            <Text color="blue" bold>
              {group.origin} <Text dimColor>({group.skills.length})</Text>
            </Text>
            {group.skills.map(skill => (
              <Button key={skill.name} plain onPress={() => void useSkill($, skill.name).catch(() => undefined)}>
                <Text color={matched?.name === skill.name ? 'cyan' : undefined}>{clip(shortName(skill.name), nameWidth).padEnd(nameWidth)}</Text>
                <Text dimColor>  {clip(skill.description, descriptionRoom)}</Text>
              </Button>
            ))}
          </Box>
        ))}
        {e.surface === 'terminal' && (
          <Text dimColor>Type to filter, Enter uses the first match. Tab to a skill, Enter puts it in the prompt. Esc closes.</Text>
        )}
      </Box>
    )
  })
}
