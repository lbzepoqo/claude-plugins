import { atom, read, update } from 'claude-code'
import type { EngineInterface, PromptSubmitInput, Register } from 'claude-code'

import type { SkillEntry, SkillHint } from '../types'
import { classifierLabels, classifierText, groupByOrigin, hintFor, hintToast, shortName, skillCatalog, suggestable } from './skills'

const PANE = 'skill-hints'
const skills = atom({ plugin: 'skill-hints', key: 'skills' } as const, [] as SkillEntry[])
const hint = atom({ plugin: 'skill-hints', key: 'hint' } as const, null as SkillHint | null)

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

async function suggestSkill($: EngineInterface, request: string) {
  const match = ++latestMatch
  const catalog = suggestable(await refreshSkills($))
  const label = catalog.length === 0 ? undefined : await $.model.classify(classifierText(catalog, request), classifierLabels(catalog), { model: 'haiku' })
  const matched = hintFor(label, catalog, request, await $.clock.now())
  if (match !== latestMatch) return
  // The status line shows the hint for the latest prompt only, so a prompt with no match clears it.
  await update($, hint, () => matched)
  $.ui.status(matched ? `skill: ${shortName(matched.name)}` : undefined)
  if (matched) $.ui.toast(hintToast(matched), { timeoutMs: 12_000 })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'skill-hints', description: 'List the installed skills and the one that fits your last prompt' })
    void refreshSkills($).catch(() => undefined)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    // The match runs beside the turn, so a slow or failed model call never holds the prompt.
    if (isTypedRequest(e)) void suggestSkill($, e.text.trim()).catch(() => undefined)
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
    await $.ui.open({ id: PANE, title: 'Skills', focus: true, closeOnEscape: true })
    return { text: 'Skills pane opened (Esc closes it).' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const catalog = await read($, skills)
    const matched = await read($, hint)
    return (
      <Box flexDirection="column" gap={1}>
        {matched && (
          <Text>
            <Text color="cyan" bold>Fits your last prompt: </Text>
            {shortName(matched.name)}
            <Text dimColor> ({matched.description})</Text>
          </Text>
        )}
        {catalog.length === 0 && <Text dimColor>No skills or plugin commands are installed.</Text>}
        {groupByOrigin(catalog).map(group => (
          <Box key={group.origin} flexDirection="column">
            <Text color="blue" bold>{group.origin}</Text>
            {group.skills.map(skill => (
              <Text key={skill.name} wrap="truncate-end">
                <Text color={matched?.name === skill.name ? 'cyan' : undefined}>{shortName(skill.name)}</Text>
                <Text dimColor> {skill.description}</Text>
              </Text>
            ))}
          </Box>
        ))}
      </Box>
    )
  })
}
