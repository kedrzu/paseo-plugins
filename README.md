# Paseo Plugins

My collection of plugins for [Paseo](https://paseo.sh) — the mobile app for monitoring and
controlling local AI coding agents.

Each plugin lives in its own directory under `plugins/` and is installed into the Paseo daemon
independently.

## Plugins

| Plugin                  | ID      | What it does                                                             |
| ----------------------- | ------- | ------------------------------------------------------------------------ |
| [hello](plugins/hello/) | `hello` | Starter template — a sidebar surface calling a server RPC over the wire. |

## Requirements

- Paseo 0.8.0 or newer (daemon **and** app — each checks `requirements.paseo` separately)
- [Bun](https://bun.sh) for installing dev dependencies and typechecking

## Setup

```bash
bun install
bun run typecheck
```

Dependencies are devDependencies only. Paseo provides `react`, `react-native`, `zod`,
`@tanstack/react-query`, and the `@getpaseo/plugin` SDK at runtime — they are here so the editor
and `tsc` know the types.

## Installing a plugin into Paseo

Plugins are off until the daemon-wide switch is on: Settings → Plugins, or set
`"pluginsEnabled": true` in `$PASEO_HOME/config.json` and run `paseo reload`.

From this checkout (the path must be on the daemon host):

```bash
paseo plugin install /Users/kedrzu/Dev/paseo-plugins/plugins/hello
paseo plugin ls
```

From GitHub, on any machine running the daemon:

```bash
paseo plugin add kedrzu/paseo-plugins:plugins/hello
```

## Developing

There is no watcher. After editing a plugin:

```bash
bun run typecheck
paseo plugin reload hello
paseo plugin logs hello
```

A failed reload stays failed — the previous bundle is not restored, so fix the error and reload
again.

## Adding a plugin

```bash
paseo plugin init plugins/<name>
```

Then trim the generated `plugins/<name>/package.json` down to the workspace form (name, private,
version, `typecheck` script — shared devDependencies live in the root `package.json`), point its
`tsconfig.json` at `../../tsconfig.base.json`, and run `bun install` at the root.

### Layout rules

Paseo compiles plugin sources itself and enforces where code may live:

```text
plugins/<name>/
  paseo-plugin.json      # id + requirements, nothing else (the schema is strict)
  index.server.ts        # runs in a Node subprocess on the daemon
  index.client.tsx       # runs inside every connected app
  server/                # Node, fs, process, credentials
  client/                # React, React Native, hooks, surfaces
  shared/                # Zod RPC contracts and plain values
```

No other modules in a plugin root. Client code cannot import `node:*`; server and shared code
cannot import React or React Native. Both entries must default-export a function that returns a
cleanup function.

## Docs

- [Plugin docs](https://paseo.sh/docs/plugins) · [0.8 quickstart](https://paseo.sh/docs/plugins/v0.8)
- [Example plugins](https://github.com/kedrzu/paseo/tree/main/plugin-examples) in the Paseo repo
