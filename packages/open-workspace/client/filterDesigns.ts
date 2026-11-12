/**
 * The designs whose path contains every whitespace-separated word of the query, ignoring case, so
 * "app home" finds `ui/app/home.pen`. An empty query keeps them all.
 * @__NO_SIDE_EFFECTS__
 */
export function filterDesigns(files: readonly string[], query: string): string[] {
    const words = query
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word !== '');
    return files.filter(file => {
        const path = file.toLowerCase();
        return words.every(word => path.includes(word));
    });
}
