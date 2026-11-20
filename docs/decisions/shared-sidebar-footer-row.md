# Plugins share one sidebar footer row through globalThis

## Status

Accepted

## Context

Each Paseo sidebar footer item gets a full-width row of its own. keep-awake and claude-accounts take
two rows, which crowds the sidebar on a phone. Paseo's footer icon row (Hosts, Help, Settings) is app
code with no contribution slot (`docs/plugins.md` in `getpaseo/paseo`), and plugins have no API to
talk to each other. Paseo evaluates every client bundle with `globalThis.eval`
(`packages/app/src/plugins/evaluate.ts`), so the bundles share one realm.

## Options Considered

- **A. Ask Paseo for a footer action slot.** The right fix; needs an upstream change and a release.
- **B. A compact row per plugin.** Saves little: still one row per plugin.
- **C. A tray shared through `globalThis`.** Each item publishes its button; the first mounted item
  renders one row for all, the others render nothing.

## Decision

C, everywhere, not only on compact layouts. The tray lives in `client/footerTray/` of each plugin
that uses it, because a plugin cannot import another package; `scripts/footerTray.test.ts` keeps the
copies identical. The global's name carries a shape version (`__paseoPluginsFooterTrayV1`), so
plugins built from different versions keep separate rows.

## Consequences

- Settings still list every item; hiding one drops its button from the row.
- Popovers open through the row owner's item. Its row is not a kit `SidebarRow`, so on wide layouts
  the popover anchors to the footer section rather than the button.
- If Paseo isolates plugin realms, each plugin falls back to its own one-button row.
- When Paseo gains a footer action slot, move both plugins to it and delete the tray.
