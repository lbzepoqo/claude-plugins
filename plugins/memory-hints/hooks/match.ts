// Pure matching code, kept free of imports so it runs outside the engine too.

export type Note = { path: string; name: string; description: string }
export type NoteTerms = { note: Note; terms: Set<string> }
export type Hit = { note: Note; score: number; matched: string[] }

const STOPWORDS = new Set(`
a about above after again against all also am an and any are as at be because been before being below
between both but by can could did do does doing done down during each few for from further had has have
having he her here hers him his how i if in into is it its itself just let me more most my no nor not now
of off on once only or other our out over own same she should so some such than that the their them then
there these they this those through to too under until up us very was we were what when where which while
who whom why will with would you your yours yes ok okay please thanks thank hi hey go going get got make
made use used using want need like see look check now next new also still one two way thing things
lets let's done work working sure think know yeah
`.split(/\s+/).filter(Boolean))

// A crude stem: enough to meet "commits" with "commit", "pasted" with "paste" and "settings" with "setting".
function stem(word: string): string {
  let base = word
  if (base.length > 4 && base.endsWith('es') && !base.endsWith('ses')) base = base.slice(0, -2)
  else if (base.length > 3 && base.endsWith('s') && !base.endsWith('ss')) base = base.slice(0, -1)
  if (base.length > 5 && base.endsWith('ing')) base = base.slice(0, -3)
  else if (base.length > 4 && base.endsWith('ed')) base = base.slice(0, -2)
  return base.length > 3 && base.endsWith('e') ? base.slice(0, -1) : base
}

const STOPWORD_STEMS = new Set([...STOPWORDS].map(stem))

export function terms(text: string): Set<string> {
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 2 && !STOPWORDS.has(word) && !/^\d+$/.test(word))
  return new Set(words.map(stem).filter(word => !STOPWORD_STEMS.has(word)))
}

// The `name` and `description` of a note's frontmatter, or undefined when it has none.
export function parseNote(path: string, text: string): Note | undefined {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1]
  if (block === undefined) return undefined
  const field = (key: string) => {
    const value = new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(block)?.[1]?.trim() ?? ''
    return value.replace(/^(["'])(.*)\1$/, '$2')
  }
  const name = field('name')
  const description = field('description')
  return name || description ? { path, name, description } : undefined
}

export function indexNote(note: Note): NoteTerms {
  return { note, terms: terms(`${note.name.replace(/[-_]/g, ' ')} ${note.description}`) }
}

// Only the words the person typed: pasted content and fenced blocks (logs, exports) name many
// records and fields and would match notes on vocabulary alone.
export function ownWords(prompt: string): string {
  return prompt.replace(/<pasted_content( id="[^"]*")?>[\s\S]*?<\/pasted_content\1>/g, ' ').replace(/```[\s\S]*?```/g, ' ')
}

// The notes whose name and description share the rarest words with the prompt. A word scores the
// log of how rare it is among the notes, so a word every note holds counts for nothing.
export function match(prompt: string, notes: readonly NoteTerms[], options: { minScore: number; minTerms: number; limit: number }): Hit[] {
  const wanted = terms(ownWords(prompt))
  if (wanted.size === 0 || notes.length === 0) return []
  const counts = new Map<string, number>()
  for (const { terms: noteTerms } of notes) for (const term of noteTerms) if (wanted.has(term)) counts.set(term, (counts.get(term) ?? 0) + 1)
  const hits: Hit[] = []
  for (const { note, terms: noteTerms } of notes) {
    const matched = [...wanted].filter(term => noteTerms.has(term))
    const score = matched.reduce((sum, term) => sum + Math.log(notes.length / (counts.get(term) ?? 1)), 0)
    if (matched.length >= options.minTerms && score >= options.minScore) hits.push({ note, score, matched })
  }
  return hits.sort((left, right) => right.score - left.score).slice(0, options.limit)
}

export function hintText(hits: readonly Hit[]): string {
  return [
    'memory-hints: these saved memory notes match words in this request. Before acting, Read each note whose description fits the request; skip the ones that do not.',
    'When a note changes what you do, say so in one line: (memory: <name>).',
    ...hits.map(({ note }) => `- ${note.path} (${note.name}): ${note.description}`),
  ].join('\n')
}
