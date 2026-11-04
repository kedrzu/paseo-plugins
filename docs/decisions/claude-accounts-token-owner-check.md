# claude-accounts confirms the token owner through the OAuth profile endpoint

## Status

Accepted

## Context

Claude Code tokens rotate, so a switch refreshes the outgoing account's saved copy from the
Keychain. Under Paseo many Claude processes run (18 measured 2026-11-04). The comment in
`claude-account.sh` says a running session that refreshes its token may write it back. Then the
Keychain holds A's tokens while `oauthAccount` says B. Attributing the tokens by `oauthAccount`
stores A's tokens in B's copy, and B's tokens are lost until `/login`.

Evidence:

- **Checked 2026-11-04:** `claude auth status --json` does not verify the token. With a fake token
  and a planted `oauthAccount` it reports `loggedIn: true` and the planted email (Claude Code
  2.1.318).
- **Checked 2026-11-04:** `/api/oauth/profile` appears in the Claude Code 2.1.318 binary and in
  neither the CLI reference nor the authentication docs.
- **Unverified:** that it returns `account.email`, and that `anthropic-beta: oauth-2025-04-20` is the
  right header. A one-off test with the real token was blocked by the `block_secret_leaks`
  guardrail.

## Options Considered

- **A. `oauthAccount` only** (the script's behaviour). No network call; keeps the failure.
- **B. `claude auth status`.** Documented, but it reads the same local field, so it cannot detect
  the case.
- **C. The profile endpoint.** Detects it. Undocumented; sends the token to `api.anthropic.com`
  only; may break without notice.
- **D. Do not refresh copies.** No poisoning, but after a rotation returning to an account needs
  `/login`, which the feature exists to avoid.

## Decision

C, chosen by the owner. On any non-success the plugin falls back to A and shows a warning, so the
worst case equals the script's.

## Consequences

- One network call per save or switch.
- The token leaves the daemon only for `api.anthropic.com`, and redirects are refused.
- Drift of the endpoint shows as a warning, not as a failure.
