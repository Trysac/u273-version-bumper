# 0001 — Record architecture decisions

## Status

Accepted.

## Context

The project needs a durable record of why its architecture looks the way it does, so that
future changes can be evaluated against the original constraints rather than re-litigated
from memory. The library has a small surface and few decisions, but they matter: purity,
zero runtime dependencies and formatting preservation are the product.

## Decision

Architecture decisions are recorded as numbered Markdown files under `docs/decisions/`,
named `NNNN-title.md`, and linked from the relevant documentation. Each record states its
status, context, decision and consequences.

## Consequences

- The reasoning behind the pure-planner/module split and the zero-dependency rule is
  discoverable.
- Contributors add a record whenever they make a decision that is costly to reverse.
- The documentation gate (`docs-manifest.json`) requires at least one record, so the tree
  cannot silently disappear.
