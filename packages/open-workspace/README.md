# open-workspace

Open the workspace outside Paseo from the Command Center: its repository in Finder, Fork, VS Code
or on GitHub, and its `.pen` designs in [Pen](https://pen.dev).

- **"Open in Finder"**: shows the workspace directory in Finder.
- **"Open in Fork"**: opens the repository in the [Fork](https://git-fork.com) git client.
- **"Open in VS Code"**: opens the workspace directory in [VS Code](https://code.visualstudio.com).
- **"Open on GitHub"**: opens the branch's open pull request; without one, the code on the branch.
- **"Open Design in Pen"**: with one design in the workspace it opens that file; with several it
  opens a picker listing them by path relative to the workspace; with none it reports so. The
  picker is driven from the keyboard: typing filters, ↑/↓ select, Enter opens, Escape goes back.

## Install

```bash
paseo plugin install /path/to/paseo-plugins/packages/open-workspace
# or, from GitHub:
paseo plugin add kedrzu/paseo-plugins:packages/open-workspace
```

Requires Paseo 0.15.0 or newer (`paseo-plugin.json`). It replaces the `open-repo` and `open-in-pen`
plugins; uninstall those first.

## Which GitHub page

The daemon host works out the URL; the device you picked the command on opens it in its browser.

1. **Open pull request:** `gh pr view` for the checked-out branch, when its state is `OPEN`. A merged
   or closed pull request, a missing `gh` or a logged-out `gh` falls through to the next step.
2. **Branch:** `https://github.com/<owner>/<repo>/tree/<branch>`, using the branch's upstream remote
   and upstream branch name (`origin` and the local name when it has no upstream). A branch the
   remote does not have yet is an error that asks you to push it.
3. **Detached HEAD:** the commit, on `origin`.

## Which design files count

- **In a git repository:** tracked and untracked files matching `*.pen` that `.gitignore` does not
  exclude (`git ls-files --cached --others --exclude-standard`).
- **Outside git:** a walk of the workspace directory that skips `node_modules` and hidden
  directories.

## Limitations

- Finder, Fork, VS Code and Pen open on the daemon host and work on macOS only (`open -a Finder`,
  `open -b com.DanPristupov.Fork`,
  `open -b com.microsoft.VSCode`, `open -b dev.pencil.desktop`).
- Only `github.com` remotes; GitHub Enterprise hosts are reported as not on GitHub.
- "Pushed" means the remote-tracking ref exists locally, so it is as fresh as the last fetch.
- The Command Center has no submenus, so several designs are picked on a separate screen; picking
  one returns to the workspace. Arrow keys and Escape reach the filter only on desktop and web: a
  touch keyboard has no such keys, so on mobile a design is picked by tapping it.
