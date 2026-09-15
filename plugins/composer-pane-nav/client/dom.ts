/**
 * The plugin tsconfig has no DOM lib on purpose (see tsconfig.base.json), so
 * this module declares the slice of the browser API the plugin touches. Same
 * approach as plugins/hello/client/web.ts.
 *
 * These are the app's real globals: Paseo evaluates the client bundle with
 * `globalThis.eval` inside the app's own realm, so there is no separate window.
 */

export interface KeyEvent {
  readonly key: string;
  readonly code: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly repeat: boolean;
  preventDefault(): void;
}

export interface KeyEventInit {
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  bubbles: boolean;
  cancelable: boolean;
}

export interface DomElement {
  closest(selector: string): DomElement | null;
  blur?: () => void;
}

export interface LocalStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(name: string): string | null;
}

export interface BrowserWindow {
  addEventListener(type: "keydown", handler: (event: KeyEvent) => void, capture: boolean): void;
  removeEventListener(type: "keydown", handler: (event: KeyEvent) => void, capture: boolean): void;
  dispatchEvent(event: KeyEvent): boolean;
  readonly document?: { readonly activeElement: DomElement | null };
  readonly localStorage?: LocalStorage;
  readonly navigator?: { readonly platform?: string; readonly userAgent?: string };
  readonly KeyboardEvent?: new (type: string, init: KeyEventInit) => KeyEvent;
}

declare const window: BrowserWindow | undefined;
declare const console: { warn(...args: unknown[]): void };

/** The host window, or undefined wherever the pieces this plugin needs are missing. */
export function browserWindow(): BrowserWindow | undefined {
  if (typeof window === "undefined" || window === undefined) return undefined;
  if (!window.document || !window.KeyboardEvent) return undefined;
  return window;
}

export function isMacHost(win: BrowserWindow): boolean {
  const nav = win.navigator;
  return /mac/i.test(nav?.platform ?? nav?.userAgent ?? "");
}

export function warn(message: string, error?: unknown): void {
  if (typeof console === "undefined") return;
  console.warn("[composer-pane-nav] " + message, error);
}
