---
name: git-workflow
description: >-
    How a change moves in paseo-plugins: branch, commit, push, pull request, landing. The dev pipeline
    relies on it (`git-workflow` contract). Use for any commit, push or pull request.
---

# Git workflow

`main` takes pull requests only, squash-merged; `Build` and `Verify Submodules` must be green.
There is no issue tracker.

Commits and PR titles are Conventional Commits: `<type>(<scope>): <summary>`, in English, imperative,
lowercase. The scope is the plugin directory name; omit it for repo-wide changes.

## Start

`git switch -c <type>/<short-kebab-slug> origin/main`. PRs do not open as drafts.

## Checkpoint

Commit, then `git push -u origin HEAD`. Scoped checks from `verify` must be green. Confirm the push
landed: `git rev-parse HEAD` equals `git rev-parse @{u}`.

- **Given files only:** `git add -- <files>` with nothing else staged (check
  `git diff --cached --name-only`), then commit.
- **Already committed:** `git push`.
- **Submodule:** a change inside `nzyme/` is a merged PR to `kedrzu/nzyme` first; this repo then pins
  the merged commit with `bunx @nzyme/cli submodule bump --source origin/main`.

## Publish

`gh pr create --base main --title "<conventional title>" --body-file <file>`. The body says what
changed and why, in English.

## Stack

Unsupported: plugins are small and independent, so each change is one PR.

## Land

Only on the owner's request: `gh pr merge <n> --squash --delete-branch`.
