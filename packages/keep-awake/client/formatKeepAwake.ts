/**
 * The sidebar label: off, or the local end time and what is left. Formatted by hand, because
 * `Intl` time formatting differs between the React Native engines the app runs on.
 * @__NO_SIDE_EFFECTS__
 */
export function formatKeepAwake(endsAt: number | null, now: number): string {
    if (endsAt === null || endsAt <= now) {
        return 'Keep awake: off';
    }
    const end = new Date(endsAt);
    const time = `${end.getHours()}:${String(end.getMinutes()).padStart(2, '0')}`;
    return `Awake until ${time} (${formatDuration(endsAt - now)})`;
}

function formatDuration(milliseconds: number): string {
    const minutes = Math.ceil(milliseconds / 60_000);
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours === 0) {
        return `${rest} min`;
    }
    return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
