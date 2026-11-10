# wait-for-setup

Makes a Paseo agent wait until its workspace setup (`worktree.setup` in `paseo.json`) has finished
before the agent's Claude Code session starts.

Paseo runs worktree setup in the background and starts the agent at once. The session then loads
skills, plugins, `CLAUDE.md` and MCP servers from a half-built worktree — an uninitialised submodule,
missing dependencies — and never reloads them. No project change is needed: the daemon already
tracks each workspace's setup status, and this wrapper asks it.

Not a daemon plugin. Plugin hooks (`agent.create.before`, `agent.open.before`) time out after 30
seconds and the plugin API has no setup-finished event, so a plugin cannot hold an agent for a setup
that takes minutes.

## How it works

`bin/claude` replaces Claude Code as Paseo's `claude` provider command:

1. Anything that is not an agent session (`claude --version`, `claude auth status`, which Paseo runs
   with short timeouts) execs the real `claude` at once. A session is recognised by the Agent SDK's
   `--input-format` flag and `PASEO_AGENT_ID` in the environment.
2. For a session, `src/main.ts` connects to the local daemon (address from `$PASEO_HOME/paseo.pid`,
   token from `$PASEO_HOME/local-credential`, as the `paseo` CLI does), looks up the agent's
   workspace and polls its setup status while it is `running`.
3. Then it execs the real `claude` (the first one on `PATH` or in the usual install locations,
   skipping this directory) with the original arguments.

It never keeps an agent from starting: a failed setup, setup awaiting approval (`blocked`), a daemon
it cannot reach and a 30-minute timeout all start the session. A fresh agent in a linked worktree
that sees no setup status yet waits up to 6 seconds for setup to begin. Progress goes to stderr,
which Paseo writes to the daemon log as `Claude Agent SDK stderr`.

## Install

```bash
bun install   # in this repository, for @getpaseo/client
```

In `$PASEO_HOME/config.json` (default `~/.paseo/config.json`), under `agents.providers.claude`:

```json
"command": {
    "mode": "replace",
    "argv": ["/path/to/paseo-plugins/packages/wait-for-setup/bin/claude"]
}
```

Then `paseo reload`. The path must stay valid: point it at a checkout that stays on `main`.

## Limitations

- Claude Code only. Codex runs a long-lived app server rather than one process per session; it is
  not wrapped.
- Depends on the daemon's client protocol (`@getpaseo/client`, pinned to the Paseo version it was
  tested with). If an update breaks it, agents start without waiting, as before.
