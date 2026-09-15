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
 * How this works: the app's own listener is capture-phase on window and runs
 * first (the app mounts before plugins load), so by the time this handler sees
 * the event the app has already declined it. Intercepting is therefore useless;
 * the event has to be replayed. Blurring first is what makes the replay land --
 * resolveKeyboardFocusScope falls back to document.activeElement, so without the
 * blur the replay resolves to "message-input" again and hits the same guard.
 *
 * Nothing fights us for the keystroke: packages/app/src/composer/ contains no
 * stopPropagation at all, and its key handler returns immediately for anything
 * that is not Enter.
 */

import { Platform } from "react-native";
import { matchesCombo } from "./chord";
import { paneFocusCombos, resetCombosCache } from "./overrides";
import { browserWindow, isMacHost, warn, type BrowserWindow, type KeyEvent } from "./dom";

/** The composer's root marker, from packages/app/src/composer/input/input.tsx:1786. */
const COMPOSER_SELECTOR = "[data-testid='message-input-root']";

function isComposerFocused(win: BrowserWindow): boolean {
  const active = win.document?.activeElement;
  if (!active) return false;
  return active.closest(COMPOSER_SELECTOR) !== null;
}

function replay(win: BrowserWindow, event: KeyEvent, synthetic: WeakSet<KeyEvent>): void {
  const KeyboardEventCtor = win.KeyboardEvent;
  if (!KeyboardEventCtor) return;
  const replayed = new KeyboardEventCtor("keydown", {
    key: event.key,
    code: event.code,
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    bubbles: true,
    cancelable: true,
  });
  synthetic.add(replayed);
  win.dispatchEvent(replayed);
}

export function installComposerPaneNav(): () => void {
  // Keyboard shortcuts are switched off entirely on native and compact layouts
  // (packages/app/src/keyboard/availability.ts), so there is nothing to restore.
  if (Platform.OS !== "web") return () => {};

  const win = browserWindow();
  if (!win) return () => {};

  const isMac = isMacHost(win);
  const synthetic = new WeakSet<KeyEvent>();
  resetCombosCache();

  const handleKeyDown = (event: KeyEvent): void => {
    try {
      if (synthetic.has(event)) return;
      // Ordinary typing carries none of these, so bail before touching storage.
      if (!event.metaKey && !event.ctrlKey && !event.altKey) return;
      // Outside the composer the native path already works -- stay out of it.
      if (!isComposerFocused(win)) return;

      for (const combo of paneFocusCombos(win, Date.now())) {
        if (!matchesCombo(combo, event, isMac)) continue;
        // The composer ignores non-Enter keys, but the browser still applies
        // native text editing for some chords (Cmd+Shift+Arrow selects a line).
        event.preventDefault();
        win.document?.activeElement?.blur?.();
        replay(win, event, synthetic);
        return;
      }
    } catch (error) {
      // A throw here must never cost the user a keystroke.
      warn("keydown bridge failed", error);
    }
  };

  win.addEventListener("keydown", handleKeyDown, true);
  return () => {
    win.removeEventListener("keydown", handleKeyDown, true);
    resetCombosCache();
  };
}
