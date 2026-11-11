# Project Record

## Objective

Provide a small, dependency-free library that computes coordinated version bumps across a JavaScript workspace from explicit requests and applies the plan to `package.json` texts without disturbing their formatting.

## Problem

In a monorepo, bumping one package means bumping the packages that depend on it and rewriting their dependency ranges; forgetting one publishes a broken set. Full release tools couple this to changelog files and publishing. This project only computes the version plan from explicit requests and applies it to `package.json` texts without disturbing their formatting.

## Scope

In scope:

- Strict `MAJOR.MINOR.PATCH` version bumps (`major`, `minor`, `patch`).
- Fixed groups and propagation through `dependencies` and `optionalDependencies`.
- Range updates for internal packages, including `workspace:` ranges.
- Formatting-preserving application of the plan.
- A CLI driven by an injected I/O interface.

Out of scope:

- Reading git history or commit messages, changelog writing, publishing.
- Prerelease versions and npm registry queries.

## Public API

`bumpVersion`, `updateRange`, `planBumps`, `applyPlan`, the CLI `run` in `src/cli.ts`, and `VersionBumperError`.

## Timeline

The specification does not define a timeline.

## Effort

The implementation is compact: the planner and applier live in `src/index.ts`; the CLI lives in `src/cli.ts`. Tests live in `test/index.test.ts` and `test/cli.test.ts`. Runtime dependencies are zero.

## Demo

The demo is the `docs/` tree, which documents architecture, testing, security and stack decisions for the package.

## Factory run u273 (measured from API usage)

| Date (UTC) | Phase | Model | Batch | Input | Output | Cache write | Cache read | Cost (USD) |
|---|---|---|---|---|---|---|---|---|
| 2026-11-10 | generation | deepseek-v4-pro | yes | 1981 | 26660 | 0 | 3584 | 0.0542 |
| 2026-11-10 | fix-1 | deepseek-flash | no | 22039 | 7408 | 0 | 266752 | 0.0086 |
| 2026-11-10 | audit | deepseek-flash | no | 27746 | 22947 | 0 | 476288 | 0.0194 |
| 2026-11-10 | fix-2 | deepseek-flash | no | 23711 | 10356 | 0 | 324352 | 0.0107 |
| 2026-11-10 | docs | deepseek-flash | no | 21231 | 8943 | 0 | 384 | 0.0086 |

Total: $0.1014. Prices: deepseek line, as measured by its adapter. Providers serve the current version of each model id, so the date tells which version answered; versions, launch stages and price sources per line are in the factory's model register (docs/MODELS.md).
