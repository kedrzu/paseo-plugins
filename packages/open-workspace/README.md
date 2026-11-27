# open-workspace

Open the workspace outside Paseo from the Command Center: its repository in Finder, Fork, VS Code,
Zed or on GitHub, its Linear issue, and its `.pen` designs in [Pen](https://pen.dev).

- **"Open in Finder"**: shows the workspace directory in Finder.
- **"Open in Fork"**: opens the repository in the [Fork](https://git-fork.com) git client.
- **"Open in VS Code"**: opens the workspace directory in [VS Code](https://code.visualstudio.com).
- **"Open in Zed"**: opens the workspace directory in [Zed](https://zed.dev).
- **"Open on GitHub"**: opens the branch's open or merged pull request; without one, the code on the
  branch.
- **"Review Code"**: opens the "Files changed" tab of the branch's open or merged pull request
  (`<pr>/files`); without one, or without a logged-in `gh`, it reports so.
- **"Open in Linear"**: opens the workspace's [Linear](https://linear.app) issue in the browser
  (see "Which Linear issue").
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

1. **Pull request:** `gh pr view` for the checked-out branch, when its state is `OPEN` or `MERGED`
   (GitHub usually deletes a merged branch, so its tree page would be a 404). A closed pull request,
   a missing `gh` or a logged-out `gh` falls through to the next step.
2. **Branch:** `https://github.com/<owner>/<repo>/tree/<branch>`, using the branch's upstream remote
   and upstream branch name (`origin` and the local name when it has no upstream). A branch the
   remote does not have yet is an error that asks you to push it.
3. **Detached HEAD:** the commit, on `origin`.

## Which Linear issue

1. **Branch:** an issue ID heading the last segment of the checked-out branch, such as
   `feature/lin-123-short-title` or `lin-123`.
2. **Workspace name:** a title or name starting with `[LIN-123]`.

Any team key works, not only `LIN`. The URL is `https://linear.app/<workspace>/issue/<ID>`; Linear
has no issue URL without the organisation slug, so set **Workspace** once in the plugin's settings
(Settings → Open Workspace). Without it, or without an issue ID, the command says what is missing.

## Which design files count

- **In a git repository:** tracked and untracked files matching `*.pen` that `.gitignore` does not
  exclude (`git ls-files --cached --others --exclude-standard`).
- **Outside git:** a walk of the workspace directory that skips `node_modules` and hidden
  directories.

## Limitations

- Finder, Fork, VS Code, Zed and Pen open on the daemon host and work on macOS only (`open -a Finder`,
  `open -b com.DanPristupov.Fork`, `open -b com.microsoft.VSCode`, `open -b dev.zed.Zed`,
  `open -b dev.pencil.desktop`). Zed Preview and Nightly have their own bundle IDs and are not used.
- The apps are launched without the `ELECTRON_*` and `NODE_CHANNEL_*` variables of the plugin host,
  which would otherwise start a closed Electron app (VS Code, Pen) as a bare Node process.
- Only `github.com` remotes; GitHub Enterprise hosts are reported as not on GitHub.
- "Pushed" means the remote-tracking ref exists locally, so it is as fresh as the last fetch.
- The Command Center has no submenus, so several designs are picked on a separate screen; picking
  one returns to the workspace. Arrow keys and Escape reach the filter only on desktop and web: a
  touch keyboard has no such keys, so on mobile a design is picked by tapping it.
