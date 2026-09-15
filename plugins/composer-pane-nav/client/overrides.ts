/**
 * Reads the user's own pane-focus shortcuts out of Paseo's override storage.
 *
 * The app persists Settings -> Keyboard Shortcuts rebinds through AsyncStorage,
 * which on web and desktop is localStorage, under
 * "@paseo:keyboard-shortcut-overrides" as JSON of shape
 * Record<bindingId, comboString | null>. A null value is the app's
 * UNASSIGNED_COMBO sentinel: the binding keeps its settings row but matches
 * nothing, so this plugin must skip it too.
 *
 * Reading the user's binding rather than inventing one is the whole point --
 * the plugin adds no shortcut of its own.
 *
 * Only overridden bindings are honoured; defaults are deliberately left alone.
 * The `editable: false` guard exists because the default chords
 * (Cmd+Shift+Arrow) are macOS's own "select to start/end of line", so lifting
 * it for a default would cost the user text selection inside the composer --
 * the very thing the guard protects. An override means the user picked that
 * chord on purpose, and for a chord like Cmd+[ there is nothing to collide with.
 */

import { parseCombo, type KeyCombo } from "./chord";
import { warn, type BrowserWindow } from "./dom";

const PREFERRED_STORAGE_KEY = "@paseo:keyboard-shortcut-overrides";
const STORAGE_KEY_FRAGMENT = "keyboard-shortcut-overrides";

/** Re-parsing on every modified keystroke is wasteful; a rebind lands well inside this. */
const CACHE_TTL_MS = 500;

/**
 * Binding ids from packages/app/src/keyboard/keyboard-shortcuts.ts:739-782.
 * Their defaults are Cmd+Shift+ArrowLeft/Right/Up/Down respectively.
 */
const PANE_FOCUS_BINDING_IDS: readonly string[] = [
  "workspace-pane-focus-left-cmd-shift-left",
  "workspace-pane-focus-right-cmd-shift-right",
  "workspace-pane-focus-up-cmd-shift-up",
  "workspace-pane-focus-down-cmd-shift-down",
];

let cachedCombos: KeyCombo[] | null = null;
let cachedAt = 0;

function findStorageKey(storage: BrowserWindow["localStorage"]): string | null {
  if (!storage) return null;
  if (storage.getItem(PREFERRED_STORAGE_KEY) !== null) return PREFERRED_STORAGE_KEY;
  // AsyncStorage's web backend is free to prefix keys, so fall back to a scan
  // instead of assuming the bare name.
  for (let index = 0; index < storage.length; index++) {
    const name = storage.key(index);
    if (name !== null && name.indexOf(STORAGE_KEY_FRAGMENT) !== -1) return name;
  }
  return null;
}

function readOverrides(win: BrowserWindow): Record<string, unknown> {
  const storage = win.localStorage;
  if (!storage) return {};
  const key = findStorageKey(storage);
  if (key === null) return {};
  const raw = storage.getItem(key);
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch (error) {
    warn("could not parse shortcut overrides; falling back to defaults", error);
    return {};
  }
}

function resolveCombos(win: BrowserWindow): KeyCombo[] {
  const overrides = readOverrides(win);
  const combos: KeyCombo[] = [];
  for (const bindingId of PANE_FOCUS_BINDING_IDS) {
    const override = overrides[bindingId];
    // Not a string covers both cases this skips: absent (still on its
    // colliding default) and null (UNASSIGNED_COMBO, deliberately unbound).
    if (typeof override !== "string") continue;
    const combo = parseCombo(override);
    if (combo === null) {
      warn('ignoring unparseable combo "' + override + '" for ' + bindingId);
      continue;
    }
    combos.push(combo);
  }
  return combos;
}

export function paneFocusCombos(win: BrowserWindow, now: number): KeyCombo[] {
  if (cachedCombos !== null && now - cachedAt < CACHE_TTL_MS) return cachedCombos;
  cachedCombos = resolveCombos(win);
  cachedAt = now;
  return cachedCombos;
}

/** Drops the cache so a reinstall re-reads storage immediately. */
export function resetCombosCache(): void {
  cachedCombos = null;
  cachedAt = 0;
}
