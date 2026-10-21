# Agent instructions

gbaudio is a Game Boy APU (DMG sound) emulator and audio compiler in TypeScript, published to npm
as `gbaudio`. It has no runtime dependencies and must keep running in browsers, Web Workers and
Node: no Node APIs in `src/`.

## Commands

- `pnpm install`
- `pnpm typecheck` (TypeScript 7, strict)
- `pnpm lint` (oxlint)
- `pnpm fmt` / `pnpm fmt:check` (oxfmt)
- `pnpm test` (Vitest)
- `pnpm test:scripts` (`node --test`, the release scripts in `scripts/`)
- `pnpm build` (emits `dist/` with `tsconfig.build.json`)
- `pnpm check` runs all of them. CI runs the same steps on every push and pull request.

Use Node 24 or later and the pnpm version in `packageManager`.

## Layout

- `src/apu.ts`: the APU emulation (`Apu`, `APU_REG`, `MIX_MODE`), a port of stoneface's C++
  gbapu.
- `src/audio-compiler.ts`: command streams to cycle-timed register writes.
- `src/audio-export.ts`: offline rendering to PCM and WAV.
- `src/audio-command-tokens.ts`: register and drum tokens.
- `src/types.ts`: the sound data types.
- `src/index.ts`: the package entry, re-exporting the modules above.
- `test/`: Vitest tests of the public API, with sounds authored for them in `test/fixtures.ts`.
- `scripts/`: the release scripts (`release.ts`, `release-notes.ts`), run by Node's type
  stripping, and their tests.

## Conventions

- The engine modules (`src/apu.ts`, `src/audio-*.ts`, `src/types.ts`): change them only for a
  real fix or feature, with a test.
- All code follows `.oxfmtrc.json`: single quotes, no semicolons, 100 columns.
- Relative imports use `.ts` extensions; the build rewrites them to `.js`.
- Keep `erasableSyntaxOnly` code: no enums, namespaces or parameter properties.
- The public API is what `src/index.ts` exports. A change to it updates README.md in the same
  commit.
- Rendering is deterministic. Tests compare exact samples or hashes, never timing.
- Never add game ROMs, songs, sound effects or other game assets, in the package or the tests.
  Test sounds are authored for the tests.
- Commits follow Conventional Commits. The release changelog is generated from them: `feat`,
  `fix`, `perf` and breaking (`!`) commits are listed, so write their subjects for users.
- Never write local machine details (absolute paths, usernames, hostnames, temp directories)
  into anything committed. Refer to files by repository-relative paths.

## Releases

Never bump the version or write release changelog sections by hand: `pnpm release:version
<x.y.z>` does it, commits and creates the tag `vX.Y.Z` (`--dry-run` first), and pushing the tag
(`git push origin main vX.Y.Z`) publishes through `.github/workflows/release.yml`, with npm
trusted publishing (no token). Details are in CONTRIBUTING.md. The tarball holds only `dist/`, README.md, LICENSE and package.json (check
with `npm pack --dry-run`). Tagging, pushing and publishing need the maintainer's approval.
