// Tests of scripts/release.ts and scripts/release-notes.ts: `pnpm test:scripts`.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { releaseNotes } from './release-notes.ts'
import {
  compareVersions,
  parseCommit,
  prependChangelog,
  release,
  renderChangelog,
  setPackageVersion,
  type ReleaseOptions,
} from './release.ts'

const temps: string[] = []
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})

const git = (repo: string, ...args: string[]) =>
  execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: 'pipe' }).trim()
const read = (repo: string, path: string) => readFileSync(join(repo, path), 'utf8')
const version = (repo: string) =>
  (JSON.parse(read(repo, 'package.json')) as { version: string }).version

const CHANGELOG = '# Changelog\n\n## 1.0.0\n\nFirst release.\n'

/** A scratch repository like gbaudio before its first release: 1.0.0 written by hand, no tag. */
function fixture(): string {
  const repo = mkdtempSync(join(tmpdir(), 'gbaudio-release-'))
  temps.push(repo)
  writeFileSync(join(repo, 'package.json'), '{\n  "name": "gbaudio",\n  "version": "1.0.0"\n}\n')
  writeFileSync(join(repo, 'CHANGELOG.md'), CHANGELOG)
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'config', 'user.name', 'Test')
  git(repo, 'config', 'user.email', 'test@localhost')
  git(repo, 'config', 'commit.gpgsign', 'false')
  git(repo, 'config', 'tag.gpgsign', 'false')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'feat: gbaudio 1.0.0')
  return repo
}

function commit(repo: string, file: string, message: string): void {
  writeFileSync(join(repo, file), `${message}\n`)
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', message)
}

/** Release options that record the output and the checks run instead of running `pnpm check`. */
function recorder(options: ReleaseOptions = {}) {
  const lines: string[] = []
  const checks: string[] = []
  return {
    lines,
    checks,
    options: {
      date: '2026-10-21',
      log: (line: string) => lines.push(line),
      check: (repo: string) => checks.push(repo),
      ...options,
    } satisfies ReleaseOptions,
  }
}

describe('helpers', () => {
  it('compares semver, prereleases below their release', () => {
    assert.equal(compareVersions('1.0.1', '1.0.0'), 1)
    assert.equal(compareVersions('1.10.0', '1.9.0'), 1)
    assert.equal(compareVersions('1.2.3', '1.2.3'), 0)
    assert.equal(compareVersions('2.0.0-rc.1', '2.0.0'), -1)
    assert.equal(compareVersions('2.0.0-rc.1', '1.9.9'), 1)
  })

  it('parses Conventional Commits, breaking ones included', () => {
    assert.deepEqual(parseCommit('abc', 'fix(wav): loop points'), {
      hash: 'abc',
      type: 'fix',
      scope: 'wav',
      subject: 'loop points',
      breaking: false,
    })
    assert.equal(parseCommit('abc', 'feat!: new API')?.breaking, true)
    assert.equal(parseCommit('abc', 'feat: x\n\nBREAKING CHANGE: y')?.breaking, true)
    assert.equal(parseCommit('abc', 'Merge branch main'), undefined)
  })

  it('renders the changelog section, or says there is nothing to list', () => {
    const commits = [
      parseCommit('a1', 'feat(compiler): loops')!,
      parseCommit('b2', 'fix: a click')!,
      parseCommit('c3', 'perf: mixing')!,
      parseCommit('d4', 'refactor!: rename Apu')!,
      parseCommit('e5', 'chore: deps')!,
    ]
    assert.equal(
      renderChangelog('1.1.0', '2026-10-21', commits),
      '## 1.1.0 (2026-10-21)\n\n' +
        '### Breaking changes\n\n- rename Apu (d4)\n\n' +
        '### Features\n\n- **compiler:** loops (a1)\n\n' +
        '### Fixes\n\n- a click (b2)\n\n' +
        '### Performance\n\n- mixing (c3)\n',
    )
    assert.equal(
      renderChangelog('1.0.1', '2026-10-21', [commits[4]!]),
      '## 1.0.1 (2026-10-21)\n\nNo user-facing changes.\n',
    )
  })

  it('prepends a section below the header and above the previous releases', () => {
    const section = '## 1.1.0 (2026-10-21)\n\nNo user-facing changes.\n'
    assert.equal(
      prependChangelog(CHANGELOG, section),
      `# Changelog\n\n${section}\n## 1.0.0\n\nFirst release.\n`,
    )
    assert.equal(prependChangelog(undefined, section), `# Changelog\n\n${section}`)
  })

  it('sets the package.json version, keeping its formatting', () => {
    const text = '{\n  "name": "gbaudio",\n  "version": "1.0.0",\n  "x": { "version": "1" }\n}\n'
    assert.equal(setPackageVersion(text, '1.1.0'), text.replace('"1.0.0"', '"1.1.0"'))
  })
})

describe('release notes', () => {
  const changelog = `# Changelog\n\n## 1.1.0 (2026-10-21)\n\n### Fixes\n\n- a click (b2)\n\n## 1.0.0\n\nFirst release.\n`

  it('is the version section without its heading, dated or not', () => {
    assert.equal(releaseNotes(changelog, '1.1.0'), '### Fixes\n\n- a click (b2)\n')
    assert.equal(releaseNotes(changelog, '1.0.0'), 'First release.\n')
    assert.equal(releaseNotes('## 1.0.1 (2026-10-22)\n', '1.0.1'), 'No notable changes.\n')
  })

  it('is undefined without a section for the version', () => {
    assert.equal(releaseNotes(changelog, '1.0'), undefined)
    assert.equal(releaseNotes(changelog, '2.0.0'), undefined)
  })
})

describe('release', () => {
  it('first release, --dry-run: reports the tag and the existing section, writes nothing', () => {
    const repo = fixture()
    const run = recorder({ dryRun: true })
    release(repo, '1.0.0', run.options)
    const output = run.lines.join('\n')
    assert.match(output, /dry run: first release 1\.0\.0/)
    assert.match(output, /tags HEAD as v1\.0\.0, without a commit/)
    assert.match(output, /## 1\.0\.0\n\nFirst release\./)
    assert.deepEqual(run.checks, [])
    assert.equal(git(repo, 'tag', '--list'), '')
    assert.equal(git(repo, 'status', '--porcelain'), '')
  })

  it('first release: runs the checks and tags HEAD, without a commit', () => {
    const repo = fixture()
    const head = git(repo, 'rev-parse', 'HEAD')
    const run = recorder()
    release(repo, '1.0.0', run.options)
    assert.deepEqual(run.checks, [repo])
    assert.equal(git(repo, 'rev-parse', 'HEAD'), head)
    assert.equal(git(repo, 'cat-file', '-t', 'v1.0.0'), 'tag')
    assert.equal(git(repo, 'rev-parse', 'v1.0.0^{commit}'), head)
    assert.equal(read(repo, 'CHANGELOG.md'), CHANGELOG)
    assert.match(run.lines.at(-1)!, /git push origin main v1\.0\.0$/)
  })

  it('later releases: --dry-run writes nothing, then a run bumps, commits and tags', () => {
    const repo = fixture()
    release(repo, '1.0.0', recorder().options)
    commit(repo, 'a.txt', 'feat(compiler): loop points')
    commit(repo, 'b.txt', 'fix: a click on note off')
    commit(repo, 'c.txt', 'chore: update deps')
    const head = git(repo, 'rev-parse', 'HEAD')

    const dry = recorder({ dryRun: true })
    release(repo, '1.1.0', dry.options)
    const output = dry.lines.join('\n')
    assert.match(output, /dry run: 1\.0\.0 -> 1\.1\.0/)
    assert.match(output, /## 1\.1\.0 \(2026-10-21\)/)
    assert.match(output, /- \*\*compiler:\*\* loop points \(\w+\)/)
    assert.doesNotMatch(output, /update deps|gbaudio 1\.0\.0/)
    assert.deepEqual(dry.checks, [])
    assert.equal(version(repo), '1.0.0')
    assert.equal(git(repo, 'rev-parse', 'HEAD'), head)
    assert.equal(git(repo, 'tag', '--list'), 'v1.0.0')

    const run = recorder()
    release(repo, '1.1.0', run.options)
    assert.deepEqual(run.checks, [repo])
    assert.equal(version(repo), '1.1.0')
    const changelog = read(repo, 'CHANGELOG.md')
    assert.match(changelog, /^# Changelog\n\n## 1\.1\.0 \(2026-10-21\)\n\n### Features\n/)
    assert.match(changelog, /### Fixes\n\n- a click on note off \(\w+\)\n\n## 1\.0\.0\n/)
    assert.equal(git(repo, 'log', '-1', '--format=%s'), 'chore(release): v1.1.0')
    assert.equal(git(repo, 'rev-parse', 'v1.1.0^{commit}'), git(repo, 'rev-parse', 'HEAD'))
    assert.equal(git(repo, 'status', '--porcelain'), '')

    // The next release lists only the commits after the last tag.
    commit(repo, 'd.txt', 'perf: mixing')
    const next = recorder({ dryRun: true })
    release(repo, '1.1.1', next.options)
    assert.match(next.lines.join('\n'), /### Performance\n\n- mixing/)
    assert.doesNotMatch(next.lines.join('\n'), /loop points/)
  })

  it('refuses bad versions, dirty trees, other branches and existing tags', () => {
    const repo = fixture()
    const run = recorder()
    assert.throws(() => release(repo, '1.1', run.options), /not a version: 1\.1/)
    writeFileSync(join(repo, 'CHANGELOG.md'), '# Changelog\n')
    assert.throws(() => release(repo, '1.0.0', run.options), /no "## 1\.0\.0" section/)
    git(repo, 'checkout', '-q', '--', 'CHANGELOG.md')
    writeFileSync(join(repo, 'wip.txt'), 'wip\n')
    assert.throws(() => release(repo, '1.0.0', run.options), /working tree has changes/)
    // A dry run warns instead.
    const dry = recorder({ dryRun: true })
    release(repo, '1.0.0', dry.options)
    assert.match(dry.lines.join('\n'), /warning: the working tree has changes/)
    rmSync(join(repo, 'wip.txt'))
    git(repo, 'checkout', '-q', '-b', 'topic')
    assert.throws(() => release(repo, '1.0.0', run.options), /made from main, not topic/)
    git(repo, 'checkout', '-q', 'main')
    git(repo, 'tag', 'v1.1.0')
    assert.throws(() => release(repo, '1.1.0', run.options), /tag v1\.1\.0 already exists/)
    git(repo, 'tag', '-d', 'v1.1.0')
    release(repo, '1.0.0', run.options)
    assert.throws(() => release(repo, '1.0.0', run.options), /not above the current version/)
    assert.throws(() => release(repo, '0.9.0', run.options), /not above the current version/)
    assert.equal(run.checks.length, 1)
  })

  it('writes nothing when the checks fail', () => {
    const repo = fixture()
    release(repo, '1.0.0', recorder().options)
    commit(repo, 'a.txt', 'fix: a click')
    const failing = recorder({
      check: () => {
        throw new Error('pnpm check failed')
      },
    })
    assert.throws(() => release(repo, '1.0.1', failing.options), /pnpm check failed/)
    assert.equal(version(repo), '1.0.0')
    assert.equal(git(repo, 'status', '--porcelain'), '')
    assert.equal(git(repo, 'tag', '--list'), 'v1.0.0')
  })
})
