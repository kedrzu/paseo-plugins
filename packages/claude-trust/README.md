# claude-trust

Trust every Paseo worktree in Claude Code, so `claude` started in one never shows the "Is this a
project you trust?" dialog.

- **New worktrees:** trusted as Paseo cuts them, on the `worktree.create.after` hook.
- **Existing worktrees:** trusted once each time the plugin loads, so installing it covers the
  worktrees you already have.

## Why a plugin

Claude Code records trust per folder in `~/.claude.json` (`projects[<path>].hasTrustDialogAccepted`)
and looks for an earlier answer only up to the folder's git root. Every worktree is its own git root,
so trusting `~/.paseo/worktrees` covers none of them, and Claude Code has no setting that trusts a
folder by pattern.

## Install

```bash
paseo plugin install /path/to/paseo-plugins/packages/claude-trust
# or, from GitHub:
paseo plugin add kedrzu/paseo-plugins:packages/claude-trust
```

Requires Paseo 0.15.0 or newer (`paseo-plugin.json`).

## What trust means

A trusted folder applies its `.claude/settings.json` without asking, including the permissions it
pre-approves and the hooks it runs. Installing this plugin trusts every repository you open in Paseo
with a worktree.

## Limitations

- Worktrees are found under `$PASEO_HOME/worktrees` (default `~/.paseo/worktrees`), two levels down.
- Only `~/.claude.json` is written; a `CLAUDE_CONFIG_DIR` elsewhere is not supported.
- Claude Code rewrites `~/.claude.json` whole. If it saves at the very moment the plugin does, one of
  the two writes is lost; the next worktree, or the next plugin load, writes the entry again.
