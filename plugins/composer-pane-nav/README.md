# composer-pane-nav

Restores pane-focus shortcuts while the agent composer has focus.

## The problem

`workspace.pane.focus.{left,right,up,down}` are the only bindings in Paseo carrying
`when: { editable: false }`. That guard drops them whenever the keyboard focus scope is
`message-input` — precisely when you are typing to an agent. With two agents side by side in a
split, you cannot move between panes without reaching for the mouse or going through the
Command Center.

Rebinding in **Settings → Keyboard Shortcuts** does not help: `buildEffectiveBindings` swaps
only the binding's combo, never its `when`, so the guard travels with the binding whatever chord
you put on it.

## What this plugin does

It adds **no shortcut of its own**. It reads the pane-focus chords you already configured in
Paseo and makes them work inside the composer.

On a matching keystroke it blurs the composer and replays the event. The app's own handler then
resolves the focus scope to `other`, the guard passes, and the pane switches through the normal
code path.

### Only overridden bindings are honoured

If you left a pane-focus binding on its default `Cmd+Shift+Arrow`, the plugin ignores it — that
chord is macOS's own "select to start/end of line", which is the real reason the guard exists.
Lifting it would cost you text selection in the composer.

Override the binding and the plugin picks it up: choosing `Cmd+[` is a statement that you want
that chord for panes, and it collides with nothing in a text field. Changes in Settings apply
within about half a second, with no plugin reload.

Unassigning a binding disables it here too.

## Requirements

Desktop or web only. Keyboard shortcuts are switched off entirely on native and compact layouts,
so there is nothing to restore there.

## What this depends on, and how it breaks

This is a workaround, not a supported integration. The plugin SDK has no keyboard API at all, so
the plugin reaches around it and leans on four Paseo internals:

- the composer's DOM marker, `[data-testid='message-input-root']`
- the override storage key, `@paseo:keyboard-shortcut-overrides`
- the four pane-focus binding ids
- Paseo's chord string grammar, re-implemented in `client/chord.ts`

Any of these can change in a Paseo release, which is why `requirements.paseo` is pinned to
`>=0.8.0 <0.9.0`. When it breaks it fails quiet — the shortcut simply stops working in the
composer — and never costs you a keystroke: the handler is wrapped so a throw cannot escape.

It works at all only because Paseo evaluates plugin client bundles with `globalThis.eval` inside
the app's own realm, so `window` and `document` are the app's real ones. The module graph is
allowlisted; globals are not.

## The real fix

This belongs upstream. The guard is attached to the *binding* when it should be a property of the
*chord* — computed from the parsed combo, so `Cmd+[` passes and `Cmd+A` stays protected. That
would delete the need for this plugin. Worth a PR to `getpaseo/paseo`.

Two related gaps, same area: pane-focus bindings are `mac: true` only, so this navigation does
not exist on Windows or Linux; and the plugin SDK has no way to register a keybinding or to
invoke a built-in action.
