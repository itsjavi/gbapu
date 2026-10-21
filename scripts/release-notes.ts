// `node scripts/release-notes.ts <x.y.z>`: prints the GitHub release notes of a version (or of its
// tag, `vX.Y.Z`): its CHANGELOG.md section without the heading, since the release is titled by its
// tag. release.yml runs it after publishing. Fails when CHANGELOG.md has no section for the version.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `version`'s section of `changelog`, from its `## x.y.z` heading (with or without a date) to the
 * next `## ` heading; `undefined` when there is none.
 */
export function changelogSection(changelog: string, version: string): string | undefined {
  const lines = changelog.split('\n')
  const start = lines.findIndex(
    (line) => line === `## ${version}` || line.startsWith(`## ${version} (`),
  )
  if (start === -1) return undefined
  const next = lines.findIndex((line, index) => index > start && line.startsWith('## '))
  return lines
    .slice(start, next === -1 ? undefined : next)
    .join('\n')
    .trim()
}

/** The release notes of `version`: its changelog section without the heading. */
export function releaseNotes(changelog: string, version: string): string | undefined {
  const section = changelogSection(changelog, version)
  if (section === undefined) return undefined
  const newline = section.indexOf('\n')
  const body = newline === -1 ? '' : section.slice(newline + 1).trim()
  return `${body === '' ? 'No notable changes.' : body}\n`
}

if (import.meta.main) {
  const version = process.argv[2]?.replace(/^v/, '')
  if (!version) {
    console.error('Usage: node scripts/release-notes.ts <x.y.z>')
    process.exit(2)
  }
  const notes = releaseNotes(
    readFileSync(join(import.meta.dirname, '..', 'CHANGELOG.md'), 'utf8'),
    version,
  )
  if (notes === undefined) {
    console.error(`CHANGELOG.md has no "## ${version}" section.`)
    process.exit(1)
  }
  process.stdout.write(notes)
}
