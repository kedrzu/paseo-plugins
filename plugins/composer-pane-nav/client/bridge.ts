/**
 * Restores pane-focus shortcuts while the composer has focus.
 *
 * Why this is needed: workspace.pane.focus.{left,right,up,down} are the only
 * bindings in Paseo carrying `when: { editable: false }`
 * (packages/app/src/keyboard/keyboard-shortcuts.ts:743,754,765,776). The guard
 * drops them whenever the focus scope is "message-input" -- exactly when the
 * composer is focused. Rebinding in Settings does not lift it: buildEffectiveBindings
 * swaps only the combo, never `when`.
 *
 * How this works, in three steps through the app's own machinery:
 *
 *   1. Blur the composer. resolveKeyboardFocusScope falls back to
 *      document.activeElement, so without this the replay below resolves to
 *      "message-input" again and hits the same guard.
 *   2. Replay the pane-focus chord. The app's listener is capture-phase on
 *      window and runs first (the app mounts before plugins load), so by the
 *      time this handler sees the event the app has already declined it --
 *      intercepting is useless, it has to be fired again. This time the scope
 *      resolves to "other", the guard passes, and the pane switches.
 *   3. Replay "focus message input" (Cmd+L). Step 1 left the caret nowhere:
 *      focusPane moves the layout store's focusedPaneId and with it which
 *      composer counts as active, but nothing in the app moves DOM focus to
 *      follow. Without this step the old composer loses the caret and the new
 *      pane never receives it. If there was no adjacent pane to move to, this
 *      simply hands focus back to the composer we started in.
 *
 * Nothing fights us for the keystroke: packages/app/src/composer/ contains no
 * stopPropagation at all, and its key handler returns immediately for anything
 * that is not Enter.
 */

import { Platform } from "react-native";
import { comboToEventInit, matchesCombo } from "./chord";
import { resolvedCombos, resetCombosCache } from "./overrides";
import {
  afterRender,
  browserWindow,
  isMacHost,
  warn,
  type BrowserWindow,
  type KeyEvent,
  type KeyEventInit,
} from "./dom";

/** The composer's root marker, from packages/app/src/composer/input/input.tsx:1786. */
const COMPOSER_SELECTOR = "[data-testid='message-input-root']";

function isComposerFocused(win: BrowserWindow): boolean {
  const active = win.document?.activeElement;
  if (!active) return false;
  return active.closest(COMPOSER_SELECTOR) !== null;
}

function fire(win: BrowserWindow, init: KeyEventInit, synthetic: WeakSet<KeyEvent>): void {
  const KeyboardEventCtor = win.KeyboardEvent;
  if (!KeyboardEventCtor) return;
  const event = new KeyboardEventCtor("keydown", init);
  synthetic.add(event);
  win.dispatchEvent(event);
}

function eventToInit(event: KeyEvent): KeyEventInit {
  return {
    key: event.key,
    code: event.code,
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    bubbles: true,
    cancelable: true,
  };
}

export function installComposerPaneNav(): () => void {
  // Keyboard shortcuts are switched off entirely on native and compact layouts
  // (packages/app/src/keyboard/availability.ts), so there is nothing to restore.
  if (Platform.OS !== "web") return () => {};

  const win = browserWindow();
  if (!win) return () => {};

  const isMac = isMacHost(win);
  const synthetic = new WeakSet<KeyEvent>();
  let stopped = false;
  resetCombosCache();

  const handleKeyDown = (event: KeyEvent): void => {
    try {
      if (synthetic.has(event)) return;
      // Ordinary typing carries none of these, so bail before touching storage.
      if (!event.metaKey && !event.ctrlKey && !event.altKey) return;
      // Outside the composer the native path already works -- stay out of it.
      if (!isComposerFocused(win)) return;

      const combos = resolvedCombos(win, isMac, Date.now());
      for (const combo of combos.paneFocus) {
        if (!matchesCombo(combo, event, isMac)) continue;
        // The composer ignores non-Enter keys, but the browser still applies
        // native text editing for some chords (Cmd+Shift+Arrow selects a line).
        event.preventDefault();
        win.document?.activeElement?.blur?.();
        fire(win, eventToInit(event), synthetic);

        const focusInput = combos.focusInput;
        if (focusInput) {
          // The pane switch has to render before the new composer will answer
          // this, so let React flush first.
          afterRender(() => {
            if (stopped) return;
            try {
              fire(win, comboToEventInit(focusInput, isMac), synthetic);
            } catch (error) {
              warn("could not refocus the composer", error);
            }
          });
        }
        return;
      }
    } catch (error) {
      // A throw here must never cost the user a keystroke.
      warn("keydown bridge failed", error);
    }
  };

  win.addEventListener("keydown", handleKeyDown, true);
  return () => {
    stopped = true;
    win.removeEventListener("keydown", handleKeyDown, true);
    resetCombosCache();
  };
}
