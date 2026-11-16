import type { execCommand } from '@getpaseo/plugin/server';

/**
 * The plugin host is Paseo's Electron binary run as Node, so its environment carries
 * `ELECTRON_RUN_AS_NODE` and the `NODE_CHANNEL_*` IPC handle. `open` hands its environment to an app
 * it launches: an Electron app that is not running yet (VS Code, Pen) then starts as a bare Node
 * process and exits without a window. An app that is already running only gets an open event, which
 * is why the bug shows only on a cold start.
 */
const LEAKED_ENV = /^(?:ELECTRON_|NODE_CHANNEL_)/;

/** Opens `path` with the app of `bundleId` (`open -b`), launching it if it is not running. */
export async function openWithApp(exec: typeof execCommand, bundleId: string, path: string): Promise<void> {
    await exec('open', ['-b', bundleId, path], { env: appEnv(process.env) });
}

/** The environment without what the plugin host leaks into apps `open` launches. */
export function appEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    return Object.fromEntries(Object.entries(env).filter(([name]) => !LEAKED_ENV.test(name)));
}
