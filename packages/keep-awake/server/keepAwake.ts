/** The part of a child process the session uses; a test passes a fake. */
export interface AwakeProcess {
    kill(): void;
    once(event: 'exit', listener: () => void): void;
}

export interface CreateKeepAwakeParams {
    /** Starts `caffeinate` with these arguments. */
    spawn: (args: string[]) => AwakeProcess;
    now: () => number;
    /** The plugin host's PID: `caffeinate -w` exits with it, so a crashed host leaves no orphan. */
    hostPid: number;
}

export interface KeepAwake {
    /** `null` when nothing keeps the Mac awake. */
    getEndsAt(): number | null;
    extend(minutes: number): number;
    stop(): void;
}

/**
 * One `caffeinate -i` session at a time. Extending restarts it with the new remaining time, because
 * `caffeinate` cannot change its timeout while running. `-i` prevents idle sleep only: the display
 * still dims and sleeps, and closing the lid on battery still sleeps the Mac.
 */
export function createKeepAwake({ spawn, now, hostPid }: CreateKeepAwakeParams): KeepAwake {
    let session: { process: AwakeProcess; endsAt: number } | null = null;

    return { getEndsAt, extend, stop };

    function getEndsAt(): number | null {
        if (session === null || session.endsAt <= now()) {
            return null;
        }
        return session.endsAt;
    }

    function extend(minutes: number): number {
        const start = Math.max(now(), getEndsAt() ?? 0);
        const endsAt = start + minutes * 60_000;
        const seconds = Math.ceil((endsAt - now()) / 1000);

        stop();
        const process = spawn(['-i', '-t', String(seconds), '-w', String(hostPid)]);
        const current = { process, endsAt };
        session = current;
        process.once('exit', () => {
            // A replaced session's exit must not end the one that replaced it.
            if (session === current) {
                session = null;
            }
        });
        return endsAt;
    }

    function stop(): void {
        if (session === null) {
            return;
        }
        const { process } = session;
        session = null;
        process.kill();
    }
}
