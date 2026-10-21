import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { hintText, indexNote, match, parseNote, type NoteTerms } from './match'

const folder = atom({ plugin: 'memory-hints', key: 'folder' } as const, '')
const hinted = atom({ plugin: 'memory-hints', key: 'hinted' } as const, [] as string[])

const LIMIT = 2
const MIN_TERMS = 2

export function scoreOption(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

// Prompts without an auto-memory index after which a session stops asking for the breakdown.
const MAX_MISSES = 3

// The folder of the session's auto-memory index, from the context breakdown.
async function memoryFolder($: EngineInterface): Promise<string> {
  const known = await read($, folder)
  if (known) return known
  const usage = await $.session.usage({ breakdown: 'summary' })
  const index = usage.context.breakdown?.memoryFiles.find(file => file.type === 'AutoMem' && /(^|[\\/])MEMORY\.md$/.test(file.path))?.path
  // Not cached when absent, so a breakdown taken before the index loaded is tried again on the next prompt.
  if (!index) return ''
  const found = index.replace(/[\\/][^\\/]*$/, '')
  await update($, folder, () => found)
  return found
}

type NoteCache = Map<string, { mtimeMs: number; entry: NoteTerms | undefined }>

// The notes in the folder. A linked note's time comes from the file it leads to.
async function notesIn($: EngineInterface, dir: string, cache: NoteCache): Promise<NoteTerms[]> {
  const files = (await $.fs.list(dir)).filter(file => file.name.endsWith('.md') && file.name !== 'MEMORY.md')
  const notes = await Promise.all(files.map(async file => {
    const path = `${dir}/${file.name}`
    const mtimeMs = file.isLink ? await $.fs.stat(path).then(stat => stat.kind === 'file' ? stat.mtimeMs : -1, () => -1) : file.kind === 'file' ? file.mtimeMs : -1
    if (mtimeMs < 0) return undefined
    let cached = cache.get(path)
    if (cached === undefined || cached.mtimeMs !== mtimeMs) {
      // An unreadable note is skipped until it changes, so it does not hide the others.
      const text = await $.fs.read(path).catch(() => undefined)
      const note = text === undefined ? undefined : parseNote(path, text)
      cached = { mtimeMs, entry: note && indexNote(note) }
      cache.set(path, cached)
    }
    return cached.entry
  }))
  return notes.filter(note => note !== undefined)
}

export const register: Register = (on, options) => {
  const minScore = scoreOption(options.minScore, 8)
  // Parsed notes by path, kept across prompts and read again when the file's mtime changes.
  const cache: NoteCache = new Map()
  let misses = 0

  on('prompt.submit', async ($, e, next) => {
    // Not 'sdk': a -p run or an eval batch would get hints nobody sees.
    const isUserRequest = ['composer', 'bridge'].includes(e.origin.kind) && e.command === undefined && e.isMeta === undefined
    if (!isUserRequest || misses >= MAX_MISSES) return next(e)
    try {
      const dir = await memoryFolder($)
      if (!dir) {
        misses++
        return next(e)
      }
      // Matched against every note, so a word's rarity does not change as notes are hinted.
      const notes = await notesIn($, dir, cache)
      const candidates = match(e.text, notes, { minScore, minTerms: MIN_TERMS, limit: notes.length })
      if (candidates.length === 0) return next(e)
      // Picked inside the update, so two prompts in flight never hint the same note.
      let hits: typeof candidates = []
      await update($, hinted, previous => {
        hits = candidates.filter(hit => !previous.includes(hit.note.path)).slice(0, LIMIT)
        return [...previous, ...hits.map(hit => hit.note.path)]
      })
      if (hits.length === 0) return next(e)
      return next({ ...e, context: [...(e.context ?? []), hintText(hits)] })
    } catch (error) {
      // A folder that moved is looked up again on the next prompt.
      await update($, folder, () => '').catch(() => undefined)
      $.ui.toast(`memory-hints: ${error instanceof Error ? error.message : String(error)}`)
      return next(e)
    }
  })

  // /clear ends the session but not the process, and no session.start follows it.
  on('session.end', async ($, e, next) => {
    misses = 0
    await update($, hinted, () => []).catch(() => undefined)
    await update($, folder, () => '').catch(() => undefined)
    return next(e)
  })
}
