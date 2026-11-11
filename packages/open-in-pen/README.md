# open-in-pen

Open the workspace's `.pen` design files in [Pen](https://pen.dev) from Paseo's Command Center.

- **"Open Design in Pen"** (workspace Command Center item): with one design in the workspace it
  opens that file; with several it opens a picker listing them by path relative to the workspace;
  with none it reports so.

## Install

```bash
paseo plugin install /path/to/paseo-plugins/packages/open-in-pen
# or, from GitHub:
paseo plugin add kedrzu/paseo-plugins:packages/open-in-pen
```

Requires Paseo 0.15.0 or newer (`paseo-plugin.json`).

## Which files count

- **In a git repository:** tracked and untracked files matching `*.pen` that `.gitignore` does not
  exclude (`git ls-files --cached --others --exclude-standard`).
- **Outside git:** a walk of the workspace directory that skips `node_modules` and hidden
  directories.

## Limitations

- macOS only: the file opens on the daemon host through `open -b dev.pencil.desktop`.
- The Command Center has no submenus, so several designs are picked on a separate screen; picking
  one returns to the workspace.
