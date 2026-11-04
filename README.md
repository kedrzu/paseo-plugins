# Paseo Plugins

My collection of plugins for [Paseo](https://paseo.sh) — the mobile app for monitoring and
controlling local AI coding agents.

Each plugin lives in its own directory under `packages/` and is installed into the Paseo daemon
independently.

## Requirements

- Paseo 0.8.0 or newer (daemon **and** app — each checks `requirements.paseo` separately)
- [Bun](https://bun.sh) for installing dev dependencies and typechecking

## Setup

```bash
zsh setup.sh
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
paseo plugin install /Users/kedrzu/Dev/paseo-plugins/packages/<name>
paseo plugin ls
```

From GitHub, on any machine running the daemon:

```bash
paseo plugin add kedrzu/paseo-plugins:packages/<name>
```

## Developing

There is no watcher. After editing a plugin:

```bash
bun run typecheck
paseo plugin reload <id>
paseo plugin logs <id>
```

A failed reload stays failed — the previous bundle is not restored, so fix the error and reload
again.

## Adding a plugin

```bash
paseo plugin init packages/<name>
```

Then trim the generated `packages/<name>/package.json` down to the workspace form (name, private,
version, `"typecheck": "tsgo --noEmit"` — shared devDependencies live in the root `package.json`),
replace its `tsconfig.json` with the `tsconfig.esm.json` below, and run `zsh setup.sh` at the root.
`tsconfig.json` is generated from that file.

```json
{
    "compilerOptions": {
        "target": "ES2020",
        "module": "ESNext",
        "moduleResolution": "Bundler",
        "lib": ["ES2023"],
        "types": ["react"],
        "jsx": "react-jsx",
        "strict": true,
        "skipLibCheck": true,
        "noEmit": true,
        "esModuleInterop": true,
        "allowSyntheticDefaultImports": true
    },
    "include": ["**/*.ts", "**/*.tsx"],
    "exclude": ["node_modules"]
}
```

### Layout rules

Paseo compiles plugin sources itself and enforces where code may live:

```text
packages/<name>/
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
