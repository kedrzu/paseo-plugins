# keep-awake

Keep the Mac running the Paseo daemon awake for a while, from any device, including the phone.

- **Sidebar footer:** a button showing what is left, in a row shared with the other plugins of this
  repo. Its popover adds 30 min, 1 h, 2 h or 4 h, or stops the session.
- **Command Center:** the same as global items, `Keep Mac awake +1 h` and `Let Mac sleep`.

Each extension adds to the running session, or starts one from now.

## Install

```bash
paseo plugin install /path/to/paseo-plugins/packages/keep-awake
# or, from GitHub:
paseo plugin add kedrzu/paseo-plugins:packages/keep-awake
```

Requires Paseo 0.15.0 or newer (`paseo-plugin.json`) and macOS.

## How it works

The daemon host runs `/usr/bin/caffeinate -i -t <seconds> -w <plugin host PID>`. Extending replaces
it with one for the new remaining time, because `caffeinate` cannot change its timeout while it runs.
`-w` ends it with the plugin host, so a crashed or reloaded plugin never leaves the Mac awake.

## Why not Vorssaint

Vorssaint's Keep Awake would show in its menu bar icon, but Vorssaint (3.4.x) has no external
control: no URL scheme, AppleScript dictionary, Shortcuts actions or CLI. Its global shortcut only
toggles, without a duration. A session started here does not show in Vorssaint.

## Limitations

- `-i` prevents idle sleep only: the display still dims and sleeps, and closing the lid on battery
  still sleeps the Mac.
- The session lives in the plugin host: a daemon restart or a plugin reload ends it.
