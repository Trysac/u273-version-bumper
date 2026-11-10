# Adopt a pure planner for coordinated version bumps

Status: accepted (generated, pending human review)

## Context

A monorepo needs coordinated version bumps: when one package is bumped, the packages that depend on it must receive at least a patch bump and their internal dependency ranges must be updated. Full release tools couple this to changelog files and publishing, which is undesirable for library users who only want a version plan.

## Decision

Implement a pure TypeScript library that computes a version plan from explicit requests and applies it to package.json texts. The planner uses a fixed point over major > minor > patch levels, with dependency propagation, fixed groups, and reason priority requested > group > dependency. Range updates preserve operators and formatting is preserved during application.

## Consequences

The library has no runtime dependencies and is usable from scripts and CI. It does not read git history or publish anything, keeping its scope small. Users must provide explicit bump requests; the library never infers bumps from commit messages.
