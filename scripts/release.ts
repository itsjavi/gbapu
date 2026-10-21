// `pnpm release:version <x.y.z> [--dry-run]`: releases gbapu. On a clean `main` working tree it runs
// `pnpm check`, sets package.json's version, prepends the release's section to CHANGELOG.md from
// the Conventional Commits since the last `v*` tag, commits `chore(release): vX.Y.Z` and creates
// the annotated tag vX.Y.Z. It pushes nothing: pushing the tag runs .github/workflows/release.yml.
//
// The first release is written by hand: when package.json already has the requested version, no
// `v*` tag exists yet and CHANGELOG.md has that version's section, it only runs the checks and
// tags HEAD.
//
// `--dry-run` prints what a release would change and the changelog section, and writes nothing.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { changelogSection } from './release-notes.ts'

const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/

/** -1, 0 or 1 as semver `a` is lower than, equal to or higher than `b`. */
export function compareVersions(a: string, b: string): number {
  const pa = VERSION.exec(a)
  const pb = VERSION.exec(b)
  if (pa === null || pb === null) throw new Error(`not a version: ${pa === null ? a : b}`)
  for (let i = 1; i <= 3; i++) {
    const diff = Number(pa[i]) - Number(pb[i])
    if (diff !== 0) return Math.sign(diff)
  }
  if (pa[4] === pb[4]) return 0
  if (pa[4] === undefined) return 1
  if (pb[4] === undefined) return -1
  return pa[4] < pb[4] ? -1 : 1
}

export interface Commit {
  hash: string
  type: string
  scope?: string
  subject: string
  breaking: boolean
}

/** A Conventional Commit (`type(scope)!: subject`), or undefined for any other message. */
export function parseCommit(hash: string, message: string): Commit | undefined {
  const [header = '', ...body] = message.split('\n')
  const match = /^(\w+)(?:\(([^)]+)\))?(!)?: (.+)$/.exec(header.trim())
  if (match === null) return undefined
  const breaking = match[3] === '!' || body.some((line) => /^BREAKING[ -]CHANGE:/.test(line))
  return { hash, type: match[1]!, scope: match[2], subject: match[4]!, breaking }
}

const SECTIONS: [string, (commit: Commit) => boolean][] = [
  ['Breaking changes', (c) => c.breaking],
  ['Features', (c) => !c.breaking && c.type === 'feat'],
  ['Fixes', (c) => !c.breaking && c.type === 'fix'],
  ['Performance', (c) => !c.breaking && c.type === 'perf'],
]

/** The CHANGELOG.md section of a release: breaking changes, features, fixes and performance. */
export function renderChangelog(version: string, date: string, commits: Commit[]): string {
  const lines = [`## ${version} (${date})`, '']
  let listed = 0
  for (const [title, belongs] of SECTIONS) {
    const entries = commits.filter(belongs)
    if (entries.length === 0) continue
    lines.push(`### ${title}`, '')
    for (const c of entries) {
      lines.push(`- ${c.scope === undefined ? '' : `**${c.scope}:** `}${c.subject} (${c.hash})`)
    }
    lines.push('')
    listed += entries.length
  }
  if (listed === 0) lines.push('No user-facing changes.', '')
  return lines.join('\n')
}

/** `current` (a CHANGELOG.md, if any) with `section` above its previous releases. */
export function prependChangelog(current: string | undefined, section: string): string {
  const start = current?.search(/^## /m) ?? -1
  if (current === undefined || start === -1) {
    return `${current?.trimEnd() || '# Changelog'}\n\n${section}`
  }
  return `${current.slice(0, start)}${section}\n${current.slice(start)}`
}

/** `text` (a package.json) with its top-level version set, keeping the file's formatting. */
export function setPackageVersion(text: string, version: string): string {
  const next = text.replace(/^( {2}"version": )"[^"]*"/m, `$1"${version}"`)
  if (next === text) throw new Error('package.json has no top-level version')
  return next
}

function git(repo: string, args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: 'pipe' }).trimEnd()
}

/** The last `v*` tag reachable from HEAD, if any. */
function lastTag(repo: string): string | undefined {
  try {
    return git(repo, ['describe', '--tags', '--abbrev=0', '--match', 'v*'])
  } catch {
    return undefined
  }
}

/** The Conventional Commits after `since` (every commit without it). */
function commitsSince(repo: string, since: string | undefined): Commit[] {
  const log = git(repo, [
    'log',
    '--no-merges',
    '--format=%h%x1f%B%x1e',
    since === undefined ? 'HEAD' : `${since}..HEAD`,
  ])
  return log
    .split('\x1e')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash = '', message = ''] = entry.split('\x1f')
      return parseCommit(hash, message.trim())
    })
    .filter((commit): commit is Commit => commit !== undefined)
}

/** A planned release: the files to write (repository path → content) and its changelog section. */
export interface ReleasePlan {
  current: string
  tag: string
  /** The first release: package.json and CHANGELOG.md already have it, so it only tags HEAD. */
  first: boolean
  files: Map<string, string>
  changelog: string
}

/** Plans the release of `version` in `repo`, reading only. */
export function planRelease(repo: string, version: string, date: string): ReleasePlan {
  if (!VERSION.test(version)) throw new Error(`not a version: ${version} (expected x.y.z)`)
  const tag = `v${version}`
  const manifest = readFileSync(join(repo, 'package.json'), 'utf8')
  const current = (JSON.parse(manifest) as { version: string }).version
  const changelogPath = join(repo, 'CHANGELOG.md')
  const changelog = existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : undefined
  const previous = lastTag(repo)
  if (version === current && previous === undefined) {
    const section = changelog === undefined ? undefined : changelogSection(changelog, version)
    if (section === undefined) {
      throw new Error(
        `package.json is at ${version}, but CHANGELOG.md has no "## ${version}" section`,
      )
    }
    return { current, tag, first: true, files: new Map(), changelog: `${section}\n` }
  }
  if (compareVersions(version, current) <= 0) {
    throw new Error(`${version} is not above the current version ${current}`)
  }
  const section = renderChangelog(version, date, commitsSince(repo, previous))
  const files = new Map([
    ['package.json', setPackageVersion(manifest, version)],
    ['CHANGELOG.md', prependChangelog(changelog, section)],
  ])
  return { current, tag, first: false, files, changelog: section }
}

export interface ReleaseOptions {
  dryRun?: boolean
  /** The release date for the changelog (default: today, UTC). */
  date?: string
  /** Runs the checks a release needs to pass (default: `pnpm check`). */
  check?: (repo: string) => void
  log?: (line: string) => void
}

/** Why `repo` cannot be released from: not on `main`, or with uncommitted changes. */
function treeProblems(repo: string): string[] {
  const problems: string[] = []
  const branch = git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch !== 'main') problems.push(`releases are made from main, not ${branch}`)
  const status = git(repo, ['status', '--porcelain'])
  if (status !== '')
    problems.push(`the working tree has changes; commit or stash them first:\n${status}`)
  return problems
}

/** Releases `version`: checks, writes the planned files, commits them and tags the commit. */
export function release(repo: string, version: string, options: ReleaseOptions = {}): void {
  const log = options.log ?? console.log
  const date = options.date ?? new Date().toISOString().slice(0, 10)
  const plan = planRelease(repo, version, date)
  if (git(repo, ['tag', '--list', plan.tag]) !== '') {
    throw new Error(`the tag ${plan.tag} already exists`)
  }
  const problems = treeProblems(repo)
  if (problems.length > 0 && !options.dryRun) throw new Error(problems.join('\n'))

  const prefix = options.dryRun ? 'dry run: ' : ''
  if (plan.first) {
    log(`${prefix}first release ${version}: package.json and CHANGELOG.md already have it`)
    log(`  tags HEAD as ${plan.tag}, without a commit`)
  } else {
    log(`${prefix}${plan.current} -> ${version}`)
    for (const path of plan.files.keys()) log(`  ${path}`)
    log(`  commits "chore(release): ${plan.tag}" and tags it ${plan.tag}`)
  }
  log('')
  log(plan.changelog)
  if (options.dryRun) {
    for (const problem of problems) log(`warning: ${problem}`)
    log('(a release runs `pnpm check` first)')
    return
  }

  const check = options.check ?? runCheck
  log('Running pnpm check…')
  check(repo)
  for (const [path, content] of plan.files) writeFileSync(join(repo, path), content)
  if (!plan.first) {
    const paths = [...plan.files.keys()]
    git(repo, ['commit', '-q', '-m', `chore(release): ${plan.tag}`, '--', ...paths])
  }
  git(repo, ['tag', '-a', plan.tag, '-m', plan.tag])
  log(`Tagged ${plan.tag}. Push to release: git push origin main ${plan.tag}`)
}

function runCheck(repo: string): void {
  execFileSync('pnpm', ['check'], { cwd: repo, stdio: 'inherit' })
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { 'dry-run': { type: 'boolean', default: false } },
  })
  if (positionals.length !== 1) {
    console.error('Usage: pnpm release:version <x.y.z> [--dry-run]')
    process.exit(2)
  }
  try {
    release(join(import.meta.dirname, '..'), positionals[0]!, { dryRun: values['dry-run'] })
  } catch (error) {
    console.error(`release:version: ${(error as Error).message}`)
    process.exit(1)
  }
}
