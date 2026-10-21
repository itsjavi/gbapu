# Contributing

## Development

Use Node 24 or later and the pnpm version in `packageManager`.

```sh
pnpm install
pnpm check          # typecheck, lint, format check, tests, release script tests, build
pnpm test:watch     # Vitest in watch mode
pnpm fmt            # format with oxfmt
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org). Releases build the
changelog from them: `feat`, `fix` and `perf` commits are listed, and a `!` after the type (or a
`BREAKING CHANGE:` footer) lists a commit under breaking changes. Other types (`docs`, `chore`,
`test`, `refactor`, `build`, `ci`) are left out.

## Releases

Releases follow [semver](https://semver.org) and are tagged `vX.Y.Z`.

1. `pnpm release:version <x.y.z> --dry-run` prints what the release would change and its
   changelog section, writing nothing.
2. `pnpm release:version <x.y.z>`, on a clean `main` working tree, runs `pnpm check`, sets the
   version in package.json, prepends the release's section to CHANGELOG.md from the Conventional
   Commits since the last `v*` tag, commits `chore(release): vX.Y.Z` and creates the annotated tag
   `vX.Y.Z`. It pushes nothing.

   The first release is the exception: package.json and CHANGELOG.md already have it (1.0.0). When
   package.json has the requested version, no `v*` tag exists yet and CHANGELOG.md has its section,
   the command only runs the checks and tags HEAD.

3. `git push origin main vX.Y.Z` pushes the release commit and its tag. The tag runs
   `.github/workflows/release.yml`, which runs `pnpm check`, verifies that the tag is `v` plus
   package.json's version, publishes to npm with provenance and creates the GitHub release with
   the version's CHANGELOG.md section (`node scripts/release-notes.ts <x.y.z>` prints it).

A prerelease version (`x.y.z-rc.1`) is published under the npm dist-tag `next`, and its GitHub
release is marked as a prerelease.

The workflow needs two repository settings (Settings → Secrets and variables → Actions):

- The secret `NPM_TOKEN`: an npm access token that can publish `gbaudio`.
- The variable `NPM_PUBLISH`, set to `true`. Until it is, the workflow runs
  `npm publish --dry-run` and creates no GitHub release.
