# Security Practices

This document describes how `@trysac/version-bumper` handles security. For reporting a vulnerability, see [SECURITY.md](../SECURITY.md) in the repository root.

## Threat model

Defended:

- Malformed manifest text: versions, bump levels and dependency ranges are validated before use; invalid input throws `VersionBumperError` with a stable code.
- Oversized input: `applyPlan` rejects a file larger than 1_048_576 characters; `planBumps` rejects more than 1000 packages.
- Duplicate package names in a planning call: rejected with `duplicate_package`.
- Error output: echoed user input is truncated to 200 characters.
- Unsupported dependency ranges: `planBumps` does not rewrite them; it adds a warning. `peerDependencies` are not edited and are reported as warnings.

Not defended:

- File-system, process, network or registry access. `src/index.ts` imports no `node:` modules; the CLI reads and writes only through the `CliIo` object supplied by the caller.
- Path traversal, symlinks or permission errors in the caller's I/O implementation.
- Secrets, credentials or `.env` files. The package does not read them.
- Git history, changelogs, publishing, prerelease versions or npm registry queries. These are out of scope.
- Correctness of `package.json` fields other than `version` and the edited dependency ranges; `applyPlan` re-serialises the parsed object and preserves key order and detected indentation, not arbitrary text.

## Input handling

- `applyPlan` parses each file with `JSON.parse`; parse errors and files over 1_048_576 characters throw `invalid_json`.
- `planBumps` parses every package version as strict `MAJOR.MINOR.PATCH` and rejects invalid versions.
- `updateRange` accepts `^`, `~`, no operator, and `workspace:` followed by one of those; `*`, `workspace:*`, `workspace:^` and `workspace:~` are unchanged; other ranges throw `unsupported_range`.
- Error messages truncate echoed input to 200 characters.

## Dependencies

The package has no runtime dependencies. `src/index.ts` has no imports, in particular no `node:` imports. The CLI depends only on `src/index.ts` and the injected `CliIo` interface.

## Secrets

No secrets are required to use the library. Error messages may contain fragments of caller-supplied package names, versions or ranges; they are truncated to 200 characters.

## Reporting

Report suspected vulnerabilities privately through GitHub security advisories. The specification does not define response-time commitments.
