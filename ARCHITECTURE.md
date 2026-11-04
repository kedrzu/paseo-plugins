# paseo-plugins architecture

A collection of plugins for [Paseo](https://paseo.sh), each installed into the Paseo daemon on its
own. Nothing here is deployed: the daemon compiles a plugin from its source directory, either a local
checkout or a path in this GitHub repository.

## Stack

- **Runtime and package manager:** Bun, with Bun workspaces.
- **Language:** TypeScript, ESM.
- **Plugin host:** `@getpaseo/plugin`. Paseo provides `react`, `react-native`, `zod` and
  `@tanstack/react-query` at runtime; they are dev dependencies here for the types.
- **Framework packages:** `@nzyme/*`, built from source from the `nzyme/` git submodule. Today they
  supply the tooling (CLI, lint presets, tsconfig); no plugin imports them at runtime.
- **Build orchestration:** Nx, cache scoped to each worktree.

## Packages

There are no plugins at the moment. Each new one is a package `@paseo-plugins/<name>` in
`packages/<name>`.

Every plugin follows Paseo's layout rules (`README.md`): only its entries, `paseo-plugin.json` and
configuration in the root, and code under `client/`, `server/` and `shared/`.

## Tooling and workflow

- **Setup:** `zsh setup.sh` — submodule, install, generated files, build; run for every clone and
  worktree.
- **Checks:** `typecheck`, `lint:check`, `format:check` and `tests`, run by the `Build` workflow on
  every pull request. `Verify Submodules` checks that the nzyme pin is on nzyme `main` and never moves
  back.
- **Git:** Conventional Commits, pull requests squash-merged into `main`. The nzyme pin moves with a
  commit made by `bunx @nzyme/cli submodule bump --source origin/main`.
- **Agents:** `CLAUDE.md`, the skills under `.claude/skills/`.

## Decisions

- **Each plugin has its own `tsconfig.esm.json` with `Bundler` resolution, no DOM lib and `noEmit`.**
  Paseo compiles plugins itself and forbids DOM types in them, so they do not extend the `@nzyme/tsconfig`
  presets. It keeps them out of `tsgo --build`; each plugin's `typecheck` script checks it.
- **The Nx guard test does not require a product task over an nzyme package.** No plugin depends on
  nzyme at runtime, so no such task exists. The assertion on those tasks stays and applies when one does.
- **No `bump-nzyme` workflow.** The pin moves by hand, for simplicity.
