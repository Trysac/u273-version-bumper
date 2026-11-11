# Stack

## Runtime

- **TypeScript**, compiled to ES modules for **Node.js 20+** (the `engines` field allows
  current LTS releases).
- **No runtime dependencies.** The library is pure; it imports no `node:` modules. The CLI
  receives an `io` object instead of touching Node APIs, keeping the code testable and the
  supply chain empty.
- **No bundler.** `tsc` emits `dist/` declarations and JavaScript directly.

## Development

| Tool | Purpose |
|---|---|
| TypeScript | Strict type checking (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| Biome | Formatting and linting |
| Vitest + `@vitest/coverage-v8` | Unit tests and coverage thresholds |
| ESLint + `eslint-plugin-security` | Security-focused lint rules |
| Semgrep | Factory rule scan over `src/` |
| gitleaks | Secret scanning |
| `npm audit` / OSV-Scanner | Vulnerability scanning of the lockfile |

## Considered and discarded

- **A full release manager (changesets, release-please):** couples planning to changelogs,
  git history and publishing; this project deliberately stays a pure planner.
- **YAML or TOML workspace formats:** the target is `package.json`, which is JSON.
- **Runtime dependencies for SemVer parsing:** the accepted grammar is strict
  `MAJOR.MINOR.PATCH`, small enough to parse directly and keep the package dependency-free.

## Adding a dependency

Runtime dependencies need a recorded reason here and must not break the "no `node:` imports
in library code" rule. Prefer none.
