/**
 * The exit code of a rejected `execCommand`. Undefined when the process did not exit by itself:
 * spawn failure (`code` is a string like `ENOENT`) or a signal.
 *
 * @util
 */
export function getExitCode(error: unknown): number | undefined {
    if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'number') {
        return error.code;
    }

    return undefined;
}
