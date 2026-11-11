# Testing

Tests use [Vitest](https://vitest.dev/) and live in `test/`, one suite per source module. Run them with `npx vitest` or the project's test script.

## Suites

| File | Covers |
|---|---|
| `test/index.test.ts` | `bumpVersion`, `updateRange`, `planBumps` and `applyPlan` |
| `test/cli.test.ts` | `run` argument parsing, exit codes and I/O through a fake `io` |

`test/index.test.ts` covers strict version bumping and invalid versions/leading zeros/safe integers; `invalid_bump`; range operators `^`, `~`, plain and `workspace:` forms; unchanged floating ranges; `unsupported_range`; dependency propagation; highest requested level; fixed groups; cyclic packages; unsupported-range warnings; `unknown_package`, `invalid_bump`, `duplicate_package`, `too_many_packages`; peer dependency warnings; optional and dev dependency edits; sorting; non-workspace dependencies; `0.x` versions; formatting preservation for 4-space, tab, single-line, no-indent and missing-trailing-newline files; `invalid_json`; oversized files; and returning only changed files.

`test/cli.test.ts` covers printing bumps without `--write`, `--write` calling `writeFile`, `--json` output, missing `--bump` (exit 2), unknown package (exit 1), invalid JSON (exit 1), unknown option (exit 2), invalid bump level (exit 1), missing package paths (exit 2), unreadable files (exit 1), non-object JSON (exit 1), missing `name`/`version` (exit 1), warnings on stderr, unexpected errors (exit 1), and `--bump=name=level` / `--fixed=a,b` forms.

## Conventions

- Error cases assert the `VersionBumperError` code, not only the message.
- The CLI is tested with an in-memory `io` object, so no files are read or written.

## Coverage

The provided test files do not define coverage thresholds or a coverage configuration.

## Quality gates

The provided files do not define a separate quality-gate script.
