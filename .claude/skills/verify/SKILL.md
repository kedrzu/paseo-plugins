---
name: verify
description: >-
    Prove a change in paseo-plugins works: the scoped checks while iterating and the full protocol
    that must be green before work is done. Use when asked to verify or fix failing checks, or before
    reporting code-impacting work complete. The dev pipeline relies on it (`verify` contract).
---

# Verify

Docs-only changes need only `bun run lint:check`. Anything else, or if unsure, is code-impacting.

## Scoped

For each plugin `<name>` the change touched:

- `bun run --cwd packages/<name> typecheck`
- `bun x oxlint --type-aware --quiet --disable-nested-config packages/<name>`
- `bun x oxfmt --check --disable-nested-config packages/<name>`
- `bun test --pass-with-no-tests packages/<name>`

A change outside `packages/` goes straight to Full.

## Full

The same steps as the `Build` workflow, from the repo root. Fix every failure:

1. `bash setup.build.sh`
2. `bun run typecheck`
3. `bun run lint:check`
4. `bun run format:check`
5. `bun run tests`

These checks do not compile a plugin the way Paseo does. For a change in plugin behaviour, also run
`paseo plugin reload <id>` and `paseo plugin logs <id>`.
