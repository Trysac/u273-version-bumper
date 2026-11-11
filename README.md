# @trysac/version-bumper

[![CI](https://github.com/Trysac/u273-version-bumper/actions/workflows/ci.yml/badge.svg)](https://github.com/Trysac/u273-version-bumper/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Plan and apply coordinated version bumps across a JavaScript workspace. A caller supplies explicit bump requests; the planner propagates patch bumps through workspace `dependencies` and `optionalDependencies`, updates internal dependency ranges, and `applyPlan` rewrites `package.json` texts while preserving key order, detected indentation and the original trailing-newline state.

## Installation

```bash
npm install @trysac/version-bumper
```

## Quick start

```ts
import { planBumps } from '@trysac/version-bumper';

const plan = planBumps(
  [
    { name: 'a', version: '1.0.0' },
    { name: 'b', version: '2.0.0', dependencies: { a: '^1.0.0' } },
  ],
  { a: 'minor' },
);
console.log(plan.bumps);
```

## Public API

`bumpVersion(version, bump)` returns the strict `MAJOR.MINOR.PATCH` version after `major`, `minor` or `patch`; lower parts reset according to SemVer. `updateRange(range, newVersion)` preserves `^`, `~`, no operator, or `workspace:` followed by one of those; `*`, `workspace:*`, `workspace:^` and `workspace:~` are returned unchanged. `planBumps(packages, requests, { fixed })` returns `{ bumps, edits, warnings }`; `fixed` is an array of package-name groups. `applyPlan(plan, files)` returns only changed files and matches each file to a package by its `name` field.

Errors are `VersionBumperError` with a stable `code`: `invalid_version`, `invalid_bump`, `unknown_package`, `unsupported_range`, `duplicate_package`, `invalid_json`, `too_many_packages`.

Limits: at most 1000 packages in `planBumps`; each `applyPlan` file is at most 1_048_576 characters. Unsupported ranges in `planBumps` are skipped and reported in `warnings`; `peerDependencies` are not edited and are reported as warnings.

## CLI

```bash
node dist/cli.js --bump a=minor --write packages/a/package.json packages/b/package.json
```

Positional arguments are `package.json` paths. Options: repeated `--bump name=level`, repeatable `--fixed a,b`, `--write`, `--json`. Exit codes: `0` success, `1` domain error, `2` usage error.

## Why not changesets

Changesets couples version planning to changelog files, git history and publishing. `@trysac/version-bumper` is a pure planner and applier over explicit requests; it can be called from scripts and propagates bumps through the workspace without writing release notes or publishing.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Security](docs/SECURITY.md)

## License

MIT
