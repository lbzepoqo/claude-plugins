import { expect, test } from 'claude-code/testing'

import { hintText, indexNote, match, ownWords, parseNote, terms } from '../hooks/match'
import { scoreOption } from '../hooks/register'

const NOTES = [
  parseNote('/m/deploy-by-paste.md', '---\nname: deploy-by-paste\ndescription: "Script changes are deployed by pasting the body into the editor, never by importing XML"\nmetadata:\n  type: feedback\n---\n\nBody'),
  parseNote('/m/release-train.md', "---\nname: release-train\ndescription: 'Releases ship every second Tuesday; the branch freezes the Friday before'\n---\n"),
  parseNote('/m/review-copies.md', '---\nname: review-copies\ndescription: Exported XML files in the repo are review copies, never imported back\n---\n'),
  parseNote('/m/editor-format.md', '---\nname: editor-format\ndescription: The editor reformats a script on paste, so diffs show whitespace changes\n---\n'),
].map(note => indexNote(note!))

const options = { minScore: 2, minTerms: 2, limit: 2 }

test('frontmatter name and description are read, quoted or not', () => {
  expect(parseNote('/m/a.md', '---\nname: a\ndescription: "Quoted text"\n---\n')).toEqual({ path: '/m/a.md', name: 'a', description: 'Quoted text' })
  expect(parseNote('/m/b.md', 'No frontmatter here')).toBe(undefined)
})

test('words are lowercased, stemmed, and stopwords and numbers dropped', () => {
  expect([...terms('The Releases are shipping in 2026')]).toEqual(['releas', 'shipp'])
  expect([...terms('settings setting')]).toEqual(['sett'])
  expect([...terms('it needs checking')]).toEqual([])
})

test('a prompt sharing rare words hints the matching note first', () => {
  const hits = match('when is the next release, does the branch freeze?', NOTES, options)
  expect(hits.map(hit => hit.note.name)).toEqual(['release-train'])
})

test('one shared word is not enough, and common words weigh less than rare ones', () => {
  expect(match('which release?', NOTES, options)).toEqual([])
  const hits = match('editor whitespace script', NOTES, { ...options, minScore: 1, limit: 4 })
  expect(hits.map(hit => hit.note.name)).toEqual(['editor-format', 'deploy-by-paste'])
})

test('pasted content and fenced blocks are not matched', () => {
  const pasted = 'here you go <pasted_content id="ab12">release branch freeze tuesday</pasted_content id="ab12"> and ```\nrelease branch\n```'
  expect(ownWords(pasted).includes('release')).toBe(false)
  expect(match(pasted, NOTES, options)).toEqual([])
  const nested = '<pasted_content id="a">log <pasted_content id="b">x</pasted_content id="b"> release branch</pasted_content id="a">'
  expect(ownWords(nested).includes('release')).toBe(false)
  expect(ownWords('wrap it in ``` please, then fix the release branch')).toContain('release branch')
})

test('the hint names each note path and asks for a cite', () => {
  const text = hintText(match('when is the next release, does the branch freeze?', NOTES, options))
  expect(text).toContain('- /m/release-train.md (release-train): Releases ship every second Tuesday')
  expect(text).toContain('(memory: <name>)')
})

test('the score option falls back on anything but a positive number', () => {
  expect(scoreOption('12', 8)).toBe(12)
  expect(scoreOption(-1, 8)).toBe(8)
  expect(scoreOption(undefined, 8)).toBe(8)
})
