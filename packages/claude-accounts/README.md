# claude-accounts

Switch between saved Claude Code logins from Paseo.

- **Sidebar footer row** with a menu: the current account, the saved accounts, and "Save current
  account".
- **Command Center items:** "Save current Claude account" and "Switch Claude account: <email>" for
  each saved account.

## Install

```bash
paseo plugin install /path/to/paseo-plugins/packages/claude-accounts
# or, from GitHub:
paseo plugin add kedrzu/paseo-plugins:packages/claude-accounts
```

Requires Paseo 0.15.0 or newer (`paseo-plugin.json`).

## Data and what is touched

- **Saved accounts:** `~/.claude-accounts/<dir>/` (`credentials.json`, `oauthAccount.json`, mode
  `0600` in a `0700` directory). `CLAUDE_ACCOUNTS_DIR` overrides the location. The layout is shared
  with `scripts/claude-account.sh` in the umbra repo, so both tools see the same accounts.
- **Read and written on a switch:** the `Claude Code-credentials` Keychain item and `oauthAccount`
  in `~/.claude.json`.
- **Network:** the OAuth token goes to `api.anthropic.com` only, to confirm whose it is before it is
  saved. See [the decision](../../docs/decisions/claude-accounts-token-owner-check.md).

## Limitations

- macOS only.
- One entry per email, even across organizations.
- A running Claude session that refreshes its token may overwrite a switch with its own account. The
  plugin asks for confirmation while Claude processes run and does not restart agents.
- The script's `save` regex rejects `@`, so script `use` cannot refresh the copy of an active
  account stored in an email-named directory, and warns instead. The fix is one character in the
  umbra repo.
- During a switch, tokens briefly appear in the argv of `security`. The script makes the same
  trade-off: `security -i` truncates long lines.
- The owner check uses an undocumented endpoint. If the warning "Could not confirm who owns the
  Keychain tokens" appears on every action, the endpoint does not behave as assumed.
