# Architecture

`@trysac/version-bumper` is a small, dependency-free planner and applier for coordinated
version bumps in a JavaScript workspace. The design separates pure planning from I/O and
formatting so every decision can be tested without touching the file system.

## Modules

### `src/index.ts` — pure library

The public entry point. It has no imports at all, in particular no `node:` modules, so it
runs unchanged in browsers, workers and tests.

- `bumpVersion(version, bump)` parses a strict `MAJOR.MINOR.PATCH` version and resets the
  lower parts for `major`, `minor` and `patch` (SemVer items 6-8). Invalid versions and
  bump levels throw `VersionBumperError` with `invalid_version` / `invalid_bump`.
- `updateRange(range, newVersion)` keeps the operator of a dependency range (`^`, `~`,
  none, and `workspace:` followed by one of those) and returns floating ranges such as
  `workspace:*` unchanged. Composite ranges throw `unsupported_range`.
- `planBumps(packages, requests, opts)` computes a fixed point over the levels
  `major > minor > patch`. Requested bumps are applied first, then fixed groups, then
  dependency propagation (`dependencies` and `optionalDependencies` bump their owners,
  `devDependencies` only update ranges, `peerDependencies` produce a warning). The result
  has `bumps`, `edits` and `warnings`, all sorted deterministically.
- `applyPlan(plan, files)` parses each `package.json` text, updates the version and the
  edited ranges, and re-serialises with the detected indentation and the original trailing
  newline. Key order is preserved and unchanged files are not returned.

### `src/cli.ts` — command line

`run(argv, io)` parses arguments, reads the package files through the injected `io`
interface, calls `planBumps`, prints the plan (or JSON with `--json`), and optionally
writes changed files with `--write`. It never touches Node APIs directly.

Exit codes:

| Code | Meaning |
|---|---|
| `0` | Plan computed (and written when `--write` is given) |
| `1` | Domain error: invalid version, unknown package, bad JSON, unreadable file |
| `2` | Usage error: missing `--bump`, missing paths, unknown option |

## Data flow

```text
argv ──> parseArgs ──> read files (io.readFile) ──> planBumps ──> stdout / stderr
                                                         │
                                                    applyPlan ──> io.writeFile (--write)
```

## Boundaries

- Library code is pure: no file system, no process, no network.
- The CLI owns argument parsing and I/O but delegates all version logic to the library.
- Errors are typed: `VersionBumperError` carries a stable machine-readable `code`.

## Formatting preservation

`applyPlan` detects the indentation from the whitespace before the first key. A file whose
first key shares the opening brace stays single-line; a file with a newline before its first
key is re-serialised with that indentation, including the empty indentation case. The
original trailing-newline state is preserved.

See [decisions/0001-record-architecture-decisions.md](decisions/0001-record-architecture-decisions.md)
for why this shape was chosen.
