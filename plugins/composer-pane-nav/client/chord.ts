/**
 * A trimmed re-implementation of Paseo's chord grammar.
 *
 * The app parses shortcut strings in packages/app/src/keyboard/shortcut-string.ts
 * and matches them in keyboard-shortcuts.ts. Neither is reachable from a plugin,
 * so the parts this plugin needs are mirrored here. Kept deliberately close to
 * the originals: divergence shows up as a shortcut that silently stops matching.
 *
 * Not mirrored: multi-combo chord sequences and the `Digit` wildcard. Neither can
 * appear in a pane-focus binding.
 */

import type { KeyEvent } from "./dom";

export interface KeyCombo {
  code: string;
  key?: string;
  shiftedKey?: string;
  codeFallback?: boolean;
  meta?: true;
  ctrl?: true;
  alt?: true;
  shift?: true;
  mod?: true;
}

interface KeyMapping {
  code: string;
  key?: string;
  shiftedKey?: string;
  codeFallback?: boolean;
}

const KEY_MAP: Record<string, KeyMapping> = {};

for (let i = 0; i < 26; i++) {
  const letter = String.fromCharCode(65 + i);
  KEY_MAP[letter] = { code: "Key" + letter, key: letter.toLowerCase() };
}

const SHIFTED_DIGITS = [")", "!", "@", "#", "$", "%", "^", "&", "*", "("];
for (let i = 0; i <= 9; i++) {
  KEY_MAP[String(i)] = { code: "Digit" + i, key: String(i), shiftedKey: SHIFTED_DIGITS[i] };
}

KEY_MAP["-"] = { code: "Minus", key: "-", shiftedKey: "_" };
KEY_MAP["="] = { code: "Equal", key: "=", shiftedKey: "+" };
KEY_MAP["\\"] = { code: "Backslash", key: "\\", shiftedKey: "|" };
KEY_MAP["["] = { code: "BracketLeft", key: "[", shiftedKey: "{" };
KEY_MAP["]"] = { code: "BracketRight", key: "]", shiftedKey: "}" };
KEY_MAP[";"] = { code: "Semicolon", key: ";", shiftedKey: ":" };
KEY_MAP["'"] = { code: "Quote", key: "'", shiftedKey: '"' };
KEY_MAP[","] = { code: "Comma", key: ",", shiftedKey: "<" };
KEY_MAP["."] = { code: "Period", key: ".", shiftedKey: ">" };
KEY_MAP["`"] = { code: "Backquote", key: "`", shiftedKey: "~" };
KEY_MAP["/"] = { code: "Slash", key: "/", shiftedKey: "?" };
KEY_MAP["?"] = { code: "Slash", key: "?" };
KEY_MAP["Space"] = { code: "Space", key: " ", codeFallback: true };
KEY_MAP["Enter"] = { code: "Enter", key: "Enter", codeFallback: true };
KEY_MAP["Backspace"] = { code: "Backspace" };
KEY_MAP["Escape"] = { code: "Escape" };
KEY_MAP["ArrowLeft"] = { code: "ArrowLeft" };
KEY_MAP["ArrowRight"] = { code: "ArrowRight" };
KEY_MAP["ArrowUp"] = { code: "ArrowUp" };
KEY_MAP["ArrowDown"] = { code: "ArrowDown" };
KEY_MAP["Tab"] = { code: "Tab" };
KEY_MAP["Delete"] = { code: "Delete" };
KEY_MAP["Home"] = { code: "Home" };
KEY_MAP["End"] = { code: "End" };
KEY_MAP["PageUp"] = { code: "PageUp" };
KEY_MAP["PageDown"] = { code: "PageDown" };
KEY_MAP["Insert"] = { code: "Insert" };

for (let i = 1; i <= 12; i++) {
  KEY_MAP["F" + i] = { code: "F" + i };
}

/** Returns null rather than throwing: a malformed override must not break typing. */
export function parseCombo(text: string): KeyCombo | null {
  const parts = text.split("+");
  if (parts.length === 0 || parts.some((part) => part === "")) return null;

  const combo: KeyCombo = { code: "" };
  let keyPart: string | null = null;

  for (const part of parts) {
    if (part === "Cmd") combo.meta = true;
    else if (part === "Ctrl") combo.ctrl = true;
    else if (part === "Alt") combo.alt = true;
    else if (part === "Shift") combo.shift = true;
    else if (part === "Mod") combo.mod = true;
    else if (keyPart !== null) return null;
    else keyPart = part;
  }

  if (keyPart === null) return null;
  const mapping = KEY_MAP[keyPart];
  if (!mapping) return null;

  combo.code = mapping.code;
  if (mapping.key !== undefined) {
    combo.key = mapping.key;
    if (mapping.shiftedKey !== undefined) combo.shiftedKey = mapping.shiftedKey;
    if (mapping.codeFallback === true) combo.codeFallback = true;
  }
  return combo;
}

function matchesKeyOrCode(combo: KeyCombo, event: KeyEvent): boolean {
  if (combo.key === undefined) return event.code === combo.code;
  const eventKey = event.key.toLowerCase();
  if (eventKey === combo.key) return true;
  if (combo.shift === true && combo.shiftedKey !== undefined && eventKey === combo.shiftedKey) {
    return true;
  }
  // macOS rewrites event.key while Option is held (Option+[ -> "“"), so
  // Alt-bound keys can only be matched by event.code.
  if (combo.alt === true && event.code === combo.code) return true;
  return combo.codeFallback === true && event.code === combo.code;
}

export function matchesCombo(combo: KeyCombo, event: KeyEvent, isMac: boolean): boolean {
  if (combo.mod) {
    if (isMac) {
      if (!event.metaKey) return false;
      if (!!combo.ctrl !== event.ctrlKey) return false;
    } else {
      if (!event.ctrlKey) return false;
      if (!!combo.meta !== event.metaKey) return false;
    }
  } else {
    if (!!combo.meta !== event.metaKey) return false;
    if (!!combo.ctrl !== event.ctrlKey) return false;
  }
  if (!!combo.alt !== event.altKey) return false;
  if (!!combo.shift !== event.shiftKey) return false;
  return matchesKeyOrCode(combo, event);
}
