# open-repo

Open the workspace's repository outside Paseo from the Command Center.

- **"Open in Finder"**: shows the workspace directory in Finder.
- **"Open in Fork"**: opens the repository in the [Fork](https://git-fork.com) git client.
- **"Open on GitHub"**: opens the branch's open pull request; without one, the code on the branch.

## Install

```bash
paseo plugin install /path/to/paseo-plugins/packages/open-repo
# or, from GitHub:
paseo plugin add kedrzu/paseo-plugins:packages/open-repo
```

Requires Paseo 0.15.0 or newer (`paseo-plugin.json`).

## Which GitHub page

The daemon host works out the URL; the device you picked the command on opens it in its browser.

1. **Open pull request:** `gh pr view` for the checked-out branch, when its state is `OPEN`. A merged
   or closed pull request, a missing `gh` or a logged-out `gh` falls through to the next step.
2. **Branch:** `https://github.com/<owner>/<repo>/tree/<branch>`, using the branch's upstream remote
   and upstream branch name (`origin` and the local name when it has no upstream). A branch the
   remote does not have yet is an error that asks you to push it.
3. **Detached HEAD:** the commit, on `origin`.

## Limitations

- Finder and Fork open on the daemon host and work on macOS only (`open -a Finder`,
  `open -b com.DanPristupov.Fork`).
- Only `github.com` remotes; GitHub Enterprise hosts are reported as not on GitHub.
- "Pushed" means the remote-tracking ref exists locally, so it is as fresh as the last fetch.
