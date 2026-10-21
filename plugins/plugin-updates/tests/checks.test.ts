import { describe, expect, test } from 'claude-code/testing'
import { httpsUrl, marketplaceRepos, mirrorDir, parseInstalls, parseSourceFile, safePath, safeRef, signature, statusText, type Report } from '../hooks/checks'

describe('input from marketplace files', () => {
  test('accepts GitHub repos and plain https URLs', () => {
    expect(httpsUrl({ source: 'github', repo: 'owner/repo' })).toBe('https://github.com/owner/repo.git')
    expect(httpsUrl({ source: 'url', url: 'https://gitlab.example.com/group/tool.git' })).toBe('https://gitlab.example.com/group/tool.git')
    expect(httpsUrl({ source: 'git-subdir', url: 'owner/mono' })).toBe('https://github.com/owner/mono.git')
  })

  test('refuses what git could read as an option or another transport', () => {
    expect(httpsUrl({ source: 'url', url: '--upload-pack=touch /tmp/x' })).toBeUndefined()
    expect(httpsUrl({ source: 'url', url: 'ext::sh -c touch% /tmp/x' })).toBeUndefined()
    expect(httpsUrl({ source: 'url', url: 'file:///etc' })).toBeUndefined()
    expect(httpsUrl({ source: 'github', repo: '-x/repo; rm' })).toBeUndefined()
    expect(safeRef('--output=/tmp/x')).toBeUndefined()
    expect(safeRef('main..HEAD')).toBeUndefined()
    expect(safeRef('v1.2.0')).toBe('v1.2.0')
    expect(safePath('../outside')).toBeUndefined()
    expect(safePath('-p')).toBeUndefined()
    expect(safePath('./')).toBe('')
    expect(safePath('./plugins/codex')).toBe('plugins/codex')
  })

  test('mirror folders stay under the cache root', () => {
    expect(mirrorDir('/c', 'https://github.com/owner/repo.git')).toBe('/c/github.com/owner/repo.git')
    expect(mirrorDir('/c', 'https://host/a/../../b')).toBe('/c/host/a/b.git')
  })

  test('marketplaces that are not git repositories are reported, not fetched', () => {
    const repos = marketplaceRepos(JSON.stringify({
      hud: { source: { source: 'github', repo: 'owner/hud' } },
      local: { source: { source: 'directory', path: '/x' } },
    }))
    expect(repos.get('hud')).toEqual({ url: 'https://github.com/owner/hud.git', ref: undefined, file: '.claude-plugin/marketplace.json' })
    expect(typeof repos.get('local')).toBe('string')
  })

  test('one install per distinct commit, labeled by scope only when they differ', () => {
    const installs = parseInstalls(JSON.stringify({
      plugins: {
        'hud@hud': [
          { scope: 'project', projectPath: '/p', version: '0.1.0', gitCommitSha: '30e1dfe46ad7b9a39ca2a4df7c735aaa33a90fd9' },
          { scope: 'user', version: '0.1.0', gitCommitSha: '30e1dfe46ad7b9a39ca2a4df7c735aaa33a90fd9' },
        ],
        'tool@market': [
          { scope: 'user', version: '1.0.0', gitCommitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
          { scope: 'local', projectPath: '/q', version: '1.0.1', gitCommitSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
        ],
      },
    }))
    expect(installs.map(install => [install.key, install.where])).toEqual([
      ['hud@hud', ''],
      ['tool@market', 'user scope'],
      ['tool@market', 'local scope /q'],
    ])
  })
})

describe('SOURCE.txt of a copied skill', () => {
  test('reads the URL, commit and copied paths', () => {
    const skill = parseSourceFile('humanizer', 'Source: https://github.com/blader/humanizer (commit 225a6f3), copied.\nPath: SKILL.md LICENSE\n')
    expect(skill).toEqual({ name: 'humanizer', url: 'https://github.com/blader/humanizer.git', commit: '225a6f3', paths: ['SKILL.md', 'LICENSE'] })
  })

  test('without a Path line the whole repository counts', () => {
    expect(parseSourceFile('x', 'Source: https://github.com/o/r (commit c1c8a8c)')?.paths).toEqual([])
  })

  test('a path leaving the repository rejects the file', () => {
    expect(parseSourceFile('x', 'Source: https://github.com/o/r (commit c1c8a8c)\nPath: ../../etc')).toBeUndefined()
  })
})

describe('what the person sees', () => {
  const report: Report = {
    checkedAt: 0,
    findings: [
      { name: 'claude-hud@claude-hud', kind: 'plugin', status: 'behind', behind: 537, commits: ['3e4e6b4 2026-10-21 Release'] },
      { name: 'codex@openai-codex', kind: 'plugin', status: 'current', behind: 0, commits: [] },
      { name: 'lsp@official', kind: 'plugin', status: 'behind', behind: 0, commits: [], upstream: 'version 1.0.0 → 1.1.0' },
    ],
  }

  test('the status line names only what is behind', () => {
    expect(statusText(report)).toBe('updates: claude-hud 537, lsp new version')
    expect(statusText({ checkedAt: 0, findings: [report.findings[1]!] })).toBeUndefined()
  })

  test('the toast signature changes with a new upstream commit only', () => {
    const later: Report = { ...report, checkedAt: 1 }
    expect(signature(later)).toBe(signature(report))
    const news: Report = { ...report, findings: [{ ...report.findings[0]!, behind: 538, commits: ['9f00000 2026-10-22 Next'] }, ...report.findings.slice(1)] }
    expect(signature(news)).not.toBe(signature(report))
  })
})
